# Print File Generator Architecture Roadmap Evaluation

Date: 2026-05-06

## Decision Summary

The standalone `E:\PROJECTS\print-file-generator` project should not be appended wholesale into `3DPrintPosters`. It should be treated as a working reference implementation and selectively integrated into the existing `services/print-file-generator` Cloud Run service.

Recommended path:

1. Keep the current `3DPrintPosters/services/print-file-generator` FastAPI contract as the production service boundary.
2. Extract and adapt only the useful deterministic generation primitives from `E:\PROJECTS\print-file-generator`.
3. Replace the current lithophane-style open surface mesh with a poster-relief mesh builder that creates a closed, watertight 5in x 7in object with sidewalls and base.
4. Add depth-model adapters after the deterministic relief path is working.
5. Keep full image-to-3D asset models as side experiments, not the first production path.

In practical terms: integrate the generator's core ideas, not its local app architecture.

## Inputs Reviewed

- `AI_3D_MODEL_GENERATION_RESEARCH.md`
- `docs/ARCHITECTURE.md`
- `docs/PRINT_FILE_GENERATION_WORKFLOW.md`
- `docs/ROADMAP.md`
- `services/print-file-generator`
- `E:\PROJECTS\print-file-generator`

## Current Architecture Comparison

| Area | `3DPrintPosters` target service | Standalone `print-file-generator` | Architecture implication |
| --- | --- | --- | --- |
| Runtime | FastAPI service on Cloud Run | Python package, CLI, Flask local web app | Keep FastAPI for production. Do not bring Flask into the service path. |
| State | Firestore and Cloud Storage owned by Firebase/GCP workflow | SQLite local project database | Do not integrate SQLite as production state. Use Firestore job/order records and Cloud Storage artifacts. |
| API | Contract-first `/v1/generate` returning artifact manifest and printability summary | Local web endpoints for projects, filaments, color tools, STL generation | Use the standalone API behavior as reference only. Preserve the existing manifest contract. |
| Geometry | Stub only today | Luminance-to-height STL generation | Good starting primitive, but must be refactored for watertight relief output. |
| Mesh closure | Required: sidewalls, base plate, printable object | Current generator creates top grid faces only | Must add closed mesh generation before production. |
| Product dimensions | 127mm x 177.8mm poster relief | Generic lithophane dimensions, aspect-ratio handling | Adapt settings to fixed 5x7 defaults with configurable crop/pad. |
| AI depth | Research recommends Depth Anything V2 Small, Depth Pro, or MoGe | Not implemented | Add as pluggable depth provider after deterministic MVP. |
| Output bundle | STL, heightmap, GLB, metadata, full-color package, filament support | STL and local metadata | Use the standalone STL path as one artifact, not the whole package. |
| Color workflow | Full-color print partner and filament painting support | Filament library and color matching utilities | Filament/color code is useful later, especially for support files, not the first relief MVP. |
| Tests | Contract tests only | Unit and Flask API tests | Port the valuable mesh/image validation tests into the service test suite. |

## Main Finding

The research document and the current `3DPrintPosters` architecture already agree on the service boundary: `services/print-file-generator` should be the deterministic manufacturing layer. The standalone generator is useful because it has real Python code for image loading, heightmap generation, STL writing, project settings, filament metadata, and tests.

The mismatch is that the standalone project is framed as a local lithophane app, while `3DPrintPosters` needs a stateless, job-scoped Cloud Run worker that writes artifact bundles to Cloud Storage.

## Integration Recommendation

Use a selective extraction strategy.

### Integrate

- `LithophaneSettings` concepts that map to width, height, relief range, layer height, smoothing, negative mode, and reverse relief mode.
- Image processing routines for loading, validating, resizing, RGB conversion, and pixel arrays.
- STL binary export patterns, after replacing the mesh topology with closed relief geometry.
- Mesh metadata estimates, expanded to include physical dimensions, watertightness status, triangle count, file size, and printability results.
- Color and filament utility concepts for the later filament-painting package.
- Unit tests for invalid pixels, invalid settings, oversized images, STL metadata, and generation limits.

### Do Not Integrate

- Flask web app routes.
- SQLite project database as production state.
- Browser session project handling.
- TD1 hardware communication in the Cloud Run service path.
- Local CLI as a production control plane.
- The current open-surface mesh topology as-is.

### Keep As Reference

- Standalone web UI workflows for future admin/operator tooling ideas.
- Filament library import/export format.
- Color matching utilities for later FDM support.
- Existing roadmap items around progress reporting, streaming output, and performance benchmarking.

