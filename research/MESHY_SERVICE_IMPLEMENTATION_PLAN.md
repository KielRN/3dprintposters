# Meshy Service Implementation Plan

Status: living implementation plan
Last updated: 2026-06-08

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

- `scripts/meshy/run-standard-figurine-experiment.mjs` (active standard runner for future experiment increments)
- `scripts/meshy/analyze-printability-task.mjs`
- `scripts/meshy/archive/2026-05-26-legacy-runners/` contains historical runners for reproducing Experiments 001 through 004 only.

Package command:

```powershell
npm run meshy:experiment -- -- --experiment-slug exp-005-standard-body-only-normalized
npm run meshy:exp-005-standard
npm run meshy:analyze-printability -- 019e5c65-7b2b-7641-abd6-ed04fb4e3d2e .tmp/experiments/meshy/emoji-natural-2026-05-24T23-50-06-305Z/meshy/2026-05-24T23-50-17-997Z-019e5c65-7b2b-7641-abd6-ed04fb4e3d2e
```

Warning: `meshy:experiment` and `meshy:exp-005-standard` create paid provider tasks and consume credits when providers accept the request. `meshy:experiment` also calls Vertex/Gemini unless `--skip-concept` is provided. `meshy:analyze-printability` only analyzes an existing task.

What it does:

- The active standard runner performs the full experiment protocol in one file: source photo -> Vertex/Gemini body-only concept -> Meshy Image-to-Image multi-view -> Meshy Multi-Image-to-3D -> Meshy Analyze Printability -> local normalized STL/3MF/GLB outputs.
- It also supports the Creative Lab Figure workflow used by Experiment 009. As of 2026-06-05, Creative Lab Figure raw GLB generation is the approved upstream figure-generation step because it produced the smoothest no-base API outputs.
- Standard runner outputs live under `.tmp/experiments/meshy/standard/{experimentSlug}-{timestamp}` with `input/`, `vertex/`, `meshy/`, and `normalized/` subfolders. The latest run summary is also written to `.tmp/experiments/meshy/standard/latest.sanitized.json`.
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

- Standard runner: `E:\PROJECTS\3DPrintPosters\.tmp\experiments\meshy\standard`
- Legacy first-job runner: `E:\PROJECTS\3DPrintPosters\.tmp\print-files`

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
- Blender/3MF scale inspection on 2026-05-25 found that `model.stl` imports at about `837.6 x 497.1 x 1911.6` Blender units while `model.glb` imports at `0.8376 x 0.4971 x 1.9116`; this is a 1000x STL-vs-GLB unit split, not a large STL byte-size problem.
- The Meshy `model.3mf` is explicitly `millimeter` units and contains the same remeshed topology at a sane print scale of about `32.9mm x 19.5mm x 75.0mm`. Use the 3MF or an explicit target height as the print-scale source of truth, not the raw STL coordinates opened directly in Blender.
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
- Blender/3MF scale inspection on 2026-05-25 found the same unit split as Experiment 002: `model.stl` imports around `1037.4 x 1047.3 x 1911.0` Blender units, `model.glb` imports around `1.037 x 1.047 x 1.911`, and Meshy's `model.3mf` is millimeter-scaled at about `40.7mm x 41.1mm x 75.0mm`.
- The core fulfillment blocker remains unchanged: Meshy's own printability analysis still returns `error`.

### Experiment 002 Closure

Status:

- Closed on 2026-05-25.

Conclusion:

- Meshy's multi-view image generation can create an attractive base/nameplate reference.
- Meshy's final 3D task should not be trusted to preserve precise product text or decorative base details.
- Continue with deterministic post-Meshy base geometry rather than more prompt-only base/nameplate attempts.

### Experiment 003: Deterministic PrintU-Star Base After Meshy

Status:

- Ran on 2026-05-25.

Runner:

- `scripts/meshy/run-emoji-natural-multiview-experiment.mjs`
- `scripts/meshy/add_printu_star_base.py`
- Package command: `npm run meshy:exp-003-deterministic-base`

Sequence:

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

Run results:

