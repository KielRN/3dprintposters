# Meshy Service Implementation Plan

Status: living implementation plan
Last updated: 2026-05-25

## Purpose

This document is the growing technical plan for the Meshy-backed figurine service. Use it with `CHECKLIST.md`:

- `CHECKLIST.md`: PM-facing current state, next tasks, blockers, and done criteria.
- This file: implementation details, Meshy API calls that work, calls that fail, coding decisions, service shape, and run findings.
- `AI_DEVELOPER_NOTES.md`: compact memory and pointers only.

Keep detailed Meshy experiments and service decisions here so the checklist and AI notes stay short.

## Immediate Goal

Recreate the customer workflows in `docs/MESHY_FIGURINE_UI_WORKFLOW.md` using Meshy behind the server-side provider boundary.

The first workflow to prove is:

1. User uploads an image.
2. User selects `Emoji / avatar` style.
3. User selects `Natural pose`.
4. Backend generates an Emoji-style 2D concept proof.
5. User approves the concept.
6. Backend submits the approved concept to Meshy Image to 3D.
7. Backend downloads GLB/STL/3MF artifacts.
8. Job page shows the standalone figurine preview and readiness/warning state.

Important scope note: the 2026-05-24 raw-photo Meshy run proved the API and download path, but it skipped the product workflow's 2D concept step. The next Meshy runs should use an Emoji/avatar proof or a full-body source that matches the intended customer flow.

Current goal from the checklist:

- Generate at least one successful Meshy figurine output from an Emoji/avatar-style Natural pose input.
- Inspect the downloaded GLB/STL/3MF in slicer software.
- Classify Meshy output quality as promising, weak, or not viable.
- Use real results to decide the first supported style/posture options.

## Current Architecture Decision

Meshy must be behind a server-side generated-3D provider boundary. The browser should never submit provider API keys, hold durable Meshy asset URLs, or make direct Meshy generation calls.

Target production flow:

1. User uploads a source photo.
2. Backend validates image ownership, file type, size, decode, and suitability.
3. Backend creates or selects a figurine-friendly 2D concept proof. The first implementation target is Emoji/avatar style.
4. User approves the concept.
5. Backend submits the approved concept to Meshy. Raw photo submission remains a diagnostic fallback, not the intended first product path.
6. Backend tracks Meshy status through polling and/or webhook events.
7. Backend downloads GLB/STL/3MF/thumbnails/textures into project Storage before Meshy retention expires.
8. Backend records model readiness and warnings.
9. Job page shows our stored GLB and readiness state.
10. Checkout/preorder/lead capture stays gated until the active model and fulfillment path are honestly represented.

## Meshy API Calls That Work

### Create Image To 3D Task

Endpoint:

```text
POST https://api.meshy.ai/openapi/v1/image-to-3d
```

Confirmed working local request shape:

```json
{
  "image_url": "data:image/jpeg;base64,<redacted>",
  "ai_model": "meshy-6",
  "model_type": "standard",
  "should_texture": true,
  "enable_pbr": false,
  "should_remesh": true,
  "target_polycount": 100000,
  "save_pre_remeshed_model": true,
  "image_enhancement": true,
  "remove_lighting": true,
  "moderation": true,
  "target_formats": ["glb", "stl", "3mf"]
}
```

Notes:

- Base64 data URI input works for local testing. This avoids creating a temporary public image URL.
- `3mf` must be explicitly requested.
- `should_texture: true` with Meshy-6 consumed 30 credits in the first successful run.
- Meshy API assets expire after a short retention window, so every successful task must be ingested immediately.
- For the first `Natural pose` workflow, keep posture as product metadata and omit provider-specific pose overrides until a Meshy mapping is verified. If later Meshy runs require `pose_mode`, record the exact working value here.

### Poll Image To 3D Task

Endpoint:

```text
GET https://api.meshy.ai/openapi/v1/image-to-3d/{taskId}
```

Confirmed returned useful fields:

