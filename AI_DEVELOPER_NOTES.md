# 3DPrintPosters - AI Developer Notes

Last updated: 2026-05-17

## Purpose

This file is compact project memory for future AI developers. Keep operating rules, local commands, security rules, and verification commands in `AGENTS.md`. Keep active task tracking in `CHECKLIST.md`, chronology in `CHANGELOG.md`, and detailed service contracts in `docs/`.

Do not let this file become a second copy of those sources. Keep only durable product decisions, current implementation facts, active direction, and risks that would materially change future development.

## Product Direction

3DPrintPosters lets a user upload a personal photo, generate a controlled stylized proof image, convert the approved proof into a 3D-printable poster relief, inspect the generated artifacts, and eventually send the paid order to a full-color 3D print partner.

2026-05-17 product direction: use the "Super Dad" generated proof as the north-star style for the MVP relief product. The customer photo is identity/reference input, not a command to preserve every source-photo texture. The generated proof should be printable-friendly art with smooth stylized skin, clean toy-like or poster-like forms, crisp raised text/graphics, and only intentional material texture. The print-file generator should move toward a surface-intent/material policy where surfaces are smooth by default unless the proof/style metadata explicitly marks a region as text, logo, panel line, fabric grain, hair texture, or another printable texture class.

Development posture: build toward the intended final product behavior first. Once a product direction is reviewed and chosen, wire it into the real user workflow instead of leaving it as opt-in experiment code. Prefer loud failures during testing over quiet lower-quality substitute behavior; when human testing finds a failure, fix that production path directly.

Use `STL`, not `SLT`.

## Current Implementation

- Web app: `apps/web`, Next.js PWA.
- Backend orchestration: `apps/functions`, Firebase Cloud Functions 2nd gen on Node.js 22.
- Print-file generator: `services/print-file-generator`, FastAPI service intended for Cloud Run.
- Dev Firebase/GCP project: `gen-lang-client-0675309660`.
- Product domain: `3dprintposters.com`.
- Current proof generation: direct Vertex/Gemini through `apps/functions/src/aiProvider.ts`, with generated proofs stored under `generated/{uid}/{jobId}/`.
- Current print-file generation: `approveGeneratedImage` calls the FastAPI generator with `masked_depth_detail_blend`, `lithophane_baseline` detail source, `detail_weight: 0.12`, `target_width_px: 400`, `geometry_analysis_width_px: 768`, and explicit dimensions for a 5in x 7in image window inside a 5.5in x 7.5in physical object.
- Current print-file artifacts: `model.stl`, image-colored `preview.glb`, `heightmap.png`, `metadata.json`, deterministic full-color package files (`3MF`, `OBJ`/`MTL`/texture, `VRML`, `PLY`), filament painting files (`palette.json`, `layer-swaps.txt`, `print-settings.json`, `preview.png`), and `debug/*.png` relief-stage images. The physical object is now 5.5in x 7.5in with a 5in x 7in image relief window and shaped 1/4in border/frame, and the job page uses an interactive GLB inspection viewer with zoom, orbit, and reset controls.
- The 400px production relief mesh estimates at 463,488 vertices, 926,972 triangles, and a 46,348,684 byte binary STL before full-color and filament-painting package files. The printability caps are now 1,000,000 triangles and 50,000,000 STL bytes.
- Checkout is gated on proof approval and generated print-file artifacts.

## Durable Decisions

- Keep print-file generation server-side. Do not move geometry generation, texture packaging, or fulfillment logic into the browser.
- Keep `services/print-file-generator` as the production print-file boundary. Do not vendor the standalone `E:\PROJECTS\print-file-generator` Flask routes, SQLite state, browser session handling, local CLI flow, TD1 hardware code, or old open-surface mesh topology.
- Direct Vertex/Gemini remains the MVP proof-generation path. Cloudflare AI Gateway is deferred until provider comparison, centralized observability, rate limits, or retries matter.
- The five-experiment heightmap cycle is complete. Full image-to-3D reconstruction providers such as TripoSR, Stable Fast 3D, TRELLIS, SAM 3D Objects, and TriplaneGaussian are rejected for poster relief because they reconstruct standalone objects rather than image-plane depth.
- Deterministic brightness-to-height providers (`posterized_luminance`, `continuous_luminance`, `lithophane_baseline`) are reference providers, not the default checkout path.
- The chosen relief provider is `masked_depth_detail_blend`: 768px geometry-analysis cleanup, Depth Anything V2 semantic depth, contour-smoothed SegFormer subject masking, reduced `lithophane_baseline` in-mask detail, guided-filter bas-relief compression, broader face smoothing, face/forehead pit guarding, and the existing closed STL/GLB generator.
- Portrait relief tuning is currently face-aware inside server-side print-file generation. Local OpenCV Haar face boxes build soft face-oval, central-face, eye, nose, and mouth masks for relief tuning and debug visibility only; defer an external face API fallback until local detection misses real product-flow cases. Do not reintroduce the removed nose-specific height boost unless human review explicitly reverses that decision.
- Next relief-quality direction is surface-intent aware generation: infer or pass region/material intent from the proof-generation style so skin, scalp, neck, ears, hands, simple clothing, and backgrounds remain smooth unless explicitly marked for texture. Text, logos, suit panel lines, emblems, and designed graphic edges should stay crisp and raised.
- The recommended production maturity path is API-backed AI for proof generation, monocular depth, subject segmentation, and optional proof cleanup/depth-friendly preprocessing, while final heightmap blending, STL/GLB construction, texture packaging, and fulfillment artifacts remain deterministic server-side generation in `services/print-file-generator`.
- The current job page is the first quality-control surface: approved proof, generated heightmap, interactive GLB preview, printability status, and warnings. Local Functions emulator runs mirror the full print-file bundle under `.tmp/print-files/{uid}/{jobId}` instead of exposing customer-facing artifact download links.

