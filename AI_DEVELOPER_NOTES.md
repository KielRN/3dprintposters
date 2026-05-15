# 3DPrintPosters - AI Developer Notes

Last updated: 2026-05-15

## Purpose

This file is compact project memory for future AI developers. Keep operating rules, local commands, security rules, and verification commands in `AGENTS.md`. Keep active task tracking in `CHECKLIST.md`, chronology in `CHANGELOG.md`, and detailed service contracts in `docs/`.

Do not let this file become a second copy of those sources. Keep only durable product decisions, current implementation facts, active direction, and risks that would materially change future development.

## Product Direction

3DPrintPosters lets a user upload a personal photo, generate a stylized proof image, convert the approved proof into a 3D-printable poster relief, inspect the generated artifacts, and eventually send the paid order to a full-color 3D print partner.

Development posture: build toward the intended final product behavior first. Once a product direction is reviewed and chosen, wire it into the real user workflow instead of leaving it as opt-in experiment code. Prefer loud failures during testing over quiet lower-quality substitute behavior; when human testing finds a failure, fix that production path directly.

Use `STL`, not `SLT`.

## Current Implementation

- Web app: `apps/web`, Next.js PWA.
- Backend orchestration: `apps/functions`, Firebase Cloud Functions 2nd gen on Node.js 22.
- Print-file generator: `services/print-file-generator`, FastAPI service intended for Cloud Run.
- Dev Firebase/GCP project: `gen-lang-client-0675309660`.
- Product domain: `3dprintposters.com`.
- Current proof generation: direct Vertex/Gemini through `apps/functions/src/aiProvider.ts`, with generated proofs stored under `generated/{uid}/{jobId}/`.
- Current print-file generation: `approveGeneratedImage` calls the FastAPI generator with `masked_depth_detail_blend`, `lithophane_baseline` detail source, `target_width_px: 280`, and explicit dimensions for a 5in x 7in image window inside a 5.5in x 7.5in physical object.
- Current print-file artifacts: `model.stl`, image-colored `preview.glb`, `heightmap.png`, `metadata.json`, deterministic full-color package files (`3MF`, `OBJ`/`MTL`/texture, `VRML`, `PLY`), and filament painting files (`palette.json`, `layer-swaps.txt`, `print-settings.json`, `preview.png`). The physical object is now 5.5in x 7.5in with a 5in x 7in image relief window and shaped 1/4in border/frame, and the job page uses an interactive GLB inspection viewer with zoom, orbit, and reset controls.
- The 280px production relief mesh measures 230,400 vertices, 460,796 triangles, and a 23,039,884 byte binary STL before full-color and filament-painting package files. The printability caps are now 500,000 triangles and 25,000,000 STL bytes.
- Checkout is gated on proof approval and generated print-file artifacts.

## Durable Decisions

- Keep print-file generation server-side. Do not move geometry generation, texture packaging, or fulfillment logic into the browser.
- Keep `services/print-file-generator` as the production print-file boundary. Do not vendor the standalone `E:\PROJECTS\print-file-generator` Flask routes, SQLite state, browser session handling, local CLI flow, TD1 hardware code, or old open-surface mesh topology.
- Direct Vertex/Gemini remains the MVP proof-generation path. Cloudflare AI Gateway is deferred until provider comparison, centralized observability, rate limits, or retries matter.
- The five-experiment heightmap cycle is complete. Full image-to-3D reconstruction providers such as TripoSR, Stable Fast 3D, TRELLIS, SAM 3D Objects, and TriplaneGaussian are rejected for poster relief because they reconstruct standalone objects rather than image-plane depth.
- Deterministic brightness-to-height providers (`posterized_luminance`, `continuous_luminance`, `lithophane_baseline`) are reference providers, not the default checkout path.
- The chosen relief provider is `masked_depth_detail_blend`: Depth Anything V2 semantic depth, SegFormer subject masking, `lithophane_baseline` in-mask detail, guided-filter bas-relief compression, and the existing closed STL/GLB generator.
- The recommended production maturity path is API-backed AI for proof generation, monocular depth, subject segmentation, and optional proof cleanup/depth-friendly preprocessing, while final heightmap blending, STL/GLB construction, texture packaging, and fulfillment artifacts remain deterministic server-side generation in `services/print-file-generator`.
- The current job page is the first quality-control surface: approved proof, generated heightmap, interactive GLB preview, printability status, and warnings. Local Functions emulator runs mirror the full print-file bundle under `.tmp/print-files/{uid}/{jobId}` instead of exposing customer-facing artifact download links.

## Active Product Focus

Phase 3 is now about product relief geometry and quality, not more provider research:

1. Add an image-window mask and edge fade so relief settles cleanly before the border.
2. Tune portrait quality: reduce bottom-band artifacts, preserve larger facial forms, and reduce harsh photo-embossed detail around eyes, teeth, and skin texture.
3. Tune color GLB preview lighting/material and performance so browser review reflects actual relief and color quality.

Current human-test handoff: `human-tasks/open/test-hybrid-relief-product-flow.md`.

Latest human review notes:

- Gray relief screenshots are Blender views of generated print files.
- Print files still look blocky in Blender.
- The nose/face can read as recessed or carved instead of naturally protruding.
- A read-only comparison of the latest local `heightmap.png` against `model.stl` found the STL top surface matches the heightmap correctly: heightmap-to-STL-Z correlation was `0.99996939`, mean absolute difference was about `0.00193mm`, and inverted-Z correlation was negative. Treat this as a relief/heightmap quality and display-shading issue, not a confirmed STL polarity/read bug.

## Open Risks

- Local Depth Anything V2 now uses normal service dependencies (`torch`, `transformers`), so Cloud Run image size, cold start, memory, and CPU behavior need production validation.
- HF SegFormer requires a provider credential in the service runtime. Do not print or move secret values.
- Provider failures should surface clearly in testing instead of silently producing lower-quality reliefs.
- Full-color 3MF/OBJ/VRML/PLY packages and filament painting guides are generated deterministically, but still need partner and slicer validation before fulfillment can depend on them.
- A Mimaki 3DUJ-2207 or comparable full-color print partner still needs file-format, material, sizing, quote, and fulfillment-process validation.