- Run directory: `.tmp/experiments/meshy/exp-003-deterministic-printu-star-base-2026-05-25T16-10-02-213Z`
- Image task: `019e5fe6-81d9-7f24-9add-bbd37e6ff6f4`, succeeded, consumed `12` credits.
- Model task: `019e5fe7-81fc-742c-ab8a-8516bd549134`, succeeded, consumed `30` credits.
- Printability task: `019e5fe9-c09e-7093-a81d-847899b14db9`, consumed `0` credits and returned `error`.
- Printability metrics: `is_watertight: false`, `75` non-manifold edges, `79` degenerate faces, `0` holes.
- Postprocessed exports:
  - `postprocessed/printu-star/model-with-printu-star-base.stl`
  - `postprocessed/printu-star/model-with-printu-star-base.glb`
  - `postprocessed/printu-star/model-with-printu-star-base.3mf`
  - `postprocessed/printu-star/printu-star-base-only.stl`
- Local `trimesh` metadata reports the deterministic base mesh and star mesh are watertight. The combined mesh is not watertight because it intentionally does not repair the Meshy body.
- Blender/3MF scale inspection on 2026-05-25 found that the original Meshy `model.3mf` is correctly millimeter-scaled at about `31.0mm x 31.0mm x 75.0mm`, but the deterministic postprocess used Meshy's raw STL coordinates, producing `model-with-printu-star-base.3mf` at about `1135.4mm x 1135.4mm x 2120.7mm`.
- The postprocessed GLB also imports into Blender with the long axis on Y rather than Z (`1135.4 x 2120.7 x 1135.4`), so the deterministic exporter needs explicit scale/orientation normalization before it can be used as a product preview or print package.

Correction after run:

- Experiment 003 is useful run data, but it is not the intended saved-base product workflow.
- The target pipeline is: Vertex/Gemini creates the figurine/body proof; Meshy creates the figurine/body 3D object; `services/print-file-generator` applies a saved reusable base STL, deterministic customer-name geometry, and deterministic body/base assembly.
- Do not ask Vertex/Gemini or Meshy to preserve product-owned base details, star geometry, or customer text. Those belong to deterministic manufacturing code.
- The approved reusable base STL does not exist yet. Create/select it before implementing name-on-base or body/base composition services.

### Corrected Deterministic Base Pipeline

Prerequisite asset:

- `base.stl`: approved reusable figurine base mesh.
- `base.manifest.json`: version, units, dimensions, orientation, top plane, foot-placement zone, front text zone, text constraints, checksum, and storage/tracking policy.

Server-side services to add under `services/print-file-generator`:

1. Base naming service: load the approved base STL and deterministically add raised or engraved customer-name geometry.
2. Body/base composer: load Meshy's figurine/body output and the named base, scale/orient/position the body, attach or overlap it according to slicer-tested rules, and export final STL/GLB/3MF plus metadata.
3. Printability/readiness audit: report inherited Meshy body defects separately from base/text/assembly defects.

Scale/orientation requirement:

- Do not derive manufacturing dimensions directly from Meshy's raw `model.stl`; in Blender it opens at roughly 1000x the GLB coordinate scale and around 1.9m tall if treated as millimeters.
- Prefer Meshy's `model.3mf` millimeter extents, or normalize the Meshy body to an explicit target height before deterministic base/text composition.
- Export GLB previews with a verified up-axis and size check, then re-import in Blender or a web viewer before wiring the output into the app.

Functions orchestration:

- `apps/functions` should coordinate proof approval, Meshy body generation, asset ingestion, and the print-file-generator composition call. Provider credentials and geometry generation remain server-side only.

### Experiment 004: Normalize Meshy Artifacts Before Composition

Status:

- Prepared on 2026-05-25 and smoke-tested against existing Experiment 002 artifacts without creating new paid Meshy tasks.
- Paid run completed on 2026-05-25 local time / 2026-05-26 UTC with `npm run meshy:exp-004-normalize-glb`.

Runner:

- Existing runner: `scripts/meshy/run-emoji-natural-multiview-experiment.mjs`
- New package command: `npm run meshy:exp-004-normalize-glb`
- Command behavior: runs the normal Meshy Image-to-Image multi-view -> Multi-Image-to-3D -> printability flow, then passes the downloaded GLB through the local normalizer with `--normalize-artifact glb`.
- Warning: the package command creates new paid Meshy tasks. For no-credit testing, call the Python normalizer directly on an existing run directory.

Normalizer:

- Script: `services/print-file-generator/scripts/normalize_meshy_artifact.py`
- Default scale source: downloaded `model.3mf` height in millimeters.
- Geometry source: any downloaded Meshy model asset; Experiment 004 starts with `model.glb`.
- Output: `model.normalized.stl`, `model.normalized.3mf`, `model.normalized.glb`, and `normalization.metadata.json`.
- GLB handling: treats source GLB as Y-up, converts to print Z-up for STL/3MF, then exports preview GLB in glTF Y-up so Blender and web importers show the same print dimensions.

No-credit smoke test against Experiment 002:

- Source run: `.tmp/experiments/meshy/exp-002-emoji-natural-multiview-2026-05-25T11-50-24-757Z`
- GLB-source output: `postprocessed/normalized-glb-exp004-smoke/`
- STL-source comparison output: `postprocessed/normalized-stl-exp004-smoke/`
- Reference height from Meshy's `model.3mf`: `75.0mm`.
- Normalized GLB-source dimensions verified in Blender: about `32.86mm x 19.50mm x 75.00mm`.
- Normalized STL-source dimensions verified in Blender: about `32.86mm x 19.50mm x 75.00mm`.
- Normalized GLB-source topology remained not watertight and seam-heavy: about `26,043` non-manifold edges after cleanup.
- Normalized STL-source topology preserved Meshy's better remeshed print topology: `57` non-manifold edges after cleanup.

Paid Experiment 004 run:

- Run directory: `.tmp/experiments/meshy/exp-004-normalize-glb-2026-05-26T00-10-26-648Z`
- Meshy Image-to-Image task: `019e619e-53d7-7c77-b65b-1aa28c788d97`, succeeded, `12` credits.
- Meshy Multi-Image-to-3D task: `019e619f-2529-7cb4-8d0c-1aaf57442e5e`, succeeded, `30` credits.
- Meshy printability task: `019e61a1-3a10-7302-8c37-b75b33732da6`, returned `error` with `is_watertight: false`, `82` non-manifold edges, `104` degenerate faces, and `0` holes.
- Normalized GLB-source outputs: `postprocessed/normalized-glb/model.normalized.stl`, `model.normalized.3mf`, and `model.normalized.glb`.
- Normalized GLB-source dimensions from metadata: about `28.86mm x 28.86mm x 75.00mm`.
- Normalized GLB-source topology after cleanup: not watertight, `27,701` non-manifold edges, `0` degenerate faces.
- Visual note: the generated thumbnail includes a base. That base came from the upstream 2D/reference image path allowing a base, which Meshy then preserved. It is not the target product architecture.

Experiment 004 implication:

- The normalization service works for scale and orientation.
- The visually nice GLB is not automatically the best print-geometry source; for Experiment 002, normalized raw STL is a better starting print candidate than GLB because it has far fewer open seam edges.
- The paid Experiment 004 run confirms that normalization can produce correctly scaled 75mm packages from a fresh Meshy GLB, but it does not solve inherited GLB seam topology or Meshy's non-watertight printability result.
- Future body-generation runs should stay body-only from the first concept image through Meshy. The local Vertex/Gemini concept prompt now explicitly rejects bases, and the Meshy runner requests no base, pedestal, platform, plaque, nameplate, sign, ground disk, scenery, or support prop; it also asks Meshy to ignore/remove an upstream base unless a historical/base test deliberately passes `--base-label`.
- Keep GLB as preview-friendly, but compare normalized STL and normalized GLB in slicer before choosing the production geometry source.

### Experiment 005: Standard Body-Only Run And Meshy Repair

Run:

- Command: `npm run meshy:exp-005-standard`
- Run directory: `.tmp/experiments/meshy/standard/exp-005-standard-body-only-normalized-2026-06-03T22-59-59-472Z`
- Meshy Image-to-Image task: `019e8fb7-537c-7253-8f0c-d21aa8bea901`, succeeded, `12` credits.
- Meshy Multi-Image-to-3D task: `019e8fb8-2c15-712d-9947-e3063f1bf9d7`, succeeded, `30` credits.
- Meshy printability task: `019e8fba-1fc7-72b7-bfc3-3740b7076250`, returned `error` with `is_watertight: false`, `103` non-manifold edges, `111` degenerate faces, and `0` holes.
- Normalized GLB-source outputs exported at about `41.69mm x 22.02mm x 75mm`, but remained not watertight with about `26.8k` non-manifold edges.

Repair:

- Meshy Repair Printability task: `019e8fd3-522b-76e2-9a46-320663626dad`, succeeded, `10` credits.
- Repaired local output: `.tmp/experiments/meshy/standard/exp-005-standard-body-only-normalized-2026-06-03T22-59-59-472Z/repair/input-task-glb/model.repaired.glb`
- Follow-up Meshy Analyze Printability task: `019e8fd3-7df0-76e4-89a3-4f4a2d0c0fad`, returned `warning` with `is_watertight: true`, `0` non-manifold edges, `111` degenerate faces, and `0` holes.
- Blender review object: `exp005-repaired-body-scaled-review`, scaled to about `41.69mm x 22.02mm x 75mm` and placed on the reusable base top plane.

Implications:

- The body-only prompt path works visually: no base/pedestal/platform appeared in the 2D concept, multi-view references, or final thumbnail.
- Meshy's Repair Printability API can clear the hard topology blockers on this run, moving Meshy's own readiness result from `error` to `warning`.
- Repair through `input_task_id` repairs the task GLB and returns GLB only; existing textures are removed during repair. A separate repaired-STL path should test `model_url` with an uploaded or data-URL STL if slicer review needs STL-specific repair output.
- Slicer validation remains required before any checkout/preorder promise.

Remesh:

- Meshy Remesh task: `019e8fdb-5755-77fa-a508-195e3f672c92`, succeeded, `5` credits.
- Input: original Experiment 005 `meshy/model.glb` submitted as a data URI.
- Request: quad topology, `100000` target polycount, target formats `glb`, `stl`, and `3mf`.
- Outputs: `.tmp/experiments/meshy/standard/exp-005-standard-body-only-normalized-2026-06-03T22-59-59-472Z/remesh/quad-100k-original-glb/model.remesh-quad-100k.glb`, `.stl`, and `.3mf`.
- Follow-up Meshy Analyze Printability task: `019e8fdc-3187-7f21-a732-7576411301dd`, returned `error` with `is_watertight: false`, `4` non-manifold edges, `75` degenerate faces, and `1` hole.
- Blender review object: `exp005-remesh-quad-100k-scaled-review`, scaled to about `41.73mm x 22.09mm x 75mm`; Blender reports `111123` vertices and `199400` faces.

Remesh implication:

- Quad/100k remesh may still be useful for visual comparison, but it is not a print-readiness replacement for Repair Printability on this run.
- Compared with the original Meshy printability result, Remesh reduced non-manifold edges from `103` to `4` and degenerate faces from `111` to `75`, but it stayed non-watertight and introduced `1` hole.
- The next paid Meshy topology experiment should be a small matrix only if visual review shows Remesh reduced artifacts enough to be worth more credits.

### Experiment 009: Creative Lab Figure Raw GLB Milestone

Experiment 009 ran three raw Creative Lab Figure API passes on 2026-06-05 with no local normalization:

- `.tmp/experiments/meshy/standard/exp-009-creative-lab-raw-pass-1`
- `.tmp/experiments/meshy/standard/exp-009-creative-lab-raw-pass-2`
- `.tmp/experiments/meshy/standard/exp-009-creative-lab-raw-pass-3`

Each pass returned `meshy/build/model.glb`, `model.obj`, `thumbnail.png`, and texture assets; `model.mtl` returned `403`, and Creative Lab did not return STL or 3MF. All three raw GLBs failed Meshy printability analysis, but visual/Blender review showed smooth chibi/vinyl-like figures without broad generated bases. The visible Blender imports `Mesh_0.003`, `Mesh_0.004`, and `Mesh_0.005` have bottom footprints consistent with feet/shoes rather than a pedestal.