- `id`
- `type`
- `status`
- `progress`
- `created_at`
- `started_at`
- `finished_at`
- `expires_at`
- `consumed_credits`
- `task_error`
- `model_urls`
- `thumbnail_url`
- `thumbnail_urls`
- `texture_urls`

Terminal statuses observed or handled by the local runner:

- `SUCCEEDED`
- `FAILED`
- `CANCELED`
- `EXPIRED`

### Create Analyze Printability Task

Endpoint:

```text
POST https://api.meshy.ai/openapi/v1/print/analyze
GET https://api.meshy.ai/openapi/v1/print/analyze/{taskId}
```

Confirmed working request shape:

```json
{
  "input_task_id": "<succeeded-meshy-6-image-to-3d-task-id>"
}
```

Notes:

- This avoids re-uploading a downloaded model because Meshy can analyze a succeeded task we own.
- The 2026-05-24 Emoji/avatar run consumed `0` credits for printability analysis.
- The result should feed our readiness gate, not checkout directly. A visually promising model can still be `error` for printability.

### Create Image To Image Multi-View Task

Endpoint:

```text
POST https://api.meshy.ai/openapi/v1/image-to-image
GET https://api.meshy.ai/openapi/v1/image-to-image/{taskId}
```

Prepared Experiment 002 request shape:

```json
{
  "ai_model": "gpt-image-2",
  "prompt": "<emoji-avatar-natural-multiview-prompt>",
  "reference_image_urls": ["data:image/jpeg;base64,<redacted>"],
  "generate_multi_view": true
}
```

Notes:

- Meshy Image to Image accepts `1` to `5` reference images.
- `generate_multi_view: true` asks Meshy to create a multi-view image set for the same character.
- Experiment 002 uses this as the next style/proportion control step instead of asking Vertex/Gemini for one front-facing concept only.

### Create Multi-Image To 3D Task

Endpoint:

```text
POST https://api.meshy.ai/openapi/v1/multi-image-to-3d
GET https://api.meshy.ai/openapi/v1/multi-image-to-3d/{taskId}
```

Prepared Experiment 002 request shape:

```json
{
  "input_task_id": "<succeeded-image-to-image-multiview-task-id>",
  "ai_model": "meshy-6",
  "should_texture": true,
  "enable_pbr": false,
  "should_remesh": true,
  "target_polycount": 100000,
  "save_pre_remeshed_model": true,
  "image_enhancement": true,
  "remove_lighting": true,
  "moderation": true,
  "target_formats": ["glb", "stl", "3mf"]
}
```

Notes:

- Meshy Multi-Image to 3D accepts either a succeeded API image-generation task id or `1` to `4` direct image URLs/data URIs.
- Experiment 002 uses `input_task_id` so the generated multi-view images stay linked to the 3D task.
- Analyze Printability supports succeeded Multi-Image to 3D task ids, so the runner analyzes the model task after assets are downloaded.

## Local Runner

Scripts:

- `scripts/meshy/create-image-to-3d-job.mjs`
- `scripts/meshy/run-emoji-natural-experiment.mjs`
- `scripts/meshy/run-emoji-natural-multiview-experiment.mjs`
- `scripts/meshy/analyze-printability-task.mjs`

Package command:

```powershell
npm run meshy:first-job
npm run meshy:emoji-natural-experiment
npm run meshy:exp-002-multiview
npm run meshy:analyze-printability -- 019e5c65-7b2b-7641-abd6-ed04fb4e3d2e .tmp/experiments/meshy/emoji-natural-2026-05-24T23-50-06-305Z/meshy/2026-05-24T23-50-17-997Z-019e5c65-7b2b-7641-abd6-ed04fb4e3d2e
```

Warning: `meshy:first-job`, `meshy:emoji-natural-experiment`, and `meshy:exp-002-multiview` create new paid Meshy tasks and consume credits when Meshy accepts the request. `meshy:analyze-printability` only analyzes an existing task.

What it does:

