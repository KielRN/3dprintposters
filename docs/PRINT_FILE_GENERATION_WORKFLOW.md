# Print File Generation Workflow

The print file generation pipeline turns the selected generated poster image into a job-scoped bundle of artifacts for preview, printability review, fulfillment, and future filament painting workflows.

This workflow supersedes the narrower STL-only framing. STL remains useful as a baseline geometry artifact, but it is not the whole production package.

## Service Boundary

Location: `services/print-file-generator`

Runtime target: Python on Cloud Run.

The service should stay separate from Firebase Functions because image processing, mesh generation, texture packaging, and filament painting preparation may need Python libraries, native dependencies, more CPU, more memory, and longer request windows.

Firebase Functions should orchestrate the job, authorize the user, write Firestore status updates, enqueue work, and handle Stripe or fulfillment side effects. The print file generator should only produce deterministic artifacts and metadata from approved inputs.

Implementation direction: keep this service's FastAPI contract and selectively extract useful core modules from `E:\PROJECTS\print-file-generator`. Use that project as a reference for image processing, heightmap settings, STL export, filament/color utilities, and tests. Do not import its Flask web app, SQLite state model, browser sessions, TD1 hardware communication, or local CLI as production architecture.

## Inputs

- `jobId`
- `uid`
- `approvedImagePath`, passed to the service contract as the selected image path for artifact generation.
- `outputPrefix`, normally `print-files/{uid}/{jobId}`
- Requested output modes:
  - `full_color_relief`
  - `filament_painting`
- Target physical dimensions: 139.7mm x 190.5mm for a 5.5in x 7.5in object.
- Image relief window: 127mm x 177.8mm for 5in x 7in, with a 6.35mm border on all sides.
- Relief depth range, initially 0.4mm to 3.0mm.
- Source image decoded pixel limit, initially 4,000,000 pixels before normalization to the working relief resolution.
- Base thickness, initially 1.2mm.
- Relief settings: height provider, contrast, gamma, post-heightmap smoothing radius, heightmap PNG bit depth, and hybrid detail source/weight.
- Full-color material profile, initially `mimaki_3duj_2207_full_color_uv_resin`.
- Filament material profile, initially `generic_multicolor_fdm_filament_painting`.
- Optional style metadata from the image generation step.

## Output Artifacts

All generated artifacts should be stored under:

```text
print-files/{uid}/{jobId}/
```

Shared baseline artifacts:

- `model.stl`
- `heightmap.png`
- `preview.glb`, with image-derived vertex colors for browser review.
- `metadata.json`

Full-color print partner artifacts:

- `full-color/print-package.3mf`
- `full-color/model.obj`
- `full-color/model.mtl`
- `full-color/texture.png`
- `full-color/model.wrl`
- `full-color/model.ply`

Filament painting artifacts:

- `filament-painting/palette.json`
- `filament-painting/layer-swaps.txt`
- `filament-painting/print-settings.json`
- `filament-painting/preview.png`

## Proposed Processing Steps

1. Fetch the approved generated image from Cloud Storage. During the current test flow, this may be the source upload used as a temporary proof.
2. Validate size, MIME type, dimensions, and safety metadata.
3. Normalize image orientation and resolution.
4. Crop or pad to the 5:7 image-window composition.
5. Choose the requested server-side height provider. The product default is `masked_depth_detail_blend` with `lithophane_baseline` detail source.
6. Generate a normalized float heightmap from the selected provider.
7. Apply optional tone controls, post-heightmap smoothing, quantization, and softened edge detail according to the provider.
8. Convert height values into closed relief geometry with a 5in x 7in image window, 1/4in border, top surface, bottom base plane, sidewalls, consistent winding, and controlled relief depth.
9. Add a poster base plate with minimum thickness.
10. Export baseline STL for geometry validation workflows.
11. Generate a color browser preview mesh.
12. Generate a full-color package for the selected print partner.
13. Generate filament painting palette and layer swap support files.
14. Run printability and package readiness checks.
15. Store artifacts and return a manifest to the orchestrating backend.

## Full-Color Relief Track

The full-color track targets Mimaki 3DUJ-2207 or comparable UV-curable inkjet 3D printing partners.

STL should be treated as a geometry baseline only. The production handoff should preserve color through a partner-approved format such as 3MF, OBJ plus texture, VRML, or PLY.

Partner confirmation is still required for:

- Accepted package format.
- Units and scaling.
- Minimum base thickness and relief depth.
- Texture format and color management.
- Quote and review workflow.
- Manual review versus API order creation.

## Filament Painting Track

The filament painting track prepares an FDM-friendly interpretation of the poster relief. It should be designed as a support package rather than a slicer replacement at first.

Planned outputs:

- `palette.json`: chosen filament colors, source image color mapping, and material assumptions.
- `layer-swaps.txt`: human-readable layer or height change instructions.
- `print-settings.json`: nozzle, layer height, material, dimensions, and relief settings.
- `preview.png`: 2D preview of the approximated filament color result.

Future versions may add slicer-specific project files or generated G-code, but those should wait until we choose the intended printer and slicer profiles. For now, keep the outputs portable and inspectable.

