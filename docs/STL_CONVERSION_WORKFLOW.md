# Image-To-3D Conversion Workflow

Note: this STL-focused workflow is now a subset of the broader [Print File Generation Workflow](./PRINT_FILE_GENERATION_WORKFLOW.md). Future implementation should happen under `services/print-file-generator`, with STL treated as one artifact in the print bundle.

The accepted implementation direction is selective extraction from `E:\PROJECTS\print-file-generator`: reuse core image, heightmap, STL, metadata, color, and test concepts, but keep the `3DPrintPosters` FastAPI/Cloud Run service boundary. Do not copy the standalone Flask, SQLite, browser-session, CLI, or TD1 hardware architecture into production.

The 3D conversion pipeline is the riskiest technical area, so it is separated into a Python Cloud Run service with a stable API contract. This lets us iterate with Python imaging and mesh libraries, and it gives us a clean place to run another AI workflow if needed.

The target product size is now a 5in x 7in physical relief. The target print path is a fulfillment business that can print on a Mimaki 3DUJ-2207 or comparable full-color UV-curable inkjet 3D printer. Keep Sculpteo API work on hold until we confirm whether it fits this printer and file-handoff strategy.

## Inputs

- `jobId`
- `uid`
- `sourceImagePath` or `approvedImagePath`
- Target dimensions: 127mm x 177.8mm for 5in x 7in.
- Relief depth range, initially 0.4mm to 3.0mm.
- Material profile, initially `mimaki_3duj_2207_full_color_uv_resin`.
- Optional style metadata from the image generation step.

## Output Artifacts

- `stl/{uid}/{jobId}/model.stl`
- `stl/{uid}/{jobId}/print-package.3mf` or provider-preferred OBJ/VRML/PLY package.
- `stl/{uid}/{jobId}/preview.glb` or simplified mesh JSON.
- `stl/{uid}/{jobId}/heightmap.png`
- `stl/{uid}/{jobId}/metadata.json`

STL remains useful as a geometry baseline and for generic printability checks, but STL does not carry full-color texture data. For Mimaki 3DUJ-2207 partners, preserve a color-capable handoff format such as 3MF, OBJ plus textures, VRML, or PLY once the partner confirms its preferred intake format.

## Proposed Processing Steps

1. Fetch the approved generated image from Cloud Storage. During the current test flow, this may be the source upload used as a temporary proof.
2. Validate size, MIME type, dimensions, and safety metadata.
3. Normalize image orientation and resolution.
4. Crop or pad to a 5:7 composition.
5. Posterize or segment the image to reduce noisy micro-detail.
6. Generate a grayscale heightmap.
7. Smooth the heightmap enough for printability while preserving major edges.
8. Convert height values into a closed watertight relief mesh with top surface, base plane, sidewalls, consistent normals, and exact 127mm x 177.8mm bounds.
9. Add a poster base plate with minimum thickness.
10. Attach color/texture data for the approved generated image.
11. Export binary STL for geometry validation.
12. Export a Mimaki-partner handoff package, initially 3MF or OBJ plus texture.
13. Generate preview mesh for browser display.
14. Run printability checks:
    - Watertight mesh.
    - Minimum thickness.
    - Triangle count.
    - Bounding box size.
    - Relief depth limit.
    - Color texture and mesh alignment.
    - Mimaki 3DUJ-2207 build envelope fit: 203mm x 203mm x 76mm, including support material.
15. Store artifacts and return metadata.

## Mimaki 3DUJ-2207 Target Notes

- Official printer model name: Mimaki 3DUJ-2207.
- Modeling method: UV-curable inkjet.
- Build area: 203mm x 203mm x 76mm, with a 3kg or less object limit.
- Published 3D data formats include SSTL, OBJ, VRML, PLY, and 3MF.
- 5in x 7in equals 127mm x 177.8mm, which fits within the published build area before adding depth and supports.
- Treat the print partner as the source of truth for accepted file package, wall/base thickness, relief depth, minimum feature size, color management, support cleanup, and post-processing.

## Where Another AI Workflow May Help

AI can be useful before mesh generation, but it should not be the only source of truth for printability.

Good AI-assisted candidates:

- Subject/background segmentation.
- Monocular depth estimation.
- Style prompts that produce clean posterized regions.
- Automated QA on generated previews.
- Suggesting full-color texture cleanup for Mimaki-style color printing.

Still deterministic:

- Relief mesh construction.
- Physical dimensions.
- Minimum relief thickness.
- Fulfillment or partner handoff payloads.
- Payment and order state.

## First MVP Strategy

Start simple:

- Convert luminosity to Z height.
- Add a closed base plate and sidewalls.
- Export STL.
- Export a color-aware preview and record the intended 5x7 dimensions.
- Show a browser preview.

Then improve:

- Add edge-preserving smoothing.
- Add subject-aware depth.
- Add material profiles.
- Add Mimaki partner-specific printability and color-package checks.

## Risks

- Noisy AI images can create unprintable tiny geometry.
- Faces may look strange when converted directly from brightness.
- Large STL files can get expensive to store and slow to upload.
- Fulfillment providers may reject models that look fine in browser preview.
- Full-color printing and simple relief printing may require different file outputs, QA checks, and fulfillment partners.
- Mimaki 3DUJ-2207 partners may require manual quoting or file review before API automation is practical.
