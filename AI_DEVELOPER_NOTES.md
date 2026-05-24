# 3DPrintPosters - AI Developer Notes

Last updated: 2026-05-24

## Purpose

This file is compact project memory for future AI developers. Keep operating rules, local commands, security rules, and verification commands in `AGENTS.md`. Keep active Meshy-service task tracking in `CHECKLIST.md`, chronology in `CHANGELOG.md`, and detailed service contracts in `docs/`.

Do not let this file become a second copy of those sources. Keep only durable product decisions, current implementation facts, active direction, and risks that would materially change future development.

## Product Direction

3DPrintPosters is pivoting from "perfect the 5x7 poster relief first" to "prove customer demand for personalized AI print products first." The active MVP direction is now a PrintU-like figurine workflow: user uploads a photo, chooses a figurine style and posture, approves a 2D proof, reviews a generated 3D figurine preview, and either checks out or joins a manual/preorder funnel.

2026-05-23 product direction: customer acquisition and business-model proof outrank more relief tuning. Do not fight the experiments: full image-to-3D models failed for poster relief because they produce standalone objects, but that same strength is exactly what a personalized figurine product needs. Meshy.ai is the first serious provider candidate because its current Image to 3D API supports Meshy-6, GLB/STL/OBJ/FBX/USDZ/3MF outputs, and multi-color printing workflows. MakerWorld PrintU is the UX reference: upload image, choose Bobblehead/Chibi/Cartoon/Emoji-style output, choose Natural/Image/T-pose, generate 2D proof, then generate/edit/export the 3D figurine.

2026-05-17 relief direction is now parked R&D, not the launch blocker: the "Super Dad" generated proof remains the north-star if the poster-relief line resumes. The customer photo is identity/reference input, not a command to preserve every source-photo texture. The generated proof should be printable-friendly art with smooth stylized skin, clean toy-like or poster-like forms, crisp raised text/graphics, and only intentional material texture.

Development posture: build toward the intended final product behavior first. Once a product direction is reviewed and chosen, wire it into the real user workflow instead of leaving it as opt-in experiment code. Prefer loud failures during testing over quiet lower-quality substitute behavior; when human testing finds a failure, fix that production path directly.

2026-05-21 relief experiment direction is paused unless the relief product is reactivated: work backward from human-approved production STLs before training. Each approved STL becomes a gold master only after Blender/human review, then yields extracted supervision artifacts. Do not collect the 30-example relief dataset ahead of the figurine demand proof.

Use `STL`, not `SLT`.

## Current Implementation