## Firestore Shape

`jobs/{jobId}` should eventually store an approved proof path and an artifact manifest rather than just one STL path:

- `approvedImagePath`
- `printFileStatus`
- `printFileOutputPrefix`
- `printFileArtifacts.modelStl`
- `printFileArtifacts.heightmapPng`
- `printFileArtifacts.previewGlb`
- `printFileArtifacts.metadataJson`
- `printFileArtifacts.fullColor3mf`
- `printFileArtifacts.fullColorObj`
- `printFileArtifacts.fullColorObjMtl`
- `printFileArtifacts.fullColorTexturePng`
- `printFileArtifacts.fullColorVrml`
- `printFileArtifacts.fullColorPly`
- `printFileArtifacts.filamentPaletteJson`
- `printFileArtifacts.filamentLayerSwapsTxt`
- `printFileArtifacts.filamentPrintSettingsJson`
- `printability`
- `printFileAudit`
- `packageReadiness`

The print-file audit is also written to `jobs/{jobId}/audit/printFileGeneration` after Functions reads `metadata.json` from Storage. Paid orders preserve the exact manifest, settings, and print-file audit used at checkout so future regeneration cannot silently change a customer order. The current checkout precondition requires `printFileStatus: "generated"` and generated `modelStl`/`previewGlb` artifact paths.

## Current MVP Strategy

The accepted extraction plan is now partially implemented:

- Preserve the existing FastAPI `/v1/generate` contract and stable output paths.
- Add service modules for image processing, heightmap generation, closed relief mesh generation, STL export, storage, metadata, and validation.
- Port/adapt only core concepts from `E:\PROJECTS\print-file-generator`.
- Generate hybrid relief artifacts: `model.stl`, image-colored `preview.glb`, `heightmap.png`, and `metadata.json`.
- Generate deterministic color-package artifacts: `full-color/print-package.3mf`, `full-color/model.obj`, `full-color/model.mtl`, `full-color/texture.png`, `full-color/model.wrl`, and `full-color/model.ply`.
- Generate portable filament-painting artifacts: `filament-painting/palette.json`, `filament-painting/layer-swaps.txt`, `filament-painting/print-settings.json`, and `filament-painting/preview.png`.
- Make the STL a closed, watertight 5.5in x 7.5in object with a 5in x 7in image relief window before adding color packages or fulfillment automation.
- Add printability checks before checkout can depend on generated print files.
- Use `masked_depth_detail_blend` as the default checkout provider with `lithophane_baseline` detail source.
- Write height-provider policy fields into `metadata.json` so deterministic brightness-to-height providers are marked fallback-only and current quality candidates are distinguishable from the safety net.
- Write `provider_audit` and `segmentation_status` into `metadata.json`; Functions copies the same audit into the job document and `jobs/{jobId}/audit/printFileGeneration`.
- Run local experiment comparisons with `python scripts/run_heightmap_experiment.py <source-image>` from `services/print-file-generator`; outputs stay under ignored `.tmp/experiments/experiment_1`.
- Run hybrid comparisons with `--provider masked_depth_detail_blend`; outputs stay under ignored `.tmp/experiments/hybrid` unless an explicit `--output-root` is provided.
- For future heightmap experiments, run both canonical local inputs from `.tmp/input_image`: `Gemini_Generated_Image_lzneejlzneejlzne.png` and `Profile-Pic-HIMSS.jpg`.
- Call the print-file generator from `approveGeneratedImage` after proof approval.
- Pass the production dimensions and relief settings from `approveGeneratedImage`: 139.7mm x 190.5mm physical object, 127mm x 177.8mm image window, 6.35mm border, `height_provider: masked_depth_detail_blend`, `detail_source: lithophane_baseline`, and `target_width_px: 200`.
- Store artifact paths and printability output on `jobs/{jobId}`.
- Render the approved proof, generated `heightmap.png`, and color `preview.glb` side by side on `/jobs/{jobId}`, with baseline, full-color, and filament-painting artifact downloads for local quality checks.
- Keep checkout locked until print-file artifacts are ready.
- For local hybrid testing, run the print-file generator on `http://127.0.0.1:8089` and set `PRINT_FILE_GENERATOR_URL` in `apps/functions/.env`.

Then improve:

- Deploy the print-file generator as a Cloud Run service and point `PRINT_FILE_GENERATOR_URL` at that endpoint.
- Move long-running print generation behind Cloud Tasks or Pub/Sub.
- Improve edge-preserving smoothing and subject-aware depth based on human product-flow test results.
- Validate the generated color-package formats with the chosen print partner.
- Add partner-specific package tuning once accepted format, units, texture/color handling, and review workflow are confirmed.
- Add slicer-specific exports after printer and slicer targets are known.

## Risks

- Noisy AI images can create unprintable tiny geometry.
- Faces may look strange when converted directly from brightness.
- Full-color printing and filament painting may need different geometry assumptions.
- Filament painting is highly printer, slicer, nozzle, layer height, and material dependent.
- Large geometry and texture files can get expensive to store and slow to upload.
- Fulfillment providers may reject models that look fine in browser preview.