## Critical Gap: Mesh Topology

The standalone `LithophaneGenerator` is a useful proof that pixels can become STL bytes, but it currently builds a top surface from a grid:

- vertices are generated only for the heightmap surface
- faces are generated only across the top grid
- base thickness settings are present but are not used to create a closed base
- sidewalls and a bottom face are not generated

That is not enough for the 3D Print Posters product. The first production mesh builder must create a closed relief object:

- top relief surface
- bottom base plane
- four sidewalls
- optional border lip
- consistent winding and normals
- exact 127mm x 177.8mm bounds
- relief values clamped between configured minimum and maximum
- watertight validation before upload

This is the highest-priority architecture correction before adding AI depth models.

## Proposed Target Modules

The existing service can evolve into this shape:

```text
services/print-file-generator/
  app/
    main.py
    models.py
    generation.py
    storage.py
    image_pipeline.py
    depth/
      __init__.py
      base.py
      luminance.py
      depth_anything.py
      depth_pro.py
      moge.py
    relief/
      __init__.py
      settings.py
      heightmap.py
      mesh.py
      stl.py
      glb.py
      validation.py
    packages/
      full_color.py
      filament_painting.py
    metadata.py
```

The first production code should favor simple module boundaries over a heavy framework:

- `image_pipeline.py`: fetch, decode, normalize, crop/pad, resize, denoise.
- `depth/`: pluggable depth providers with a deterministic luminance fallback.
- `relief/heightmap.py`: smooth, clamp, normalize, and convert depth to millimeters.
- `relief/mesh.py`: create closed poster relief geometry.
- `relief/validation.py`: printability and mesh checks.
- `generation.py`: orchestrate a single job and produce the manifest.
- `storage.py`: Cloud Storage read/write adapter, with a local test adapter.

## Roadmap

### Phase 0: Architecture Lock

Goal: make the service contract and source-of-truth boundaries explicit before code migration.

Tasks:

- Keep FastAPI `/v1/generate` as the public service entrypoint.
- Confirm Cloud Storage object naming under `print-files/{uid}/{jobId}/`.
- Add a metadata schema for source image path, approved proof path, generation settings, model versions, artifact paths, and printability results.
- Decide whether artifact generation is synchronous for MVP or dispatched internally as a background job.
- Add local fixture images for repeatable generation tests.

Exit criteria:

- Contract tests still pass.
- Roadmap and workflow docs agree on artifact names and product dimensions.
- No production dependency on SQLite or Flask.

### Phase 1: Deterministic Relief MVP

Goal: generate a real printable baseline bundle from one approved image without AI depth.

Tasks:

- Port/adapt image validation and pixel-array handling from the standalone generator.
- Implement fixed 5:7 crop/pad and target resolution control.
- Add luminance-to-heightmap generation as the deterministic fallback provider.
- Implement a closed watertight relief mesh with base and sidewalls.
- Export binary `model.stl`.
- Export `heightmap.png`.
- Write `metadata.json`.
- Return artifact paths plus real printability checks.

Exit criteria:

- Generated STL has expected dimensions.
- Mesh has top, bottom, and sidewall faces.
- Small fixture images produce deterministic STL byte size or stable metadata.
- Invalid images and invalid relief settings fail safely.

### Phase 2: Preview And Validation

Goal: make the generated object inspectable before checkout.

Tasks:

- Add GLB preview export or a lightweight mesh preview format.
- Add checks for triangle count, file size, min/max Z, base thickness, relief depth, and aspect ratio.
- Add smoothing controls that preserve major image edges.
- Add benchmark tests for representative fixture sizes.
- Store preview metadata in the manifest.

Exit criteria:

- Web app can consume a preview artifact.
- Printability status can be `passed`, `warning`, or `failed`.
- Oversized or too-detailed jobs are rejected or downsampled predictably.

### Phase 3: Depth Model Prototype

Goal: replace simple brightness relief with a depth-aware relief path.

Tasks:

- Add provider interface for depth maps.
- Start with `luminance` as default and `depth_anything_v2_small` as the first experimental provider.
- Store provider name, checkpoint/license notes, input hash, and output hash in metadata.
- Compare luminance vs depth model outputs on the same fixture set.
- Keep depth inference optional so the service can fall back to deterministic generation.

Exit criteria:

- Depth provider can produce a normalized depth map for the relief pipeline.
- Output still satisfies physical bounds and mesh validation.
- License and hosting implications are documented before production use.

