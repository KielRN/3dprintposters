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

The first real implementation should generate a deterministic closed 5in x 7in relief object with top surface, base plane, sidewalls, binary `model.stl`, `heightmap.png`, `metadata.json`, and printability checks. AI depth providers come after that deterministic path is working.

## Responsibilities

- Read a selected generated image from Cloud Storage.
- Normalize the image into the 5in x 7in product composition.
- Generate deterministic heightmap and closed relief geometry artifacts.
- Produce baseline geometry files for validation and fallback workflows.
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

The `/v1/generate` API can now read a local or GCS image, normalize it to the 5in x 7in product shape, build a deterministic luminance heightmap, export a closed binary STL, write a neutral-material `preview.glb`, write `heightmap.png`, write `metadata.json`, and run baseline printability checks.

`posterized_luminance` remains the default production-safe fallback provider. Experiment 1 can be run with opt-in deterministic providers and tuning settings:

- `continuous_luminance`: non-terraced luminance relief for portrait comparison.
- `lithophane_baseline`: brightness-to-thickness reference baseline.
- Relief tuning fields: `contrast`, `gamma`, `post_smooth_radius_px`, and `heightmap_png_bit_depth`.

Local provider comparison:

```powershell
python scripts/run_heightmap_experiment.py ..\..\.tmp\input_image\Gemini_Generated_Image_lzneejlzneejlzne.png
python scripts/run_heightmap_experiment.py ..\..\.tmp\input_image\Profile-Pic-HIMSS.jpg
```

Outputs are written under `.tmp/experiments/experiment_1/{provider}/{jobId}`.

Still intentionally deferred:

- Full-color 3MF/OBJ/VRML/PLY packages
- Filament painting palette and layer swap logic
- Partner-specific slicer, material, and fulfillment handoff logic
