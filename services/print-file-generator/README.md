# Print File Generator Service

Python Cloud Run service boundary for generating print-ready artifact bundles for 3D Print Posters.

This service replaces the narrower STL-only mental model. STL is still produced as a baseline geometry file, but the product needs a broader artifact package that can support both full-color relief printing and filament painting workflows.

## Implementation Direction

Keep this service as the production FastAPI/Cloud Run boundary. The standalone `E:\PROJECTS\print-file-generator` project is a reference implementation for core ideas, not something to vendor wholesale.

Extract and adapt:

- image validation and pixel-array handling
- heightmap/settings concepts
- binary STL export patterns
- mesh metadata estimates
- color and filament utilities for later support files
- useful unit tests

Do not bring over:

- Flask routes
- SQLite project state
- browser session project handling
- local CLI control flow
- TD1 hardware communication
- the current open-surface mesh topology as-is

The current product path generates a hybrid closed 5.5in x 7.5in relief object with a 5in x 7in image window, 1/4in border, 768px geometry-analysis width, 400px mesh/color output width, top surface, base plane, sidewalls, binary `model.stl`, `preview.glb`, `heightmap.png`, `metadata.json`, and printability checks.

## Responsibilities

- Read a selected generated image from Cloud Storage.
- Normalize the image into the 5in x 7in product composition inside the larger bordered object.
- Generate hybrid heightmap and closed relief geometry artifacts.
- Produce baseline geometry files for validation workflows.
- Produce full-color handoff packages for Mimaki 3DUJ-2207 or comparable partners.
- Produce filament painting support files for FDM-style workflows.
- Generate browser preview assets and metadata.
- Return printability and package readiness summaries to the orchestrating backend.

## Planned API

```powershell
uvicorn app.main:app --reload --port 8089
```

Health check:

```powershell
Invoke-RestMethod http://localhost:8089/healthz
```

Stub generation:

```powershell
Invoke-RestMethod http://localhost:8089/v1/generate -Method Post -ContentType "application/json" -Body '{
  "job_id": "job_123",
  "uid": "user_123",
  "selected_image_path": "generated/user_123/job_123/preview.png",
  "output_prefix": "print-files/user_123/job_123"
}'
```

## Planned Output Bundle

All generated artifacts should live under a user/job-scoped prefix:

```text
print-files/{uid}/{jobId}/
```

Baseline relief artifacts:

- `model.stl`
- `heightmap.png`
- `preview.glb`
- `metadata.json`
- `debug/*.png`

Full-color print partner artifacts:

- `full-color/print-package.3mf`
- `full-color/model.obj`
- `full-color/texture.png`
- `full-color/model.wrl`
- `full-color/model.ply`

Filament painting artifacts:

- `filament-painting/palette.json`
- `filament-painting/layer-swaps.txt`
- `filament-painting/print-settings.json`
- `filament-painting/preview.png`

## Current State

The `/v1/generate` API can now read a local or GCS image, normalize it to the 5in x 7in image window at both 768px geometry-analysis width and 400px mesh/color output width, build a hybrid `masked_depth_detail_blend` heightmap, export a closed 5.5in x 7.5in binary STL with a 1/4in border, write an image-colored `preview.glb`, write `heightmap.png`, write `metadata.json`, write `debug/` relief-stage PNGs, and run baseline printability checks.

`masked_depth_detail_blend` is the default product relief provider. It uses geometry-only proof cleanup, Depth Anything semantic depth, contour-smoothed SegFormer subject masking, inferred v1 surface-intent masks, reduced `lithophane_baseline` detail gated by smooth/crisp/texture intent, broader surface-intent and face-aware smoothing, a face/forehead pit guard, guided-filter bas-relief compression, heightmap resampling to the output mesh width, image-window edge fade, and the existing closed STL/GLB generator. It does not apply a nose-specific height boost. `metadata.json` records each provider's policy with `height_provider_policy`, `height_provider_fallback_only`, `height_provider_target_quality_path`, and `height_provider_checkout_default_allowed`. It also records the proof style contract, `smooth-default-v1` surface-intent policy, and `surface_intent_status` audit used for print generation. Providers that use monocular depth, subject segmentation, portrait analysis, or surface-intent inference also write `provider_audit`, `segmentation_status`, `face_analysis_status`, `surface_intent_status`, and geometry-analysis dimensions so Functions can persist the exact per-job audit to Firestore.

