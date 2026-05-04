# Print File Generator Service

Python Cloud Run service boundary for generating print-ready artifact bundles for 3D Print Posters.

This service replaces the narrower STL-only mental model. STL is still produced as a baseline geometry file, but the product needs a broader artifact package that can support both full-color relief printing and filament painting workflows.

## Responsibilities

- Read a selected generated image from Cloud Storage.
- Normalize the image into the 5in x 7in product composition.
- Generate deterministic heightmap and relief geometry artifacts.
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

This is an architecture scaffold only. The API contract returns reserved artifact paths and printability placeholders. Image processing, mesh generation, color packaging, slicer integration, and layer swap logic are intentionally not implemented yet.