Product implication:

- Creative Lab Figure API GLB generation is the approved upstream figure-generation milestone for the first product path.
- Treat GLB as the canonical upstream asset for this workflow.
- Treat STL/3MF as downstream print-tooling or local-conversion outputs unless Meshy adds them to Creative Lab build responses.
- Do not return to Multi-Image-to-3D as the leading product path unless Creative Lab print conversion fails or business/API constraints block it.

### Experiment 010: Print Tooling From Existing Experiment 009 GLBs

Experiment 010 ran on 2026-06-07 with:

```powershell
npm run meshy:exp-010-print-tools
```

It used the standard runner's `existing-model-print-tools` workflow and did not create new Creative Lab or Multi-Image-to-3D figure-generation tasks. Inputs were the three existing Experiment 009 GLBs:

```text
.tmp/experiments/meshy/standard/exp-009-creative-lab-raw-pass-1/meshy/build/model.glb
.tmp/experiments/meshy/standard/exp-009-creative-lab-raw-pass-2/meshy/build/model.glb
.tmp/experiments/meshy/standard/exp-009-creative-lab-raw-pass-3/meshy/build/model.glb
```

Outputs:

- Run folder: `.tmp/experiments/meshy/standard/exp-010-creative-lab-print-tools`
- Comparison summary: `.tmp/experiments/meshy/standard/exp-010-creative-lab-print-tools/comparison.sanitized.json`
- Per-pass artifacts under `meshy/pass-{1,2,3}/original`, `repair/model-url-glb`, and `remesh/quad-100000-model-url-glb`.

Implementation notes:

- The runner recovered live Creative Lab build GLB URLs and used `model_url` for Analyze Printability, Repair Printability, and Remesh. It has a local `data:application/octet-stream` fallback for expired asset URLs.
- Remesh requested `glb`, `stl`, and `3mf` at quad topology and `100000` target polycount.
- Meshy Analyze Printability accepts GLB/STL model URLs but not 3MF model URLs, so 3MF remains local/slicer-review only.

Results:

- Original GLBs still returned Meshy printability `error`: pass 1 `20` non-manifold edges / `3877` degenerate faces, pass 2 `6` / `4418`, pass 3 `3` / `4055`.
- Meshy Repair Printability consumed `10` credits per pass and returned repaired GLBs. Follow-up analysis returned `warning` for all three: watertight `true`, `0` non-manifold edges, no holes, and remaining degenerate faces of `3869`, `4416`, and `4054`.
- Meshy repair removed textures. Local analysis reports repaired GLBs as `ColorVisuals`, while original GLBs remain `TextureVisuals`.
- Meshy Remesh consumed `5` credits per pass and exported GLB/STL/3MF. It returned texture URLs, but remeshed GLB/STL still returned Meshy printability `error`: pass 1 GLB/STL `56`/`40` non-manifold edges and `5` holes, pass 2 `12`/`9` and `2` holes, pass 3 `89`/`79` and `15`/`13` holes.
- Local 75mm target-height analysis found all original/repaired/remeshed variants fit the `printu-round-v1` 18mm foot placement zone. Approximate scaled body widths are `39.2mm`, `36.5mm`, and `33.2mm`; bottom footprints remain feet-sized.

Product implication:

- Creative Lab GLB generation remains approved upstream.
- Downstream print tooling is unresolved: Meshy Repair is the topology winner but loses texture; Meshy Remesh is the texture/format winner but remains non-watertight.
- Human Blender/slicer review should decide whether the textureless repaired GLB is acceptable for the first fulfillment path, whether textured remesh outputs can be slicer-repaired, or whether a deterministic/local repair and conversion stage is required.

## Official Preview Pipeline v1

Status: validated in the normal browser workflow on 2026-06-07.

The first official figurine pipeline is preview-only. It proves the customer-facing path from upload through a rendered color 3D preview, but it does not make the figurine print-ready and does not unlock checkout.

Validated job:

- `cfc9039a-d83c-48d7-9ed5-39f214fce6c6`