Deterministic reference providers remain available for sidecar comparison:

- `continuous_luminance`: non-terraced luminance relief for portrait comparison.
- `lithophane_baseline`: brightness-to-thickness reference baseline.
- Relief tuning fields: `contrast`, `gamma`, `post_smooth_radius_px`, and `heightmap_png_bit_depth`.

Semantic depth reference provider:

- `depth_anything_v2_small`: Hugging Face Transformers Depth Anything V2 Small provider. It keeps STL/GLB generation deterministic after depth inference and is installed as part of the normal service runtime.

The product hybrid provider:

- `masked_depth_detail_blend`: semantic depth for low-frequency shape, contour-smoothed subject masking for background suppression, geometry-only proof cleanup for halos/faceted backgrounds/rough clothing texture, inferred surface-intent masks for smooth skin/scalp/neck/ears/hands/simple clothing/backgrounds, crisp text/logos/graphic edges, and request-gated shallow texture, reduced deterministic detail blending, surface-intent smoothing, OpenCV face-region masks for eye/nose/mouth/skin detail damping, broader head/neck/body smoothing, face/forehead pit guarding, guided-filter bas-relief compression, image-window edge fade, and the existing closed STL/GLB generator. It defaults to `lithophane_baseline` as the detail source at `detail_weight: 0.12`.

Local provider comparison:

```powershell
python scripts/run_heightmap_experiment.py ..\..\.tmp\input_image\Gemini_Generated_Image_lzneejlzneejlzne.png
python scripts/run_heightmap_experiment.py ..\..\.tmp\input_image\Profile-Pic-HIMSS.jpg
```

Outputs are written under `.tmp/experiments/experiment_1/{provider}/{jobId}`.

Depth Anything V2 Small comparison:

```powershell
python scripts/run_heightmap_experiment.py ..\..\.tmp\input_image\Gemini_Generated_Image_lzneejlzneejlzne.png --provider depth_anything_v2_small --output-root ..\..\.tmp\experiments\experiment_2
python scripts/run_heightmap_experiment.py ..\..\.tmp\input_image\Profile-Pic-HIMSS.jpg --provider depth_anything_v2_small --output-root ..\..\.tmp\experiments\experiment_2
```

Hybrid comparison:

```powershell
python scripts/run_heightmap_experiment.py ..\..\.tmp\input_image\Gemini_Generated_Image_lzneejlzneejlzne.png --provider masked_depth_detail_blend
python scripts/run_heightmap_experiment.py ..\..\.tmp\input_image\Profile-Pic-HIMSS.jpg --provider masked_depth_detail_blend
python scripts/run_heightmap_experiment.py ..\..\.tmp\input_image\Profile-Pic-HIMSS.jpg --provider masked_depth_detail_blend --detail-source posterized_luminance
```

Hybrid outputs are written under `.tmp/experiments/hybrid/masked_depth_detail_blend__{detailSource}/{jobId}` by default.

## Tests

Run the service suite from this directory:

```powershell
python -m pytest tests
```

The suite is organized by concern:

- `tests/contract/`: `/v1/generate`, response contracts, metadata schema, and storage-path behavior.
- `tests/unit/`: focused provider, relief mesh, quality gate, transform, and package-helper tests.
- `tests/integration/`: cross-module bundle tests. Add full-color package tests here when color artifacts are implemented.
- `tests/support.py`: shared fake depth and segmentation helpers for provider-backed flows.

Still intentionally deferred:

- Partner-specific slicer, material, and fulfillment handoff logic
- Human product-flow review of the 400px/768px relief path in the browser and Blender
- Further mesh-resolution increases until file size, preview performance, and partner upload limits are validated