- Loads `MESHY_API_KEY` from the process environment or ignored local `.env`.
- Sends the local image as a base64 data URI.
- Polls until a terminal task status.
- Downloads returned models, thumbnails, and textures under `.tmp/print-files/meshy/{timestamp}-{taskId}/`.
- Writes sanitized metadata only. It redacts base64 payloads and does not store provider asset URLs in tracked files.
- The Emoji/Natural experiment script first uses `VERTEX_API_KEY` to create a full-body Emoji/avatar 2D concept, then sends that concept through the existing Meshy image-to-3D runner.
- The Experiment 002 multi-view script creates a Meshy Image-to-Image task with `generate_multi_view: true`, submits the succeeded image task to Meshy Multi-Image-to-3D, downloads GLB/STL/3MF assets, and runs Meshy Analyze Printability.
- The printability script creates a Meshy print-analysis task for an existing succeeded Meshy task and writes sanitized printability output next to the model artifacts.

Default local input:

- `E:\PROJECTS\3DPrintPosters\.tmp\Profile-Pic-HIMSS.jpg`

Default local output root:

- `E:\PROJECTS\3DPrintPosters\.tmp\print-files`

## Run Findings

### 2026-05-23 Webhook Verification Failure

Task:

- `019e562e-06ea-7e78-b3e6-98651023fae2`

Result:

- Meshy sent real `PENDING` and `FAILED` webhook events.
- The task failed at 15% progress.
- Consumed credits: `0`
- Useful finding: webhook delivery and secret-header enforcement work.
- Not useful for output quality: no successful model was generated.

### 2026-05-24 First Successful API Output

Task:

- `019e5b9a-97a2-7788-8174-5cbc9913766f`

Input:

- `.tmp/Profile-Pic-HIMSS.jpg`

Output bundle:

- `.tmp/print-files/meshy/2026-05-24T20-08-40-270Z-019e5b9a-97a2-7788-8174-5cbc9913766f`

Provider result:

- Status: `SUCCEEDED`
- Consumed credits: `30`
- Created: `2026-05-24T20:08:39.987Z`
- Finished: `2026-05-24T20:11:04.027Z`
- Provider asset expiration: `2026-05-27T20:11:04.027Z`
- Returned formats: `glb`, `stl`, `3mf`, `pre_remeshed_glb`

Downloaded files:

- `model.glb`: 8,228,492 bytes
- `model.stl`: 5,003,384 bytes
- `model.3mf`: 1,249,224 bytes
- `model.pre-remeshed.glb`: 5,621,588 bytes
- `thumbnail.png`: 86,011 bytes
- `textures/texture-0-base_color.png`: 5,555,478 bytes
- `textures/texture-0-normal.png`: 3,331,763 bytes

Basic local inspection:

- `model.glb` has a valid `glTF` header.
- `model.stl` is a binary STL with 100,066 faces.
- `model.3mf` is a valid ZIP-based 3MF package with Bambu Studio metadata and millimeter units.
- `trimesh` loaded the 3MF as one mesh with approximate extents `58.9mm x 28.8mm x 75.0mm`.
- `trimesh` reported the mesh as not watertight for GLB/STL/3MF.

Visual/product finding:

- The output is recognizable from the profile photo.
- It is a bust/torso, not a full product figurine.
- Arms are truncated, hands are missing, and the lower body is absent.
- Elliot downloaded the GLB and opened it in Blender; the file is viewable, but the style is not the target product style at all.
- This validates API submission, polling, downloading, and local artifact handling.
- This does not validate sellable output quality.

Next test implication:

- Use a full-body source or an approved full-body, figurine-friendly 2D proof before judging Meshy as a product provider.
- Do not use the raw-photo output as a visual target. It is an off-style pipeline artifact.
- Slicer inspection is still required for repair warnings, supports, print time, material estimate, and printability.

### 2026-05-24 Emoji/avatar Natural Pose Proof-Driven Output

Task:

- Image-to-3D: `019e5c65-7b2b-7641-abd6-ed04fb4e3d2e`
- Printability analysis: `019e5c69-3d55-76ec-aecf-7cd728e6ed38`

Input:

- Source photo: `.tmp/Profile-Pic-HIMSS.jpg`
- Generated concept: `.tmp/experiments/meshy/emoji-natural-2026-05-24T23-50-06-305Z/concept.png`

