# Test Hybrid Relief Product Flow

Status: open
Owner: Human
Created: 2026-05-11
Source: `AGENTS.md`, `AI_DEVELOPER_NOTES.md`, `CHECKLIST.md`, `apps/functions/src/index.ts`, `services/print-file-generator/app/models.py`, `services/print-file-generator/app/preview.py`, `services/print-file-generator/app/color_packages.py`

## Why Human

This needs Elliot's end-to-end product judgment in the browser: sign-in, upload, live proof generation, proof approval, hybrid print-file generation, 3D preview inspection, and checkout readiness need to feel like one product flow rather than isolated technical checks.

## Steps

1. Start the local product flow using the runbook commands in `elliot_quick_dev_Startup.md`.
2. Confirm the print-file generator has the provider credentials/dependencies needed for `masked_depth_detail_blend`; do not record secret values.
3. Create a new job from the web app with a portrait-style source image.
4. Approve the generated proof and wait for print-file generation.
5. Inspect the job page side by side: approved proof, `heightmap.png`, color `preview.glb`, printability status, and download links.
6. Confirm the generated `preview.glb` is no longer neutral gray and uses image-derived color while the downloadable STL still represents a 5.5in x 7.5in physical object with a 5in x 7in image relief window and 1/4in border.
7. Download and spot-check the color package files: `print-package.3mf`, `model.obj`, `model.mtl`, `texture.png`, `model.wrl`, and `model.ply`.
8. Download and spot-check the filament painting files: `palette.json`, `layer-swaps.txt`, `print-settings.json`, and filament `preview.png`.
9. Confirm checkout unlocks only after the hybrid print-file artifacts are generated.
10. If the flow fails, package files do not open, or the relief/color quality is not acceptable, capture the failure as the next AI developer fix target.

## Done When

- A new job completes from upload through checkout-ready state using `masked_depth_detail_blend` with `lithophane_baseline` detail source.
- The generated artifact metadata reports `width_mm: 139.7`, `height_mm: 190.5`, `image_window_width_mm: 127.0`, `image_window_height_mm: 177.8`, `border_mm: 6.35`, `full_color_package`, and `filament_painting`.
- The full-color and filament painting download links resolve to real files.
- The generated relief is judged acceptable enough to continue product development, or the specific failure is captured for the next implementation pass.

## Evidence To Capture

- Local routes checked, especially `/jobs/{jobId}`.
- Job id and artifact path names, without signed URLs or secret values.
- Screenshot or short notes about the heightmap, GLB color preview, and relief quality.
- Notes about whether the generated color-package and filament guide files open in available local tools.
- Any visible error message from the app, Functions emulator, or print-file generator.

## Related Files

- `AGENTS.md`
- `AI_DEVELOPER_NOTES.md`
- `elliot_quick_dev_Startup.md`
- `apps/functions/src/index.ts`
- `services/print-file-generator/app/models.py`
- `services/print-file-generator/app/preview.py`
- `services/print-file-generator/app/color_packages.py`