- Web app: `apps/web`, Next.js PWA.
- Backend orchestration: `apps/functions`, Firebase Cloud Functions 2nd gen on Node.js 22.
- Print-file generator: `services/print-file-generator`, FastAPI service intended for Cloud Run.
- Dev Firebase/GCP project: `gen-lang-client-0675309660`.
- Product domains: `3dprintyou.com` is the better-fit candidate for the figurine/customer-acquisition pivot; `3dprintposters.com` remains the existing domain and may fit the parked poster-relief line.
- Current proof generation: direct Vertex/Gemini through `apps/functions/src/aiProvider.ts`, with generated proofs stored under `generated/{uid}/{jobId}/`.
- Current proof style contract: `super-dad-north-star-v1` in `apps/functions/src/styleContracts.ts`, which steers generated proofs toward smooth printable poster art and stores contract metadata instead of raw prompt text.
- Figurine workflow services are not implemented yet. The next backend slice needs Functions-side orchestration for source validation, style/posture metadata, 2D concept history, selected concept approval, 3D model generation status/history, readiness, base/sign configuration, and checkout eligibility.
- Figurine provider integration is not implemented yet. The target is a server-side generated-3D provider boundary that can call Meshy first, then store returned GLB/STL/3MF/model thumbnails under user/job-scoped Storage paths before checkout.
- Meshy webhook receiver is deployed at `https://api.3dprintyou.com/webhooks/meshy` through Cloudflare Workers custom domains. First successful API output task `019e5b9a-97a2-7788-8174-5cbc9913766f` ran on 2026-05-24 and downloaded GLB/STL/3MF assets under `.tmp/print-files/meshy/2026-05-24T20-08-40-270Z-019e5b9a-97a2-7788-8174-5cbc9913766f`; Elliot confirmed the GLB opens in Blender, but the raw-photo result is not the intended style. Immediate Meshy target is recreating `docs/MESHY_FIGURINE_UI_WORKFLOW.md`, first with Emoji/avatar style and Natural pose. Keep detailed Meshy API findings, run results, and service backlog in `research/MESHY_SERVICE_IMPLEMENTATION_PLAN.md`.
- Detailed target UI/service mapping lives in `docs/MESHY_FIGURINE_UI_WORKFLOW.md`; keep the active PM checklist in `CHECKLIST.md`.
- Current print-file generation: `approveGeneratedImage` calls the FastAPI generator with `masked_depth_detail_blend`, `lithophane_baseline` detail source, `detail_weight: 0.38`, `target_width_px: 400`, `geometry_analysis_width_px: 768`, and explicit dimensions for a 5in x 7in image window inside a 5.5in x 7.5in physical object.
- Print-file relief/depth code is split by responsibility under `services/print-file-generator/app`: `depth.py` is a compatibility facade; focused modules now own provider orchestration (`depth_providers.py`), shared types (`depth_types.py`), array/depth math (`depth_filters.py`), heightmap operations (`heightmap_ops.py`), geometry-input cleanup (`geometry_input.py`), subject masks (`segmentation_masks.py`), surface intent (`surface_intent.py`), portrait relief shaping (`portrait_relief.py`), debug artifacts (`depth_debug.py`), provider-chain shims (`depth_inference.py`), and rejected/experimental TripoSR sidecar code (`experimental/triposr_sidecar.py`).
- Current print-file artifacts: `model.stl`, image-colored `preview.glb`, `heightmap.png`, `metadata.json`, deterministic full-color package files (`3MF`, `OBJ`/`MTL`/texture, `VRML`, `PLY`), filament painting files (`palette.json`, `layer-swaps.txt`, `print-settings.json`, `preview.png`), and `debug/*.png` relief-stage images. The physical object is now 5.5in x 7.5in with a 5in x 7in image relief window and shaped 1/4in border/frame, and the job page uses an interactive GLB inspection viewer with zoom, orbit, and reset controls. The generator request schema now includes `smooth-default-v1` surface-intent metadata; `metadata.json` records the selected style, proof style contract, surface-intent policy, inferred `surface_intent_status`, graphic emboss status, and region roughness metrics.
- The 400px production relief mesh estimates at 463,488 vertices, 926,972 triangles, and a 46,348,684 byte binary STL before full-color and filament-painting package files. The printability caps are now 1,000,000 triangles and 50,000,000 STL bytes.
- Checkout is gated on proof approval and generated print-file artifacts.

## Durable Decisions