### Phase 4: Subject-Aware Relief

Goal: improve portrait and foreground/background quality without trusting full image-to-3D generation.

Tasks:

- Add segmentation or mask input support.
- Add subject/background relief bias settings.
- Add face-safe smoothing and micro-detail suppression.
- Evaluate MoGe or Depth Pro if normals or sharper boundaries materially improve output.
- Add visual comparison artifacts for operator review.

Exit criteria:

- Portrait fixtures look better than luminance-only relief.
- Fine texture noise is reduced.
- Metadata captures all model and settings choices.

### Phase 5: Full-Color Partner Package

Goal: prepare the production handoff for a Mimaki 3DUJ-2207 or comparable full-color partner.

Tasks:

- Confirm partner-accepted format: 3MF, OBJ plus texture, VRML, PLY, or other.
- Generate texture-aligned color artifacts.
- Add package validation for units, texture paths, bounds, and material profile.
- Preserve exact paid-order artifact manifest.

Exit criteria:

- Partner can open and quote/review the package.
- Color artifact and geometry artifact are traceable to the same approved proof.
- Checkout cannot proceed with an incomplete print package once full-color mode is required.

### Phase 6: Filament Painting Support

Goal: offer portable FDM support files without pretending to be a slicer.

Tasks:

- Adapt filament color library concepts from the standalone generator.
- Add palette quantization for a small number of filament colors.
- Generate `palette.json`, `layer-swaps.txt`, `print-settings.json`, and `preview.png`.
- Document printer/slicer assumptions in metadata.

Exit criteria:

- Support files are useful to a human/operator.
- Layer swap instructions are tied to layer height and relief Z values.
- No generated G-code is emitted until a target printer/slicer profile is chosen.

### Phase 7: Production Hardening

Goal: make generation reliable under real order flow.

Tasks:

- Add idempotency by `jobId` and `outputPrefix`.
- Add structured logs with `job_id`, `uid`, `artifact_count`, and `printability_status`.
- Add Cloud Tasks or Pub/Sub orchestration from Firebase Functions.
- Add retry behavior for transient storage/model failures.
- Add cleanup for failed or abandoned artifact prefixes.
- Add cost and duration metrics for depth inference.

Exit criteria:

- A failed generation leaves a clear Firestore status and error.
- Re-running a job does not silently change a paid order.
- Artifact manifests are immutable once checkout begins.

## Evaluation Of Integration Options

| Option | Description | Pros | Cons | Recommendation |
| --- | --- | --- | --- | --- |
| Append docs only | Copy architecture notes from the standalone project into `3DPrintPosters` docs | Fast, low risk | Does not produce real artifacts | Useful as this evaluation, but insufficient alone |
| Vendor whole project | Copy `E:\PROJECTS\print-file-generator` into `services/print-file-generator` | Fast access to existing code | Brings Flask, SQLite, local sessions, unrelated TD1 code, and wrong service shape | Avoid |
| Extract core modules | Port image/heightmap/STL/test concepts into the existing FastAPI service | Preserves production boundary and useful code | Requires refactor and new closed mesh builder | Recommended |
| Keep separate microservice | Run standalone generator beside the existing service | Avoids migration at first | Duplicates service responsibility and complicates auth/storage/status | Avoid for MVP |
| Use full image-to-3D first | Build around TRELLIS/SAM 3D/Hunyuan/Stable Fast 3D | Visually exciting experiments | Higher printability, license, GPU, and reliability risk | Defer until relief pipeline passes |

## First Implementation Slice

The first useful engineering slice should be small and measurable:

1. Add `image_pipeline.py`, `relief/settings.py`, `relief/heightmap.py`, `relief/mesh.py`, and `relief/stl.py`.
2. Implement local generation from image bytes to closed binary STL and heightmap PNG.
3. Update `generation.py` to produce real local artifacts behind a storage adapter.
4. Expand `tests/test_contract.py` and add relief mesh tests.
5. Keep the response model stable so Firebase Functions can integrate without churn.

This slice gives the product something concrete: a real artifact bundle from an approved proof, even before AI depth and color packages arrive.

## Final Recommendation

Adopt the standalone project as a reference and source of proven primitives, but keep `3DPrintPosters/services/print-file-generator` as the production architecture.

The highest-value next step is not adding a 3D AI model. It is replacing the stub service with a deterministic, closed, validated 5in x 7in relief generator. Once that exists, AI depth models can improve the heightmap without taking control of the manufacturing constraints.
