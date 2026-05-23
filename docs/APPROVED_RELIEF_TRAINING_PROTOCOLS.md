# Approved Relief Training Protocols

Status: paused as of 2026-05-23 while the product shifts to a PrintU-like standalone figurine demand proof. Resume these protocols only if/when the poster-relief product line is reactivated.

These protocols define the new direction for improving 3DPrintPosters by working backward from human-approved production relief files.

The goal is not to train from raw STL files directly. The goal is to use each approved production STL as a gold master, extract 2D supervision artifacts from it, and use those artifacts to tune the deterministic print-file generator first. Once there are at least 30 approved examples, the same dataset can support LoRA and ControlNet-style training.

## Product Rule

Keep final print-file generation server-side in `services/print-file-generator`.

ComfyUI, LoRA, ControlNet, RunComfy, Civitai, or other AI tools may help produce a cleaner proof image, depth guide, mask, normal map, heightmap candidate, or QA signal. They should not become the unchecked source of physical dimensions, watertight mesh construction, order handoff, or fulfillment artifacts.

## Local Data Location

Approved-example work products must stay in ignored local paths unless the user explicitly chooses to publish sanitized examples later.

Use this directory shape:

```text
.tmp/approved-relief-examples/{example_id}/
  inputs/
    source-image.{jpg|png}
    approved-proof.{png|jpg|webp}
  baseline/
    model.stl
    preview.glb
    heightmap.png
    metadata.json
    debug/
  blender/
    working.blend
    approval-renders/
  approved/
    model.approved.stl
    heightmap-approved-16bit.png
    normal-approved.png
    depth-render-approved.png
    curvature-approved.png
    smooth-mask-approved.png
    raised-graphic-mask-approved.png
  manifest.json
  approval-notes.md
```

Do not commit customer photos, generated proofs, approved STLs, Blender files, extracted heightmaps, masks, or renders by default.

## Example Ids

Use stable example ids so artifacts and notes can be matched across tools:

```text
YYYYMMDD-{short-job-id}-{slug}
```

Example:

```text
20260521-abc123-super-dad-proof-v1
```

## Protocol 1 - Baseline Bundle Capture

Use this protocol after the app generates a print-file bundle from an approved proof.

Inputs:

- `print-files/{uid}/{jobId}/model.stl`
- `print-files/{uid}/{jobId}/preview.glb`
- `print-files/{uid}/{jobId}/heightmap.png`
- `print-files/{uid}/{jobId}/metadata.json`
- `print-files/{uid}/{jobId}/debug/*.png`
- The approved proof image used for generation.
- The original customer source image, only when safe and necessary for local analysis.

Steps:

1. Copy or mirror the generated bundle into `.tmp/approved-relief-examples/{example_id}/baseline/`.
2. Copy the approved proof into `.tmp/approved-relief-examples/{example_id}/inputs/approved-proof.{ext}`.
3. Copy the source image only when it is needed for comparison or future training.
4. Record the job id, generator version, style contract, surface-intent policy, mesh width, geometry-analysis width, detail source, detail weight, physical dimensions, and debug artifact list in `manifest.json`.
5. Add human-visible failure notes to `approval-notes.md`: dents, blockiness, ridges, noisy smooth areas, weak text emboss, face mid-form loss, edge jaggedness, or color/geometry mismatch.

Done when the baseline can be reopened without relying on Firestore, Storage, or local emulator state.

## Protocol 2 - Blender Gold-Master Review

Use this protocol to turn a generated STL into a human-approved production candidate.

Blender scene setup:

- Units: millimeters.
- Expected physical bounds: 139.7mm x 190.5mm for the full product body.
- Expected image window: 127mm x 177.8mm.
- Expected border: 6.35mm on all sides.
- Treat +Z as relief height.

Checks:

- The mesh is watertight/manifold or any repair is documented.
- Normals are consistent.
- Scale is unchanged.
- Base thickness and relief range stay inside product limits.
- The 1/4in border still reads as an intentional frame.
- The face, head, neck, shirt/body, background, and text/logo regions match the Super Dad north-star direction.
- Smooth-intent areas are smooth enough for print: skin, scalp/top-of-head, ears, neck, hands, simple clothing, and simple backgrounds.
- Raised-intent areas remain crisp and deliberate: text, logos, emblems, graphic edges, and panel lines.

Allowed edits:

- Smooth or sculpt local surface defects.
- Correct recessed facial forms where the approved proof implies protruding form.
- Clean jagged silhouette or collar/neck edges.
- Sharpen or raise intentional graphics.
- Reduce random scratches, pits, and noisy texture in smooth-intent regions.
- Preserve the approved physical size and product frame.

Disallowed edits unless explicitly approved:

- Changing the physical product size.
- Removing the frame/border.
- Turning the poster relief into a standalone figurine.
- Adding geometry unrelated to the approved proof.
- Baking customer-private details into tracked docs or prompts.

Approval output:

- Save `blender/working.blend`.
- Export `approved/model.approved.stl`.
- Save fixed-camera renders into `blender/approval-renders/`.
- Update `approval-notes.md` with the final human decision and remaining concerns.

## Protocol 3 - Gold-Master Artifact Extraction

Use the approved STL as a source of supervision by converting it into 2D maps.

Required extraction artifacts:

- `heightmap-approved-16bit.png`: orthographic top-down relief height, normalized to the exact image window.
- `normal-approved.png`: normal map or shaded normal visualization.
- `depth-render-approved.png`: grayscale render from the standard review camera.
- `curvature-approved.png`: edge/curvature map for raised details and surface transitions.
- `smooth-mask-approved.png`: regions that should stay smooth.
- `raised-graphic-mask-approved.png`: text, logos, emblems, and deliberate graphic ridges.

Recommended fixed camera set:

- Front orthographic render.
- Low side-angle render for face/nose/emboss readability.
- Top orthographic render for silhouette and edge quality.
- Three-quarter render matching the job-page GLB viewer.

Extraction rules:

- Keep all extracted maps aligned to the approved proof's 5:7 image window.
- Do not include the 1/4in border in training maps unless the model is explicitly learning frame geometry.
- Preserve 16-bit height data where possible.
- Record min/max height in millimeters and normalization method in `manifest.json`.
- Keep any manual mask painting notes in `approval-notes.md`.

## Protocol 4 - Manifest

Each approved example must include `manifest.json`.

Minimum shape:

```json
{
  "example_id": "20260521-abc123-super-dad-proof-v1",
  "status": "approved",
  "source_job_id": "abc123",
  "created_at": "2026-05-21",
  "product": {
    "physical_width_mm": 139.7,
    "physical_height_mm": 190.5,
    "image_window_width_mm": 127.0,
    "image_window_height_mm": 177.8,
    "border_mm": 6.35
  },
  "baseline_generator": {
    "height_provider": "masked_depth_detail_blend",
    "detail_source": "lithophane_baseline",
    "detail_weight": 0.38,
    "mesh_target_width_px": 400,
    "geometry_analysis_width_px": 768
  },
  "style": {
    "proof_style_contract_id": "super-dad-north-star-v1",
    "surface_intent_policy_id": "smooth-default-v1"
  },
  "approved_artifacts": {
    "stl": "approved/model.approved.stl",
    "heightmap": "approved/heightmap-approved-16bit.png",
    "normal": "approved/normal-approved.png",
    "smooth_mask": "approved/smooth-mask-approved.png",
    "raised_graphic_mask": "approved/raised-graphic-mask-approved.png"
  },
  "human_review": {
    "approved_by": "Elliot",
    "approval_date": "2026-05-21",
    "notes_path": "approval-notes.md"
  }
}
```

Do not put secret values, provider tokens, customer addresses, payment data, or private account details in the manifest.

## Protocol 5 - Generator Tuning Before Training

Before training a LoRA or ControlNet-style model, use each gold master to improve the deterministic generator.

For every approved example:

1. Compare baseline `heightmap.png` to `approved/heightmap-approved-16bit.png`.
2. Compute difference maps for height, gradient, edge placement, and region roughness.
3. Review differences by region: face mid-form, scalp/head, neck, shirt/body, background, text/logo, and silhouette edges.
4. Tune `services/print-file-generator` only when the change improves the gold-master comparison without making other approved examples worse.
5. Re-run current quality gates and add any needed region-specific gate.

This keeps the deterministic pipeline strong and reduces the amount of behavior a future model needs to learn.

## Protocol 6 - Dataset Readiness For LoRA

Start LoRA experiments only after at least 30 approved examples exist.

The first LoRA should learn the proof/art style, not physical mesh generation.

Training target:

- Controlled printable proof art.
- Smooth stylized skin/head/body forms.
- Simple backgrounds.
- Crisp raised-looking text, logos, emblems, and graphic edges.
- Low random texture in smooth-intent regions.

Training inputs:

- Approved proof images.
- Approved STL renders, if they help communicate relief-friendly shape.
- Captions with a project style token such as `3dpp_printable_relief_style`.
- Optional source images only if identity/reference preservation is explicitly part of the training run and privacy is handled.

Do not train LoRA directly on STL geometry. Train on images/renders/captions that teach the proof style.

Minimum dataset split for 30 examples:

- 24 training examples.
- 3 validation examples.
- 3 holdout examples.

Prefer more diversity before production use: different ages, hair shapes, hats, glasses, clothing, text layouts, logo placements, backgrounds, and skin tones.

## Protocol 7 - Dataset Readiness For ControlNet Or Adapter Training

Start ControlNet-style experiments only after the approved-example dataset includes aligned maps.

Possible conditioning inputs:

- Approved proof image.
- Canny/lineart map from the proof.
- Baseline generator heightmap.
- Baseline normal/depth render.
- Smooth and raised-graphic masks.

Possible targets:

- Approved heightmap.
- Approved normal map.
- Approved depth render.
- Approved raised-detail or smooth-region mask.

Recommended first target:

```text
approved proof + baseline heightmap + masks -> approved heightmap
```

The model output should remain an intermediate manufacturing guide. The production STL must still be created by the deterministic mesh generator and must pass printability checks.

## Protocol 8 - Evaluation Gates

A new AI-assisted workflow is not promoted only because it looks better in one render.

Evaluate each candidate against:

- Existing printability checks.
- Existing quality gates in `services/print-file-generator/app/quality_gates.py`.
- Heightmap difference from gold master.
- Gradient and edge-placement difference from gold master.
- Region roughness for smooth-intent areas.
- Raised-detail strength for text/logos/emblems.
- Human Blender review.
- Browser GLB review.
- Runtime, cost, and failure behavior.

Promotion rule:

Run experiments as sidecar workflows first. After human review chooses a direction, wire the chosen path into the real approval workflow instead of leaving it hidden behind an optional experiment.

## Protocol 9 - ComfyUI And RunComfy Experiment Role

Use ComfyUI/RunComfy to test repeatable preprocessing and map generation around the current server-side generator.

Good ComfyUI outputs:

- Cleaned proof image.
- Subject mask.
- Smooth-region mask.
- Raised-graphic/text mask.
- Depth map.
- Normal map.
- Heightmap candidate.

Bad ComfyUI default for this product:

- Full object reconstruction that discards the 5:7 poster frame and turns the subject into a standalone mesh.

RunComfy/Civitai API keys may exist in local `.env`. They must remain local, ignored, and never copied into docs, manifests, logs, or commits.

## Protocol 10 - Next 30 Approved Examples Milestone

Milestone: `approved-relief-dataset-v1`.

Done when:

- 30 examples have approved production STLs.
- Each example has a manifest.
- Each example has extracted heightmap, normal/depth render, smooth mask, and raised-graphic mask.
- At least 3 examples are reserved as a holdout set.
- The deterministic generator has been tuned against the examples before model training begins.
- A LoRA training plan and a ControlNet/adapter training plan each name the exact inputs, targets, base model, license status, evaluation gates, and rollback path.