- Keep print-file/model generation server-side. Do not move geometry generation, provider API keys, texture packaging, or fulfillment logic into the browser.
- Keep `services/print-file-generator` as the production print-file boundary. Do not vendor the standalone `E:\PROJECTS\print-file-generator` Flask routes, SQLite state, browser session handling, local CLI flow, TD1 hardware code, or old open-surface mesh topology.
- Direct Vertex/Gemini remains the MVP proof-generation path. Cloudflare AI Gateway is deferred until provider comparison, centralized observability, rate limits, or retries matter.
- The five-experiment heightmap cycle is complete. Full image-to-3D reconstruction providers such as TripoSR, Stable Fast 3D, TRELLIS, SAM 3D Objects, TriplaneGaussian, and Meshy-style providers are rejected only for poster relief because they reconstruct standalone objects rather than image-plane depth. They are now valid candidates for the standalone figurine product direction.
- Meshy.ai is the first provider to evaluate for the figurine direction. Keep it behind a replaceable server-side adapter, download provider assets into our Storage quickly because non-enterprise API retention may be short, and record provider/model/version/credits/cost metadata without storing secrets.
- Deterministic brightness-to-height providers (`posterized_luminance`, `continuous_luminance`, `lithophane_baseline`) are reference providers, not the default checkout path.
- The chosen relief provider is `masked_depth_detail_blend`: 768px geometry-analysis cleanup, Depth Anything V2 semantic depth for broad shape/background control, contour-smoothed SegFormer subject masking, a HueForge-leaning `lithophane_baseline` subject height blend, guided-filter bas-relief compression, reduced detail-preserving face smoothing, face/forehead pit guarding, and the existing closed STL/GLB generator.
- Portrait relief tuning is currently face-aware inside server-side print-file generation. Local OpenCV Haar face boxes build soft face-oval, central-face, eye, nose, and mouth masks for relief tuning and debug visibility only; defer an external face API fallback until local detection misses real product-flow cases. Do not reintroduce the removed nose-specific height boost unless human review explicitly reverses that decision.
- Current relief-quality direction is surface-intent aware generation: the hybrid provider now infers v1 smooth/crisp/emboss/texture masks so skin, scalp, neck, ears, hands, simple clothing, and backgrounds remain smooth by default, crisp text/logos/graphic edges get a separate raised emboss treatment, and shallow material texture is enabled only from explicit proof-generation or human override metadata. `surface_intent_status.roughness_metrics` reports whether smooth subject/background regions are still too noisy or graphic regions are too flat.
- The recommended maturity path now has two tracks: (1) customer-facing figurine demand proof using API-backed image-to-3D providers, starting with Meshy; (2) parked poster-relief R&D using API-backed proof generation, monocular depth, subject segmentation, and deterministic server-side print-file generation.
- The current job page is the first quality-control surface: approved proof, generated heightmap, interactive GLB preview, printability status, and warnings. Local Functions emulator runs mirror the full print-file bundle under `.tmp/print-files/{uid}/{jobId}` instead of exposing customer-facing artifact download links.

## Active Product Focus

Phase 3 is now about business-model proof and customer acquisition:

1. Reframe the web MVP around a PrintU-like figurine creation flow: photo upload, style selector, posture selector, generated 2D proof, 3D figurine preview, and purchase-intent capture.
2. Create the backend services required by that workflow: figurine job orchestration, source-image validation, 2D concept history/approval, generated-3D provider submission, Meshy task tracking, asset ingestion, readiness, editor-config persistence, and checkout/preorder gating.
3. Evaluate Meshy manually first, then through a server-side adapter if commercial/API terms and test outputs look viable for the public experience.
4. Store generated provider assets (`model.glb`, `model.stl`, optional `model.3mf`, thumbnails, metadata, warnings) under user/job-scoped Storage paths and show the GLB in the job page.
5. Decide whether the first public proof is a paid preorder/manual fulfillment funnel or a fully automated checkout path.
6. Add analytics for upload, style/posture selection, proof approval, 3D generation success, preview engagement, checkout/preorder intent, and abandonment.
7. Keep the relief generator documented and available as a later product path, but do not make more relief tuning the next customer-acquisition milestone.

Current human-test handoff: `human-tasks/open/2026-05-23-evaluate-meshy-figurine-flow.md`.

Paused relief review notes:

- Gray relief screenshots are Blender views of generated print files.
- Print files still look blocky in Blender.
- The nose/face can read as recessed or carved instead of naturally protruding.
- 2026-05-15 Blender review still raises concern that the nose may be recessing instead of protruding on the actual 3D print surface.
- 2026-05-15 Blender review still shows visible blockiness along subject edges, especially silhouette/neck/shirt boundary areas.
- 2026-05-15 app viewer screenshot also shows very blocky/jagged subject edges around the head silhouette, ear, neck, and shirt boundary, so edge blockiness is not only a Blender inspection concern.
- 2026-05-15 resolution decision: increase mesh output from 280px to 400px and run provider analysis at 768px, because the intended Mimaki 3DUJ-2207 class is finer than the old 0.455mm mesh pitch. Keep future increases behind human review because file size grows quickly.
- 2026-05-15 relief-quality decision: add geometry-only proof cleanup, contour-smoothed subject masks, and nose-aware portrait shaping to address blocky edges and nose recession concerns in the real checkout path.
- 2026-05-17 relief-quality decision: remove the nose-specific height boost completely after Blender review showed a puppet-like nose. The hybrid detail weight was reduced to `0.12`, face-oval smoothing was expanded, a face/forehead pit guard was added, and `debug/*.png` relief-stage artifacts were emitted for the next batch.
- 2026-05-21 relief-quality decision: after comparing the current service to `E:\PROJECTS\print-file-generator`, rebalance toward HueForge/lithophane behavior. `masked_depth_detail_blend` now uses `lithophane_baseline` as a subject height signal at default `detail_weight: 0.38`, uses semantic depth mainly for broad shape/background control, reduces bas-relief compression, lowers final portrait/surface smoothing, and emits `lithophane-base.png` plus `lithophane-blend-weight-map.png` debug artifacts.
- 2026-05-17 Super Dad direction decision: the latest review accepted the improved face smoothness but found the top-of-head/scalp area and neck still too rough. Future tuning should stop treating all subject detail as printable geometry and instead use a controlled surface-intent policy: smooth by default, texture only when the product style explicitly calls for it.
- 2026-05-18 relief-quality implementation: the hybrid provider now separates a cleaned `emboss_mask` from the general crisp/detail map, applies a graphic emboss layer for text/logos/emblems, increases smoothing on smooth subject/background regions, reduces default subject detail leakage, emits `debug/surface-intent-emboss-mask.png`, and writes `surface_intent_status.roughness_metrics` for smooth subject, flat background, and crisp graphic regions.
- A read-only comparison of the latest local `heightmap.png` against `model.stl` found the STL top surface matches the heightmap correctly: heightmap-to-STL-Z correlation was `0.99996939`, mean absolute difference was about `0.00193mm`, and inverted-Z correlation was negative. Treat this as a relief/heightmap quality and display-shading issue, not a confirmed STL polarity/read bug.

## Open Risks

- The repo name still says "posters"; the preferred customer-facing domain for the pivot is `3dprintyou.com`. On 2026-05-23 the Meshy webhook receiver was deployed as a Cloudflare Workers custom domain at `https://api.3dprintyou.com/webhooks/meshy`, with the default `workers.dev` trigger disabled. The local token still returns `403` for DNS record and Worker route reads, but Workers domain listing succeeds.
- Meshy/API provider economics, commercial-use terms, data retention, likeness/privacy handling, and moderation must be verified before public checkout.
- Provider-generated figurines may look good on screen but fail slicing, require supports/manual cleanup, or disappoint customers physically; real slicer and physical-print validation are mandatory.
- Meshy and similar providers are external dependencies. Keep provider calls server-side, store returned assets immediately, record audit metadata, and avoid a UI that assumes one provider forever.
- Customer likeness, celebrity/IP, fan art, and minors/consent policies need explicit product rules before public traffic.
- Local Depth Anything V2 now uses normal service dependencies (`torch`, `transformers`), so Cloud Run image size, cold start, memory, and CPU behavior need production validation.
- HF SegFormer requires a provider credential in the service runtime. Do not print or move secret values.
- Provider failures should surface clearly in testing instead of silently producing lower-quality reliefs.
- Face-aware tuning now uses server-side OpenCV Haar face boxes to build soft face/eye/nose/mouth masks. These masks should damp detail, smooth face areas, and support pit guarding, not create a nose protrusion. Detector misses, profile faces, stylized proofs, multiple-face behavior, and runtime cost still need human product-flow review.
- The product direction now depends on generated proofs being controlled printable art. If prompt/style metadata drifts toward photorealistic or noisy textures, the print-file generator will keep fighting the wrong input. The first style contract and surface-intent schema now exist, but the approval audit still needs to preserve them end to end before broadening style options.
- Surface-intent masks are now implemented as v1 heuristics, but they still need human product-flow review. Crisp graphic detection can preserve high-contrast marks outside the subject, and texture is request-gated; real proofs may still need threshold tuning or a future stronger segmentation/vision pass.
- The 400px output path roughly doubles binary STL size versus 280px and makes full-color OBJ/VRML/PLY packages larger. Watch Cloud Run memory/time, Storage cost, browser preview performance, and partner upload limits.
- Full-color 3MF/OBJ/VRML/PLY packages and filament painting guides are generated deterministically, but still need partner and slicer validation before fulfillment can depend on them.
- A Mimaki 3DUJ-2207 or comparable full-color print partner still needs file-format, material, sizing, quote, and fulfillment-process validation.
