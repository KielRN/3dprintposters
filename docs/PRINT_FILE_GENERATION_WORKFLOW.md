# Print File Generation Workflow

Status: parked poster-relief R&D as of 2026-05-23. The active customer-acquisition direction is a PrintU-like standalone figurine flow using generated 3D model providers, with Meshy.ai as the first candidate. Keep this document as the implemented poster-relief service contract and resume it only if/when the relief product line is reactivated.

The print file generation pipeline turns the selected generated poster image into a job-scoped bundle of artifacts for preview, printability review, fulfillment, and future filament painting workflows.

This workflow supersedes the narrower STL-only framing. STL remains useful as a baseline geometry artifact, but it is not the whole production package.

## Service Boundary

Location: `services/print-file-generator`

Runtime target: Python on Cloud Run.

The service should stay separate from Firebase Functions because image processing, mesh generation, texture packaging, and filament painting preparation may need Python libraries, native dependencies, more CPU, more memory, and longer request windows.

Firebase Functions should orchestrate the job, authorize the user, write Firestore status updates, enqueue work, and handle Stripe or fulfillment side effects. The print file generator should only produce deterministic artifacts and metadata from approved inputs.

Implementation direction: keep this service's FastAPI contract and selectively extract useful core modules from `E:\PROJECTS\print-file-generator`. Use that project as a reference for image processing, heightmap settings, STL export, filament/color utilities, and tests. Do not import its Flask web app, SQLite state model, browser sessions, TD1 hardware communication, or local CLI as production architecture.

## Figurine Scale Contract

The active figurine print path uses Meshy Creative Lab as a provider for the body/figurine only. The reusable base, customer name, body/base placement, and final printable export are deterministic print-file-generator responsibilities.

Validated milestone:

- Reference job: `f604d393-bfa2-4779-b05b-f6a2082604c9`
- Meshy source asset: `print-files/{uid}/{jobId}/figurine/creative-lab-original/model.glb`
- Local mirrored source asset: `.tmp/print-files/N6wSBUfLdEcQy82BG3l1duHmXTY2/f604d393-bfa2-4779-b05b-f6a2082604c9/figurine/creative-lab-original/model.glb`
- Matched square base source: `.tmp/gold-standard/Figurine Standard Square Base/full_color/base.glb`
- Matched square base STL: `.tmp/gold-standard/Figurine Standard Square Base/single_color/base.stl`

Current raw-size measurements:

| Asset | Coordinate Convention | X | Y | Z |
| --- | --- | ---: | ---: | ---: |
| Meshy `model.glb` on disk | GLB, Y-up | `0.786765` | `1.899262` | `0.689108` |
| Meshy clean Blender import | Blender, Z-up | `0.786765` | `0.689108` | `1.899262` |
| Square `base.glb` on disk | GLB, Y-up | `1.332571` | `0.303882` | `1.332571` |
| Square `base.stl` / clean Blender import | Z-up | `1.332571` | `1.332571` | `0.303882` |

Target print size:

- Figurine target height: `150mm` (about 6 inches).
- Scale factor from raw Meshy GLB: `150 / 1.899262249 = 78.978034802`.
- Expected scaled figurine body envelope: about `62.14mm x 54.42mm x 150.00mm`.
- Expected scaled square base: about `105.24mm x 105.24mm x 24.00mm`.

Implementation rule:

1. Load the raw Meshy Creative Lab `model.glb`; do not overwrite or resize the provider source file.
2. Load the generated named-base STL from the deterministic base service.
3. Align the figurine feet/contact area over the base and float the body's support plane a `10mm` clearance gap above the base top plane (`placementZones.bodyBaseClearanceGapMm` in the base manifest, default `10.0`). Meshy/Hi3D sometimes bake their own plinth under the body; the gap leaves the 3D print service room to edit the provider plinth away before joining the body to the deterministic base.
4. Scale the body to `150mm` figurine height while keeping the named base in millimeter product units.
5. Export print-review artifacts, separating inherited Meshy body defects from deterministic base/name/assembly defects.

Current assembled-package endpoint:

```text
POST /v1/figurine/assemble
```

Request fields:

- `job_id`
- `uid`
- `source_preview_glb_path`
- `named_base_stl_path`
- `base_id`, currently `figurine-square-v1`
- `named_base_revision`
- `output_prefix`
- `target_body_height_mm`, default `150.0`

Generated assembled artifacts:

- `assembled-preview.glb`
- `assembled.stl`
- `assembled.3mf`
- `metadata.json`
- `sources/source-creative-lab.glb`
- `sources/source-named-base.stl`

