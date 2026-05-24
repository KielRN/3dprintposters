# Meshy Service Implementation Plan

Status: living implementation plan
Last updated: 2026-05-24

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

## Local Runner

Script:

- `scripts/meshy/create-image-to-3d-job.mjs`

Package command:

```powershell
npm run meshy:first-job
```

Warning: this creates a new paid Meshy task and consumes credits when Meshy accepts the request.

What it does:

- Loads `MESHY_API_KEY` from the process environment or ignored local `.env`.
- Sends the local image as a base64 data URI.
- Polls until a terminal task status.
- Downloads returned models, thumbnails, and textures under `.tmp/print-files/meshy/{timestamp}-{taskId}/`.
- Writes sanitized metadata only. It redacts base64 payloads and does not store provider asset URLs in tracked files.

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
2. Generate an Emoji/avatar 2D proof from `.tmp/Profile-Pic-HIMSS.jpg` or another customer-like source and save it as the next Meshy input.
3. Run Meshy Image to 3D on the approved Emoji/avatar proof and compare against the raw-photo run.
4. Add generated-3D provider types and Meshy provider client in `apps/functions`.
5. Add secret loading for `MESHY_API_KEY` through Functions secrets or Secret Manager in deployed runtimes.
6. Add model-generation Firestore schema and status transitions.
7. Add asset ingestion that downloads GLB/STL/3MF/thumbnails/textures into Firebase Storage.
8. Add sanitized provider audit metadata capture.
9. Add basic model readiness checks: required GLB present, print candidate present, file sizes nonzero, status/warnings recorded.
10. Add local emulator artifact mirroring under `.tmp/print-files` for figurine outputs.
11. Connect job page to standalone figurine GLB assets and readiness/warning state.
12. Add slicer/human review outcome fields before allowing checkout.
13. Add retries/idempotency so repeated submissions do not create accidental duplicate paid Meshy tasks.

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
- [Meshy Asset Retention](https://docs.meshy.ai/en/api/asset-retention)
