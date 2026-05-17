# Image-To-3D Conversion Workflow

Note: this STL-focused workflow is now a subset of the broader [Print File Generation Workflow](./PRINT_FILE_GENERATION_WORKFLOW.md). Future implementation should happen under `services/print-file-generator`, with STL treated as one artifact in the print bundle.

The accepted implementation direction is selective extraction from `E:\PROJECTS\print-file-generator`: reuse core image, heightmap, STL, metadata, color, and test concepts, but keep the `3DPrintPosters` FastAPI/Cloud Run service boundary. Do not copy the standalone Flask, SQLite, browser-session, CLI, or TD1 hardware architecture into production.

The 3D conversion pipeline is the riskiest technical area, so it is separated into a Python Cloud Run service with a stable API contract. This lets us iterate with Python imaging and mesh libraries, and it gives us a clean place to run another AI workflow if needed.

The target product size is now a 5.5in x 7.5in physical relief with a 5in x 7in image window and 1/4in border. The target print path is a fulfillment business that can print on a Mimaki 3DUJ-2207 or comparable full-color UV-curable inkjet 3D printer. Keep Sculpteo API work on hold until we confirm whether it fits this printer and file-handoff strategy.

The MVP visual north star is the "Super Dad" generated proof: controlled poster art with smooth stylized human surfaces, clean body volumes, crisp raised text/logos, simple backgrounds, and intentional material texture only. STL generation should not preserve every source-photo or proof texture as geometry.

## Inputs

- `jobId`
- `uid`
- `sourceImagePath` or `approvedImagePath`
- Target physical dimensions: 139.7mm x 190.5mm for 5.5in x 7.5in.
- Image relief window: 127mm x 177.8mm for 5in x 7in, with a 6.35mm border on all sides.
- Geometry-analysis width: 768px by default.
- Mesh/color output width: 400px by default.
- Relief depth range, initially 0.4mm to 3.0mm.
- Material profile, initially `mimaki_3duj_2207_full_color_uv_resin`.
- Optional style and surface-intent metadata from the image generation step.

## Output Artifacts

- `print-files/{uid}/{jobId}/model.stl`
- `print-files/{uid}/{jobId}/full-color/print-package.3mf` or provider-preferred OBJ/VRML/PLY package.
- `print-files/{uid}/{jobId}/preview.glb`
- `print-files/{uid}/{jobId}/heightmap.png`
- `print-files/{uid}/{jobId}/metadata.json`

STL remains useful as a geometry baseline and for generic printability checks, but STL does not carry full-color texture data. For Mimaki 3DUJ-2207 partners, preserve a color-capable handoff format such as 3MF, OBJ plus textures, VRML, or PLY once the partner confirms its preferred intake format.

## Proposed Processing Steps

1. Fetch the approved generated image from Cloud Storage. During the current test flow, this may be the source upload used as a temporary proof.
2. Validate size, MIME type, dimensions, and safety metadata.
3. Normalize image orientation and resolution.
4. Crop or pad to a 5:7 composition at both geometry-analysis and mesh/color output widths.
5. Segment the subject, smooth the subject contour, and build or infer a surface-intent map. Default to smooth surfaces unless text, logos, emblems, panel lines, hair, fabric, or other printable texture classes are explicitly requested.
6. Build a geometry-only proof-cleanup image to reduce halos, faceted backgrounds, and unintended skin/scalp/neck/shirt texture noise.
7. Generate a hybrid heightmap from semantic depth plus controlled deterministic detail.
8. Smooth the heightmap enough for printability while preserving major designed edges and applying portrait/body smoothing for face, scalp/top-of-head, neck, ears, hands, shirt/collar, and other smooth-intent regions.
9. Resample the heightmap from 768px analysis width to 400px output width.
10. Convert height values into a closed watertight relief mesh with top surface, base plane, sidewalls, consistent normals, and exact 139.7mm x 190.5mm physical bounds.
11. Add a poster base plate with minimum thickness.
12. Attach color/texture data from the approved generated image.
13. Export binary STL for geometry validation.
14. Export a Mimaki-partner handoff package, initially 3MF or OBJ plus texture.
15. Generate preview mesh for browser display.
16. Run printability checks:
    - Watertight mesh.
    - Minimum thickness.
    - Triangle count.
    - Bounding box size.
    - Relief depth limit.
    - Color texture and mesh alignment.
    - Region roughness limits for smooth-intent surfaces.
    - Mimaki 3DUJ-2207 build envelope fit: 203mm x 203mm x 76mm, including support material.
17. Store artifacts and return metadata.

## Mimaki 3DUJ-2207 Target Notes

- Official printer model name: Mimaki 3DUJ-2207.
- Modeling method: UV-curable inkjet.
- Build area: 203mm x 203mm x 76mm, with a 3kg or less object limit.
- Published 3D data formats include STL, OBJ, VRML, PLY, and 3MF.
- 5.5in x 7.5in equals 139.7mm x 190.5mm, which fits within the published build area before adding depth and supports.
- Treat the print partner as the source of truth for accepted file package, wall/base thickness, relief depth, minimum feature size, color management, support cleanup, and post-processing.

## Where Another AI Workflow May Help

AI can be useful before mesh generation, but it should not be the only source of truth for printability.

Good AI-assisted candidates:

- Subject/background segmentation.
- Monocular depth estimation.
- Style prompts that produce clean posterized regions.
- Surface-intent or region/material metadata for controlled styles.
- Automated QA on generated previews.
- Suggesting full-color texture cleanup for Mimaki-style color printing.

Still deterministic:

- Relief mesh construction.
- Physical dimensions.
- Minimum relief thickness.
- Fulfillment or partner handoff payloads.
- Payment and order state.

## First MVP Strategy

Current MVP path:

- Use `masked_depth_detail_blend` as the checkout default.
- Use 768px geometry analysis and 400px mesh/color output.
- Add a closed base plate, sidewalls, shaped 1/4in border, STL, color preview, metadata, full-color package artifacts, and filament-painting support files.
- Show the approved proof, heightmap, and generated GLB on the job page after proof approval.
- Promote the Super Dad controlled-art path as the default style target for the next relief-quality pass.

Then improve:

- Add surface-intent-aware smoothing/detail gating, then validate the new roughness/blocky-edge tuning through browser and Blender review.
- Add Mimaki partner-specific printability and color-package checks.

## Risks

- Noisy AI images can create unprintable tiny geometry.
- Controlled proofs can still carry visual texture that should remain color-only, not geometry, unless surface intent suppresses it.
- Faces may look strange when converted directly from brightness.
- Large STL files can get expensive to store and slow to upload.
- Fulfillment providers may reject models that look fine in browser preview.
- Full-color printing and simple relief printing may require different file outputs, QA checks, and fulfillment partners.
- Mimaki 3DUJ-2207 partners may require manual quoting or file review before API automation is practical.