Output bundle:

- `.tmp/experiments/meshy/emoji-natural-2026-05-24T23-50-06-305Z/meshy/2026-05-24T23-50-17-997Z-019e5c65-7b2b-7641-abd6-ed04fb4e3d2e`

Provider result:

- Status: `SUCCEEDED`
- Consumed credits: `30`
- Created: `2026-05-24T23:50:17.516Z`
- Finished: `2026-05-24T23:51:55.717Z`
- Provider asset expiration: `2026-05-27T23:51:55.717Z`
- Returned formats: `glb`, `stl`, `3mf`, `pre_remeshed_glb`

Downloaded files:

- `model.glb`: 8,854,544 bytes
- `model.stl`: 5,036,984 bytes
- `model.3mf`: 1,242,274 bytes
- `model.pre-remeshed.glb`: 4,237,796 bytes
- `thumbnail.png`: 72,570 bytes
- `textures/texture-0-base_color.png`: 5,298,032 bytes
- `textures/texture-0-normal.png`: 3,319,123 bytes

Basic local inspection:

- `trimesh` loaded the 3MF as one scene mesh with approximate extents `45.6mm x 23.0mm x 75.0mm`.
- The STL/3MF/GLB have `100,738` faces after remesh.
- Local `trimesh` inspection reported the mesh as not watertight.

Meshy printability result:

- Status: `error`
- Issues: `3`
- Errors: `2`
- Warnings: `1`
- Metrics: `is_watertight: false`, `non_manifold_edges: 125`, `degenerate_faces: 112`, `holes: 0`, `volume: 0.35887301414325945`
- Consumed credits: `0`

Visual/product finding:

- The generated 2D concept successfully followed the intended full-body Emoji/avatar Natural pose direction.
- Meshy's thumbnail preserved a complete stylized full-body figure, including head, torso, arms, legs, and feet. This is a clear improvement over the raw-photo bust/torso run.
- The model still is not automatically print-ready. It needs repair/slicer validation before any checkout promise.

Next test implication:

- Treat Emoji/avatar + Natural pose as visually promising but not fulfillment-ready.
- Run Meshy Repair Printability or slicer repair on this exact task/output before judging fulfillment viability.
- Human slicer review should compare this proof-driven output against the raw-photo output and record repair warnings, supports, stability, scale, and print time.

### Experiment 002 Run: Emoji/avatar Natural Pose Multi-View

Status:

- Completed on 2026-05-25.

Runner:

- `scripts/meshy/run-emoji-natural-multiview-experiment.mjs`
- Package command: `npm run meshy:exp-002-multiview`

Completed sequence:

1. Use `.tmp/Profile-Pic-HIMSS.jpg` as the default reference image unless Elliot provides additional references.
2. Create a Meshy Image-to-Image task with `generate_multi_view: true`.
3. Download the generated multi-view reference images under `.tmp/experiments/meshy/exp-002-emoji-natural-multiview-*`.
4. Submit the succeeded image task id to Meshy Multi-Image-to-3D.
5. Download GLB/STL/3MF/pre-remesh/thumbnail/texture assets.
6. Run Meshy Analyze Printability on the Multi-Image-to-3D task.

Run output:

- Run directory: `.tmp/experiments/meshy/exp-002-emoji-natural-multiview-2026-05-25T11-50-24-757Z`
- Image task: `019e5ef8-cc6c-7540-9b86-f8d0f519bc9d`
- Image task status: `SUCCEEDED`
- Image task credits: `12`
- Downloaded multi-view references: `multiview/view-1.png`, `multiview/view-2.png`, `multiview/view-3.png`
- Model task: `019e5ef9-cc0d-758e-b1c2-f0a61932e3b6`
- Model task status: `SUCCEEDED`
- Model task credits: `30`
- Downloaded model assets: `model.glb` (`8245860` bytes), `model.stl` (`5068634` bytes), `model.3mf` (`1232108` bytes), `model.pre-remeshed.glb` (`4124516` bytes), `thumbnail.png`, base-color texture, and normal texture.
- Printability task: `019e5efc-09fc-7db6-a22a-a4eb50f9b338`
- Printability task credits: `0`
- Printability status: `error`
- Printability metrics: `is_watertight: false`, `non_manifold_edges: 57`, `degenerate_faces: 127`, `holes: 0`, `volume: 0.2348952340067803`