Pipeline:

1. User uploads a source photo in the normal app flow.
2. User selects `Creative Lab Figure`.
3. Firebase Functions creates a `productType: "figurine"` job.
4. Vertex/Gemini generates a 2D figurine proof.
5. User approves the proof.
6. `approveGeneratedImage` branches server-side into the Meshy Creative Lab Figure provider adapter.
7. Functions submits/polls Meshy Creative Lab Figure prototype/build tasks.
8. Functions downloads the original textured Creative Lab `model.glb` into Firebase Storage under:

```text
print-files/{uid}/{jobId}/figurine/creative-lab-original/model.glb
```

9. Functions updates the job document with:

```json
{
  "productType": "figurine",
  "figurineStyle": "creative_lab_figure",
  "postureMode": "natural",
  "generated3dProvider": "meshy",
  "generated3dWorkflow": "creative_lab_figure",
  "canonicalUpstreamAsset": "model.glb",
  "figurinePreview": {
    "status": "preview_ready",
    "previewGlb": "print-files/{uid}/{jobId}/figurine/creative-lab-original/model.glb",
    "printReadiness": "needs_review"
  }
}
```

10. The job page renders the Storage-backed GLB in the color figurine preview viewer.
11. Checkout remains disabled/rejected while `printReadiness` is `needs_review`.

Customer preview asset:

- Use only the original textured Creative Lab `model.glb`.
- Do not use Experiment 010 repaired or remeshed outputs as customer preview assets.
- Do not mark figurines print-ready from this pipeline.

### First Workflow Contract

The first service slice supports only the narrow path needed to reproduce the approved smooth no-base figurine workflow:

```json
{
  "productType": "figurine",
  "figurineStyle": "creative_lab_figure",
  "postureMode": "natural",
  "conceptSource": "source_photo_or_provider_prototype",
  "generated3dProvider": "meshy",
  "generated3dWorkflow": "creative_lab_figure",
  "canonicalUpstreamAsset": "model.glb",
  "previewAssetPolicy": "original_textured_creative_lab_glb_only",
  "printReadiness": "needs_review",
  "checkoutEligibility": {
    "eligible": false,
    "reason": "Figurine checkout is locked until printability and slicer review are complete."
  },
  "downstreamPrintTooling": ["analyze_printability", "repair_printability", "remesh"]
}
```

Do not broaden this into every style/posture before the Creative Lab GLB -> print-tooling path works end to end.

### Scale/Base Milestone: Job `f604d393-bfa2-4779-b05b-f6a2082604c9`

On 2026-06-07, Blender review established the first clean scale contract between a real Creative Lab job output and a reusable square base.

Source assets:

- Meshy figurine: `.tmp/print-files/N6wSBUfLdEcQy82BG3l1duHmXTY2/f604d393-bfa2-4779-b05b-f6a2082604c9/figurine/creative-lab-original/model.glb`
- Square base GLB: `.tmp/gold-standard/Figurine Standard Square Base/full_color/base.glb`
- Square base STL: `.tmp/gold-standard/Figurine Standard Square Base/single_color/base.stl`
- Beginner unit notes: `.tmp/gold-standard/Figurine Standard Square Base/UNITS_AND_COORDINATES_BEGINNER_NOTES.md`

Measured raw sizes:

| Asset | Coordinate Convention | X | Y | Z |
| --- | --- | ---: | ---: | ---: |
| Meshy `model.glb` | GLB, Y-up | `0.786765` | `1.899262` | `0.689108` |
| Meshy clean Blender import | Blender, Z-up | `0.786765` | `0.689108` | `1.899262` |
| Square `base.glb` | GLB, Y-up | `1.332571` | `0.303882` | `1.332571` |
| Square `base.stl` / Blender import | Z-up | `1.332571` | `1.332571` | `0.303882` |

Target physical scale:

- Figurine target height: `150mm` (about 6 inches).
- Raw-to-mm scale factor: `150 / 1.899262249 = 78.978034802`.
- Expected scaled figurine body envelope: about `62.14mm x 54.42mm x 150.00mm`.
- Expected scaled square base: about `105.24mm x 105.24mm x 24.00mm`.

