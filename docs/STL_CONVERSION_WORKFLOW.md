# STL Conversion Workflow

The 3D conversion pipeline is the riskiest technical area, so it is separated into a Python Cloud Run service with a stable API contract. This lets us iterate with Python imaging and mesh libraries, and it gives us a clean place to run another AI workflow if needed.

## Inputs

- `jobId`
- `uid`
- `sourceImagePath` or `selectedImagePath`
- Target dimensions: 216mm x 279mm for 8.5in x 11in.
- Relief depth range, initially 0.4mm to 3.0mm.
- Material profile, initially `white_resin_high_detail`.
- Optional style metadata from the image generation step.

## Output Artifacts

- `stl/{uid}/{jobId}/model.stl`
- `stl/{uid}/{jobId}/preview.glb` or simplified mesh JSON.
- `stl/{uid}/{jobId}/heightmap.png`
- `stl/{uid}/{jobId}/metadata.json`

## Proposed Processing Steps

1. Fetch selected generated image from Cloud Storage.
2. Validate size, MIME type, dimensions, and safety metadata.
3. Normalize image orientation and resolution.
4. Posterize or segment the image to reduce noisy micro-detail.
5. Generate a grayscale heightmap.
6. Smooth the heightmap enough for printability while preserving major edges.
7. Convert height values into a relief mesh.
8. Add a poster base plate with minimum thickness.
9. Export binary STL.
10. Generate preview mesh for browser display.
11. Run printability checks:
    - Watertight mesh.
    - Minimum thickness.
    - Triangle count.
    - Bounding box size.
    - Relief depth limit.
12. Store artifacts and return metadata.

## Where Another AI Workflow May Help

AI can be useful before mesh generation, but it should not be the only source of truth for printability.

Good AI-assisted candidates:

- Subject/background segmentation.
- Monocular depth estimation.
- Style prompts that produce clean posterized regions.
- Automated QA on generated previews.
- Suggesting color/material swap recipes.

Still deterministic:

- STL mesh construction.
- Physical dimensions.
- Minimum relief thickness.
- Fulfillment payloads.
- Payment and order state.

## First MVP Strategy

Start simple:

- Convert luminosity to Z height.
- Add base plate.
- Export STL.
- Show a browser preview.

Then improve:

- Add edge-preserving smoothing.
- Add subject-aware depth.
- Add material profiles.
- Add provider-specific printability checks.

## Risks

- Noisy AI images can create unprintable tiny geometry.
- Faces may look strange when converted directly from brightness.
- Large STL files can get expensive to store and slow to upload.
- Fulfillment providers may reject models that look fine in browser preview.
- Color printing and relief printing are different products and may require separate flows.