## Active Product Focus

Phase 3 is now about product relief geometry and quality, not more provider research:

1. Promote the "Super Dad" controlled proof style into the real product workflow as the MVP north star: smooth stylized skin, clean body volumes, crisp raised text/graphics, and intentional texture only.
2. Add a surface-intent/material policy to the proof-to-print pipeline. V1 can be inferred from existing masks and style metadata, but the default rule should be smooth unless texture is explicitly requested.
3. Tune the hybrid relief path for broader skin/body smoothness beyond the face, especially scalp/top-of-head, ears, neck, hands, and simple clothing areas that currently inherit rough photo/proof texture.
4. Tune color GLB preview lighting/material and performance so browser review reflects actual relief and color quality.
5. Continue relief quality tuning from generated artifacts and `debug/*.png`, especially blockiness, unintended roughness, and photo/proof texture becoming geometry.

Current human-test handoff: `human-tasks/open/test-hybrid-relief-product-flow.md`.

Latest human review notes:

- Gray relief screenshots are Blender views of generated print files.
- Print files still look blocky in Blender.
- The nose/face can read as recessed or carved instead of naturally protruding.
- 2026-05-15 Blender review still raises concern that the nose may be recessing instead of protruding on the actual 3D print surface.
- 2026-05-15 Blender review still shows visible blockiness along subject edges, especially silhouette/neck/shirt boundary areas.
- 2026-05-15 app viewer screenshot also shows very blocky/jagged subject edges around the head silhouette, ear, neck, and shirt boundary, so edge blockiness is not only a Blender inspection concern.
- 2026-05-15 resolution decision: increase mesh output from 280px to 400px and run provider analysis at 768px, because the intended Mimaki 3DUJ-2207 class is finer than the old 0.455mm mesh pitch. Keep future increases behind human review because file size grows quickly.
- 2026-05-15 relief-quality decision: add geometry-only proof cleanup, contour-smoothed subject masks, and nose-aware portrait shaping to address blocky edges and nose recession concerns in the real checkout path.
- 2026-05-17 relief-quality decision: remove the nose-specific height boost completely after Blender review showed a puppet-like nose. Reduce default hybrid detail weight to `0.12`, expand face-oval smoothing, add a face/forehead pit guard, and emit `debug/*.png` relief-stage artifacts for the next batch.
- 2026-05-17 Super Dad direction decision: the latest review accepted the improved face smoothness but found the top-of-head/scalp area and neck still too rough. Future tuning should stop treating all subject detail as printable geometry and instead use a controlled surface-intent policy: smooth by default, texture only when the product style explicitly calls for it.
- A read-only comparison of the latest local `heightmap.png` against `model.stl` found the STL top surface matches the heightmap correctly: heightmap-to-STL-Z correlation was `0.99996939`, mean absolute difference was about `0.00193mm`, and inverted-Z correlation was negative. Treat this as a relief/heightmap quality and display-shading issue, not a confirmed STL polarity/read bug.

## Open Risks

- Local Depth Anything V2 now uses normal service dependencies (`torch`, `transformers`), so Cloud Run image size, cold start, memory, and CPU behavior need production validation.
- HF SegFormer requires a provider credential in the service runtime. Do not print or move secret values.
- Provider failures should surface clearly in testing instead of silently producing lower-quality reliefs.
- Face-aware tuning now uses server-side OpenCV Haar face boxes to build soft face/eye/nose/mouth masks. These masks should damp detail, smooth face areas, and support pit guarding, not create a nose protrusion. Detector misses, profile faces, stylized proofs, multiple-face behavior, and runtime cost still need human product-flow review.
- The product direction now depends on generated proofs being controlled printable art. If prompt/style metadata drifts toward photorealistic or noisy textures, the print-file generator will keep fighting the wrong input. Add style constraints and surface-intent metadata before broadening style options.
- Surface-intent masks are not implemented yet. Until they are, scalp, neck, ears, hands, shirt/collar zones, and AI brush artifacts can still become rough geometry even when the face looks smooth.
- The 400px output path roughly doubles binary STL size versus 280px and makes full-color OBJ/VRML/PLY packages larger. Watch Cloud Run memory/time, Storage cost, browser preview performance, and partner upload limits.
- Full-color 3MF/OBJ/VRML/PLY packages and filament painting guides are generated deterministically, but still need partner and slicer validation before fulfillment can depend on them.
- A Mimaki 3DUJ-2207 or comparable full-color print partner still needs file-format, material, sizing, quote, and fulfillment-process validation.