Firebase Functions writes these under:

```text
print-files/{uid}/{jobId}/figurine/assembled/{assemblyId}/
```

The follow-up `runFigurinePrintTooling` callable sends the assembled GLB to Meshy by signed `model_url` and persists sanitized Analyze, Repair, repaired Analyze, Remesh, and remeshed Analyze state under `figurinePrintTooling`. In the local Functions emulator only, user ADC may be unable to sign Storage URLs because no service-account `client_email` is available; that path falls back to a Meshy-supported `data:model/gltf-binary` URL for the same assembled GLB so dev print-tooling runs are not blocked by public Storage download behavior. Remesh uses quad topology, `100000` target polycount, and `glb,stl,3mf` target formats. Meshy Analyze is run only on GLB/STL outputs; 3MF remains for local or slicer review.

## Inputs

- `jobId`
- `uid`
- `approvedImagePath`, passed to the service contract as the selected image path for artifact generation.
- `outputPrefix`, normally `print-files/{uid}/{jobId}`
- Requested output modes:
  - `full_color_relief`
  - `filament_painting`
- Target physical dimensions: 139.7mm x 190.5mm for a 5.5in x 7.5in object.
- Image relief window: 127mm x 177.8mm for 5in x 7in, with a shaped 6.35mm border/frame on all sides.
- Relief depth range, initially 0.4mm to 3.0mm.
- Source image decoded pixel limit, initially 4,000,000 pixels before normalization to both the geometry-analysis image and mesh/color output image.
- Base thickness, initially 1.2mm.
- Relief settings: height provider, geometry-analysis width, mesh target width, contrast, gamma, post-heightmap smoothing radius, heightmap PNG bit depth, and hybrid detail source/weight.
- Optional portrait-region analysis metadata from local/server-side face detection or landmarks. This should be used for relief tuning only, not identity recognition.
- Style and surface-intent metadata from proof generation. The Super Dad MVP path uses `super-dad-north-star-v1` plus `smooth-default-v1`: smooth printable surfaces are the default unless a region is explicitly marked as raised text, logo, graphic edge, panel line, hair, fabric, or another intentional texture class.
- Full-color material profile, initially `mimaki_3duj_2207_full_color_uv_resin`.
- Filament material profile, initially `generic_multicolor_fdm_filament_painting`.

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
- `debug/*.png`, local/developer relief-stage images for diagnosing depth, mask, graphic emboss, detail, and final heightmap quality.

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
4. Crop or pad to the 5:7 image-window composition twice: a 768px-wide geometry-analysis image for depth/segmentation/detail and a 400px-wide mesh/color output image for final artifacts.
5. Choose the requested server-side height provider. The product default is `masked_depth_detail_blend` with `lithophane_baseline` as a HueForge-like subject height signal.
6. Generate local/server-side face-region status with OpenCV Haar face boxes. When faces are detected, build soft face-oval, central-face, eye, nose, and mouth masks for relief tuning only; defer external face APIs until local misses are proven in product-flow review.
7. Generate or infer a surface-intent map. V1 can combine style metadata, subject mask, portrait masks, and image cues, but the policy should be explicit: smooth by default; use a separate graphic emboss mask for intentional text, logos, emblems, and panel lines; preserve shallow texture only for approved hair, fabric, or material texture classes.
8. Generate a contour-smoothed subject mask, then build a geometry-only proof-cleanup image that suppresses subject halos, faceted backgrounds, and noisy skin/scalp/neck/shirt/background texture without changing the approved color proof used for texture output.
9. Generate a normalized float heightmap from the selected provider at geometry-analysis resolution.
10. Apply optional tone controls, post-heightmap smoothing, quantization, HueForge-like lithophane subject height blending, softened edge detail, graphic emboss, reduced edge-aware subject-surface smoothing, reduced face-aware smoothing, face/forehead pit guarding, surface-intent detail gating, resampling to the 400px mesh output, and an image-window edge fade so relief settles before the shaped frame.
11. Convert height values into closed relief geometry with a 5in x 7in image window, shaped 1/4in border/frame, top surface, bottom base plane, sidewalls, consistent winding, and controlled relief depth.
12. Add a poster base plate with minimum thickness.
13. Export baseline STL for geometry validation workflows.
14. Generate a color browser preview mesh.
15. Generate a full-color package for the selected print partner.
16. Generate filament painting palette and layer swap support files.
17. Run printability, package readiness, and region roughness checks, including smooth-subject/background noise and crisp-graphic flatness metrics.
18. Store artifacts and return a manifest to the orchestrating backend.

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
- `printFileArtifacts.debugArtifacts`
- `printability`
- `printFileAudit`
- `packageReadiness`