Important correction:

- An older Blender review scene displayed the same Meshy figure at about `1000x` raw GLB size. Do not bake that review-scene display scale into reusable assets.
- A fresh Blender import of the raw Meshy `model.glb` and current `full_color/base.glb` now matches without resizing. Future assembly code should load both in raw provider/base units first, then apply the explicit `150mm` target-height scale to the final package.

### Provider Interface

The generated-3D provider interface now exists with Meshy Creative Lab Figure as the first implementation in `apps/functions/src/meshyFigurineProvider.ts`.

Implemented responsibilities:

- Submit a model-generation task.
- Poll task status.
- Normalize provider status and errors.
- Enumerate available model, thumbnail, and texture URLs.
- Download provider assets into durable project storage.
- Return sanitized provider audit metadata.
- Recover Firestore state from already-uploaded job-owned assets when a provider run succeeded but a later Firestore update failed.

Do not expose provider URLs or credentials to the browser.

### Firestore Model State

Model-generation state is written to figurine jobs. Current preview-only shape:

```json
{
  "productType": "figurine",
  "models": [
    {
      "modelId": "creative-lab-original",
      "provider": "meshy",
      "providerTaskId": "...",
      "status": "preview_ready",
      "requestedFormats": ["glb"],
      "availableFormats": ["glb"],
      "storagePaths": {
        "previewGlb": "print-files/{uid}/{jobId}/figurine/creative-lab-original/model.glb",
        "thumbnail": "print-files/{uid}/{jobId}/figurine/creative-lab-original/thumbnail.png",
        "metadataJson": "print-files/{uid}/{jobId}/figurine/creative-lab-original/metadata.json"
      },
      "warnings": ["Preview-only warning copy"],
      "consumedCredits": null,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "selectedModelId": "creative-lab-original",
  "readinessStatus": "preview_ready",
  "checkoutEligibility": {
    "eligible": false,
    "reason": "Figurine checkout is locked until printability and slicer review are complete."
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

Current preview implementation:

- `createGenerationJob` accepts/infers `productType: "figurine"` for `creative_lab_figure`.
- `approveGeneratedImage` approves the 2D proof and dispatches Creative Lab Figure generation for figurine jobs.
- `createCheckoutSession` rejects figurine jobs until a future print-ready fulfillment path exists.

Future split-out callable/API surface:

- Dedicated retry/status endpoints for generated-3D models.
- Webhook/poll reconciliation.
- Downstream print-tooling state and manual review decisions.

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

1. Add or extend the 2D concept style contract for `emoji_avatar` with Natural pose assumptions and an explicit body-only/no-base policy.
2. Promote the local Emoji/avatar Natural pose experiment prompt into a server-side concept style contract if human review accepts the direction, preserving the no-base/pedestal/platform constraint.
3. Create or select the approved reusable base STL asset and capture its manifest metadata.
4. Build deterministic name-on-base service after the base STL exists.
5. Build deterministic Meshy-body-to-named-base composition service after base naming works.
6. Run Experiment 010 from the three existing Experiment 009 GLBs without new figure generation: Analyze Printability, Repair Printability, and Remesh/format export via `model_url` inputs, then compare the resulting GLB/STL/3MF candidates in Blender and slicer software.
7. Add generated-3D provider types and Meshy provider client in `apps/functions`.
8. Add secret loading for `MESHY_API_KEY` through Functions secrets or Secret Manager in deployed runtimes.
9. Add model-generation Firestore schema and status transitions.
10. Add asset ingestion that downloads GLB/STL/3MF/thumbnails/textures into Firebase Storage.
11. Add sanitized provider audit metadata capture.
12. Add basic model readiness checks: required GLB present, print candidate present, file sizes nonzero, status/warnings recorded.
13. Add local emulator artifact mirroring under `.tmp/print-files` for figurine outputs.
14. Connect job page to standalone figurine GLB assets and readiness/warning state.
15. Add slicer/human review outcome fields before allowing checkout.
16. Add retries/idempotency so repeated submissions do not create accidental duplicate paid Meshy tasks.

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