Experiment question:

- Does Meshy's own multi-view prep improve full-body consistency and printability compared with Experiment 001's single front-facing concept?

Initial answer:

- Printability did improve on non-manifold edge count compared with Experiment 001 (`57` versus `125`), but degenerate faces increased (`127` versus `112`), and the model still failed Meshy's own printability gate.
- Human visual and slicer review are still required before judging whether the multi-view path is product-promising.

### Experiment 002 B Run: Emoji/avatar Natural Pose Multi-View With Base

Status:

- Completed on 2026-05-25.

Runner:

- `scripts/meshy/run-emoji-natural-multiview-experiment.mjs`
- Package command: `npm run meshy:exp-002b-base`

Prompt/control changes from Experiment 002:

- Added `human-tasks/printu-15 - Base.png` as a second reference image.
- Added `--base-label Elliott`.
- Added `--experiment-slug exp-002b-emoji-natural-base`.
- The prompt asked for a single round gray display pedestal, physically attached to the feet, with a centered front nameplate/sign reading exactly `Elliott`.

Run output:

- Run directory: `.tmp/experiments/meshy/exp-002b-emoji-natural-base-2026-05-25T12-33-03-165Z`
- Image task: `019e5f1f-d682-77d3-b332-0808a10a1d34`
- Image task status: `SUCCEEDED`
- Image task credits: `12`
- Downloaded multi-view references: `multiview/view-1.png`, `multiview/view-2.png`, `multiview/view-3.png`
- Model task: `019e5f20-db96-79f3-9169-943c310121cd`
- Model task status: `SUCCEEDED`
- Model task credits: `30`
- Downloaded model assets: `model.glb` (`9477328` bytes), `model.stl` (`5081734` bytes), `model.3mf` (`1236968` bytes), `model.pre-remeshed.glb` (`6353696` bytes), `thumbnail.png`, base-color texture, and normal texture.
- Printability task: `019e5f23-4277-7abb-b7fc-9a4396b0d3e5`
- Printability task credits: `0`
- Printability status: `error`
- Printability metrics: `is_watertight: false`, `non_manifold_edges: 70`, `degenerate_faces: 84`, `holes: 0`, `volume: 0.42722485756052014`

Visual/product finding:

- The Image-to-Image multi-view references handled the base request well. `view-1.png` shows a round gray base with a centered front plaque and legible `Elliott` text; the side/back views keep the pedestal consistent.
- The final Meshy 3D thumbnail includes the base, but the `Elliott` lettering appears garbled. This suggests base geometry may be viable from Meshy, while precise customer text likely needs deterministic mesh/text post-processing after provider generation.

Printability comparison:

- Compared with Experiment 002, Experiment 002 B worsened non-manifold edges (`70` versus `57`) but improved degenerate faces (`84` versus `127`).
- The core fulfillment blocker remains unchanged: Meshy's own printability analysis still returns `error`.

### Experiment 002 Closure

Status:

- Closed on 2026-05-25.

Conclusion:

- Meshy's multi-view image generation can create an attractive base/nameplate reference.
- Meshy's final 3D task should not be trusted to preserve precise product text or decorative base details.
- Continue with deterministic post-Meshy base geometry rather than more prompt-only base/nameplate attempts.

### Experiment 003 Prepared: Deterministic PrintU-Star Base After Meshy

Status:

- Prepared, not run yet.

Runner:

- `scripts/meshy/run-emoji-natural-multiview-experiment.mjs`
- `scripts/meshy/add_printu_star_base.py`
- Package command: `npm run meshy:exp-003-deterministic-base`

Planned sequence:

1. Use `.tmp/Profile-Pic-HIMSS.jpg` as the default reference image.
2. Create the same Meshy Image-to-Image multi-view task as Experiment 002, without asking Meshy to generate a base.
3. Submit the succeeded image task id to Meshy Multi-Image-to-3D.
4. Download Meshy's GLB/STL/3MF/pre-remesh/thumbnail/texture assets.
5. Run Meshy Analyze Printability against Meshy's original Multi-Image-to-3D task.
6. Locally load Meshy's downloaded `model.stl`.
7. Center and lift the Meshy figure onto a deterministic round pedestal.
8. Add a locally generated PrintU-style raised five-point star on the top center of the base.
9. Export postprocessed assets under `postprocessed/printu-star/`:
   - `model-with-printu-star-base.stl`
   - `model-with-printu-star-base.glb`
   - `model-with-printu-star-base.3mf`
   - `printu-star-base-only.stl`
   - `postprocess.metadata.json`

Implementation notes:

- The deterministic postprocessor uses `trimesh`, which is already installed locally and listed as the print-file generator's experiment dependency.
- The base is a beveled round cylinder with deterministic dimensions derived from the Meshy figure's bounds.
- The raised star is actual local mesh geometry, not texture or prompt-generated detail.
- Experiment 003 does not add customer name text yet. It validates the deterministic base/star approach first.
- The postprocessor intentionally does not repair Meshy's non-watertight body. Slicer review should distinguish provider mesh defects from deterministic base behavior.

Setup verification:

- `node --check scripts/meshy/run-emoji-natural-multiview-experiment.mjs`
- `python -m py_compile scripts/meshy/add_printu_star_base.py`
- Local no-credit smoke test against the Experiment 002 STL exported STL/GLB/3MF under `.tmp/experiments/meshy/exp-003-setup-smoke/postprocessed/printu-star/`.
- Smoke test finding: the base-only mesh is watertight; the combined mesh still inherits the original Meshy body's non-watertight status.

## Service Contract To Implement

### First Workflow Contract

The first service slice should support only the narrow path needed to reproduce the UI workflow:

```json
{
  "productType": "figurine",
  "figurineStyle": "emoji_avatar",
  "postureMode": "natural",
  "conceptSource": "generated_2d_proof",
  "generated3dProvider": "meshy"
}
```

Do not broaden this into every style/posture before the Emoji/Natural path works end to end.

### Provider Interface

Create a generated-3D provider interface with Meshy as the first implementation.

Suggested responsibilities:

- Submit a model-generation task.
- Poll task status.
- Normalize provider status and errors.
- Enumerate available model, thumbnail, and texture URLs.
- Download provider assets into durable project storage.
- Return sanitized provider audit metadata.

Do not expose provider URLs or credentials to the browser.

### Firestore Model State

Add model-generation state to figurine jobs. Minimum useful shape:

```json
{
  "productType": "figurine",
  "models": [
    {
      "modelId": "model_...",
      "provider": "meshy",
      "providerTaskId": "...",
      "status": "submitted_to_provider",
      "progress": 0,
      "requestedFormats": ["glb", "stl", "3mf"],
      "availableFormats": [],
      "storagePaths": {},
      "warnings": [],
      "consumedCredits": null,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "selectedModelId": "model_...",
  "readinessStatus": "generating",
  "checkoutEligibility": {
    "eligible": false,
    "reason": "3D model is still generating."
  }
}
```

Expected model statuses:

- `queued`
- `submitted_to_provider`
- `provider_running`
- `asset_downloading`
- `packaging`
- `needs_review`
- `preview_ready`
- `printability_warning`
- `print_ready`
- `failed`

### Storage Layout

Use durable job-scoped storage for provider artifacts:

```text
print-files/{uid}/{jobId}/figurine/{modelId}/model.glb
print-files/{uid}/{jobId}/figurine/{modelId}/model.stl
print-files/{uid}/{jobId}/figurine/{modelId}/model.3mf
print-files/{uid}/{jobId}/figurine/{modelId}/thumbnail.png
print-files/{uid}/{jobId}/figurine/{modelId}/textures/*
print-files/{uid}/{jobId}/figurine/{modelId}/metadata.json
```

For local experiments, continue using:

```text
.tmp/print-files/meshy/{timestamp}-{taskId}/
```

### Callable/API Surface

Likely Firebase Functions:

- `createFigurineJob`
- `validateFigurineSourceImage`
- `generateFigurineConcept`
- `approveFigurineConcept`
- `submitFigurineModelGeneration`
- `getFigurineJobStatus`
- `retryFigurineModelGeneration`

Meshy-specific details should stay behind the provider adapter, not in web components.

### Webhook/Polling Strategy

Short term:

- Use polling from the backend because it is simplest to reason about locally.
- Keep Cloudflare webhook receiver as verified external event intake.

Next integration step:

- Connect Cloudflare webhook events to Firestore model state.
- Use polling as a reconciliation path because webhook delivery should not be the only source of truth.
- Download assets from backend code after `SUCCEEDED`, regardless of whether success is discovered by polling or webhook.

## Coding Backlog

1. Add or extend the 2D concept style contract for `emoji_avatar` with Natural pose assumptions.
2. Promote the local Emoji/avatar Natural pose experiment prompt into a server-side concept style contract if human review accepts the direction.
3. Run Experiment 003 at the start of the next chat, then compare deterministic base/star behavior against Experiment 002 B's Meshy-generated base.
4. Run Meshy Repair Printability or slicer repair against the 2026-05-24 Emoji/avatar output, the 2026-05-25 Experiment 002 output, the 2026-05-25 Experiment 002 B output, and the future Experiment 003 output before any checkout/preorder claim.
5. Prototype deterministic nameplate text as a second post-processing step after deterministic base/star geometry is validated.
6. Add generated-3D provider types and Meshy provider client in `apps/functions`.
7. Add secret loading for `MESHY_API_KEY` through Functions secrets or Secret Manager in deployed runtimes.
8. Add model-generation Firestore schema and status transitions.
9. Add asset ingestion that downloads GLB/STL/3MF/thumbnails/textures into Firebase Storage.
10. Add sanitized provider audit metadata capture.
11. Add basic model readiness checks: required GLB present, print candidate present, file sizes nonzero, status/warnings recorded.
12. Add local emulator artifact mirroring under `.tmp/print-files` for figurine outputs.
13. Connect job page to standalone figurine GLB assets and readiness/warning state.
14. Add slicer/human review outcome fields before allowing checkout.
15. Add retries/idempotency so repeated submissions do not create accidental duplicate paid Meshy tasks.

## Known Risks

- Raw headshot/profile input can produce a bust instead of a full figurine.
- Meshy output may be visually recognizable but not watertight or print-ready.
- Meshy hosted assets expire quickly; durable ingestion is mandatory.
- Provider credits are consumed on successful textured Meshy-6 tasks.
- Checkout must stay blocked until generated assets and fulfillment readiness are honestly represented.
- Style/posture options should be based on actual Meshy outputs, not provider marketing.
- Commercial-use terms, likeness/privacy, moderation, and retention policies still need final launch review.

## Open Questions

- Should the first customer-facing Meshy call use the original photo or the approved 2D concept proof?
- Can an Emoji/avatar Natural pose 2D proof produce a complete, sellable Meshy figurine?
- After Emoji/avatar Natural pose, which next style should be evaluated: bobblehead, chibi, cartoon, or another constrained prompt?
- Does Meshy support enough posture control for Natural pose, Image pose, and T-pose in the first MVP?
- Should first checkout be single-color, multicolor 3MF, full-color partner fulfillment, or manual preorder only?
- What minimum slicer/readiness checks are required before preorder or checkout is enabled?

## Sources

- [Meshy Image to 3D API](https://docs.meshy.ai/en/api/image-to-3d)
- [Meshy Image to Image API](https://docs.meshy.ai/en/api/image-to-image)
- [Meshy Multi-Image to 3D API](https://docs.meshy.ai/en/api/multi-image-to-3d)
- [Meshy Analyze Printability API](https://docs.meshy.ai/en/api/analyze-printability)
- [Meshy Asset Retention](https://docs.meshy.ai/en/api/asset-retention)