The print-file audit is also written to `jobs/{jobId}/audit/printFileGeneration` after Functions reads `metadata.json` from Storage. Paid orders preserve the exact manifest, settings, and print-file audit used at checkout so future regeneration cannot silently change a customer order. The current checkout precondition requires `printFileStatus: "generated"` and generated `modelStl`/`previewGlb` artifact paths.

Figurine print-readiness fields are separate from the poster-relief print-file fields:

- `figurineAssembly.status`
- `figurineAssembly.assemblyId`
- `figurineAssembly.sourcePreviewGlb`
- `figurineAssembly.namedBaseRevision`
- `figurineAssembly.artifacts.assembledPreviewGlb`
- `figurineAssembly.artifacts.assembledStl`
- `figurineAssembly.artifacts.assembled3mf`
- `figurineAssembly.artifacts.metadata`
- `figurineAssembly.metrics`
- `figurineAssembly.warnings`
- `figurinePrintTooling.status`
- `figurinePrintTooling.inputAssemblyId`
- `figurinePrintTooling.originalAnalyze`
- `figurinePrintTooling.repair`
- `figurinePrintTooling.repairedAnalyze`
- `figurinePrintTooling.remesh`
- `figurinePrintTooling.remeshAnalyzeByFormat`
- `figurinePrintTooling.recommendedPath`
- `figurinePrintTooling.warnings`
- `figurineReview.status`
- `figurineReview.decision`
- `figurineReview.notes`

These fields do not unlock checkout by themselves. `figurinePreview.printReadiness` stays `needs_review` until a later explicit product decision changes the fulfillment gate.

## Current MVP Strategy

The accepted extraction plan is now partially implemented:

- Preserve the existing FastAPI `/v1/generate` contract and stable output paths.
- Add service modules for image processing, heightmap generation, closed relief mesh generation, STL export, storage, metadata, and validation.
- Port/adapt only core concepts from `E:\PROJECTS\print-file-generator`.
- Generate hybrid relief artifacts: `model.stl`, image-colored `preview.glb`, `heightmap.png`, and `metadata.json`.
- Generate deterministic color-package artifacts: `full-color/print-package.3mf`, `full-color/model.obj`, `full-color/model.mtl`, `full-color/texture.png`, `full-color/model.wrl`, and `full-color/model.ply`.
- Generate portable filament-painting artifacts: `filament-painting/palette.json`, `filament-painting/layer-swaps.txt`, `filament-painting/print-settings.json`, and `filament-painting/preview.png`.
- Make the STL a closed, watertight 5.5in x 7.5in object with a 5in x 7in image relief window and shaped border/frame before adding fulfillment automation.
- Add printability checks before checkout can depend on generated print files.
- Use `masked_depth_detail_blend` as the default checkout provider with `lithophane_baseline` detail source.
- Use face-aware portrait tuning in the default hybrid path before adding another external AI API: local OpenCV face boxes produce soft masks that reduce harsh deterministic detail around eyes, mouth, skin texture, and outer face areas. Do not add a nose-specific height boost; use a face/forehead pit guard to prevent local facial depressions without creating new protruding shapes.
- Use a 768px geometry-analysis image and 400px mesh/color output by default. The hybrid provider builds depth, segmentation, detail, and geometry-only proof cleanup at analysis resolution, then resamples the finished heightmap to the output mesh resolution before STL/GLB/package generation.
- Use contour-smoothed subject masks and geometry-only proof cleanup in the production hybrid path to reduce blocky silhouette/shirt boundaries, white subject-outline ridges, faceted background relief, and rough shirt/background texture.
- Adopt the Super Dad generated proof as the north-star MVP style. The proof-generation path now uses the `super-dad-north-star-v1` style contract to ask for controlled poster art: smooth stylized skin and body forms, simple backgrounds, crisp raised text/logos, and intentionally limited material texture.
- Use the print-file generator's v1 inferred surface-intent masks in the default hybrid path. The default for unmarked surfaces is smooth, especially scalp/top-of-head, neck, ears, hands, simple clothing, and background regions. A cleaned `emboss_mask` applies deliberate raised treatment to text, logos, emblems, graphic edges, and panel lines. Hair, fabric, and material texture stay shallow and are enabled only when proof-generation or human override metadata explicitly requests texture. The current request schema and `metadata.json` use `smooth-default-v1`, and `metadata.json` records `surface_intent_status`, including `roughness_metrics`.
- Capture inferred `surface_intent_status` in the print-file audit. Full proof/style metadata threading from job creation through paid order audit remains a follow-up so each paid order preserves the exact style contract and smoothing/detail policy used at checkout.
- Write height-provider policy fields into `metadata.json` so deterministic brightness-to-height providers are marked fallback-only and current quality candidates are distinguishable from the safety net.
- Write `provider_audit`, `segmentation_status`, `face_analysis_status`, `surface_intent_status`, `geometry_analysis_width_px`, and `geometry_analysis_height_px` into `metadata.json`; Functions copies the same audit fields into the job document and `jobs/{jobId}/audit/printFileGeneration`.
- Run local experiment comparisons with `python scripts/run_heightmap_experiment.py <source-image>` from `services/print-file-generator`; outputs stay under ignored `.tmp/experiments/experiment_1`.
- Run hybrid comparisons with `--provider masked_depth_detail_blend`; outputs stay under ignored `.tmp/experiments/hybrid` unless an explicit `--output-root` is provided.
- For future heightmap experiments, run both canonical local inputs from `.tmp/input_image`: `Gemini_Generated_Image_lzneejlzneejlzne.png` and `Profile-Pic-HIMSS.jpg`.
- Call the print-file generator from `approveGeneratedImage` after proof approval.
- Pass the production dimensions and relief settings from `approveGeneratedImage`: 139.7mm x 190.5mm physical object, 127mm x 177.8mm image window, 6.35mm border, `height_provider: masked_depth_detail_blend`, `detail_source: lithophane_baseline`, `detail_weight: 0.38`, `target_width_px: 400`, `geometry_analysis_width_px: 768`, `max_triangle_count: 1000000`, and `max_binary_stl_bytes: 50000000`.
- Store artifact paths and printability output on `jobs/{jobId}`.
- Render the approved proof and generated `heightmap.png` in a comparison row on `/jobs/{jobId}`, with the color `preview.glb` in a larger full-width inspection panel below with interactive zoom/orbit controls and without customer-facing artifact download links.
- During local Functions emulator runs, mirror generated print-file artifacts, including `debug/` relief-stage PNGs, to `.tmp/print-files/{uid}/{jobId}` so the full bundle is available on disk for inspection and future printer-owner handoff.
- Keep checkout locked until print-file artifacts are ready.
- For local hybrid testing, run the print-file generator on `http://127.0.0.1:8089` and set `PRINT_FILE_GENERATOR_URL` in `apps/functions/.env`.
- Keep the `approveGeneratedImage` callable and browser client timeout aligned at 9 minutes; first local hybrid relief runs can exceed the default 60-second callable timeout while still succeeding in the Python generator.
- In local emulator runs, mark the job `generated` after artifact paths and audit are captured, then mirror generated artifacts to `.tmp` as follow-up developer convenience so checkout and preview are not blocked by GCS-to-disk downloads.

Then improve:

- Deploy the print-file generator as a Cloud Run service and point `PRINT_FILE_GENERATOR_URL` at that endpoint.
- Move long-running print generation behind Cloud Tasks or Pub/Sub.
- Improve edge-preserving smoothing and subject-aware depth based on human product-flow test results.
- Tune the Super Dad surface-intent path from fresh browser and Blender review after the 2026-05-18 graphic emboss/smooth-suppression pass, with face mid-form readability, scalp/top-of-head, neck, shirt/collar, text/logo crispness, request-gated texture, and unintended roughness called out explicitly.
- Review whether the 400px mesh output is enough for the intended print partner after Blender/app inspection; future increases should account for STL/package size, browser preview performance, and partner upload limits.
- Validate the generated color-package formats with the chosen print partner.
- Add partner-specific package tuning once accepted format, units, texture/color handling, and review workflow are confirmed.
- Add slicer-specific exports after printer and slicer targets are known.

## Risks

- Noisy AI images can create unprintable tiny geometry.
- Proofs that look visually appealing but contain uncontrolled photorealistic or AI brush texture can still create rough print geometry if inferred surface-intent thresholds miss the noisy region or if proof style constraints drift.
- Faces may look strange when converted directly from brightness.
- Full-color printing and filament painting may need different geometry assumptions.
- Filament painting is highly printer, slicer, nozzle, layer height, and material dependent.
- Large geometry and texture files can get expensive to store and slow to upload.
- Fulfillment providers may reject models that look fine in browser preview.
