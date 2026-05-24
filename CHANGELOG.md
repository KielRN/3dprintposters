# Changelog

All notable project changes will be documented in this file.

## [Unreleased] - 2026-05-06

### Added

- Added the 2026-05-23 customer-acquisition pivot: PrintU-like personalized figurines now outrank further poster-relief tuning until the business model is proven.
- Added Meshy/PrintU provider research in `research/FIGURINE_PROVIDER_RESEARCH.md`, including Meshy API output formats, Meshy-6/MakerWorld fit, pricing/retention notes, and webhook setup constraints.
- Added the Cloudflare Worker Meshy webhook receiver at `https://api.3dprintyou.com/webhooks/meshy`, with the default `workers.dev` trigger disabled and health/JSON POST smoke tests passing.
- Added `MESHY_WEBHOOK_SECRET` to the deployed Meshy webhook Worker as an encrypted Cloudflare secret, with live health verification that the binding is configured.
- Enforced Meshy webhook authentication using the real delivery header `x-meshy-api-webhook-secret-key`; unauthenticated POSTs now return `401`.
- Added `MESHY_API_KEY`, `MESHY_WEBHOOK_URL`, and `MESHY_WEBHOOK_SECRET` placeholders to env examples without exposing local secret values.
- Added a human follow-up task for Meshy figurine evaluation, slicer/printability review, and dashboard-based webhook setup.
- Added AI 3D model generation research for the poster-relief pipeline.
- Added a print-file generator architecture roadmap evaluation recommending selective core-module extraction from `E:\PROJECTS\print-file-generator`.
- Added the first deterministic print-file generator pipeline with image normalization, luminance heightmaps, closed relief STL export, local/GCS storage adapters, artifact metadata, and regression tests.
- Added printability checks for relief bounds, base thickness, relief depth, triangle count, binary STL size, and watertight mesh edges.
- Added known-image metadata regression coverage and invalid-image endpoint error coverage for the print-file generator.
- Added GLB preview mesh generation for browser previews.
- Added proof-approval orchestration that calls the print-file generator, stores STL/GLB artifact paths on the job, and gates checkout on generated print files.
- Added a job-page GLB relief viewer backed by generated `preview.glb` artifacts.
- Added a job-page artifact inspection view with side-by-side approved proof, generated `heightmap.png`, `preview.glb`, warning details, and download buttons for baseline print artifacts.
- Added opt-in experiment 1 heightmap providers: `continuous_luminance` and `lithophane_baseline`.
- Added request-level relief tuning for height provider, contrast, gamma, post-heightmap smoothing, and 8-bit/16-bit heightmap PNG export.
- Added a local heightmap experiment runner that writes provider comparison bundles under `.tmp/experiments/experiment_1`.
- Added the opt-in experiment 2 `depth_anything_v2_small` semantic depth provider and wired it into local heightmap experiment runs.
- Added the opt-in `masked_depth_detail_blend` provider, combining semantic depth, subject masking, subject-only deterministic detail, guided-filter bas-relief compression, and the existing STL/GLB generator.
- Added request/experiment-runner controls for the hybrid provider's deterministic detail source and detail blend weight.
- Added hybrid output discovery to the quality-gate harness so `masked_depth_detail_blend` variants are reported alongside prior experiment providers.
- Added `composition_gradient_correlation` as the replacement composition-preservation quality gate for source image versus heightmap edge placement.
- Declared provider dependencies explicitly in the print-file generator package, including `requests`, `python-dotenv`, and experiment-only `trimesh`.
- Added `human-tasks/` for human-owned validation, testing, decision, and external-action follow-ups after AI developer work.
- Added per-job print-file audit capture: provider-chain audit and segmentation status now flow into `metadata.json`, `jobs/{jobId}.printFileAudit`, and `jobs/{jobId}/audit/printFileGeneration`.
- Added a documented print-file generator test layout with `contract/`, `unit/`, `integration/`, and shared test support helpers for future color-package coverage.
- Added the PM/human-test handoff rule: after AI implementation and verification, create or update a human task when the next validation is the full product workflow in the browser.
- Added explicit 5in x 7in image-window metadata and a 1/4in product border to print-file generator artifacts, making the default physical object 5.5in x 7.5in.
- Added deterministic full-color package outputs (`3MF`, `OBJ`/`MTL`/texture, `VRML`, `PLY`) plus filament painting palette, layer-swap guide, print settings, and quantized preview artifacts.
- Added shaped border/frame mesh geometry with an outer bevel, raised shoulder, and inner lip for the 5.5in x 7.5in relief object.
- Added local Functions emulator mirroring for generated print-file artifacts under `.tmp/print-files/{uid}/{jobId}` after proof approval.
- Added job-page GLB inspection controls for zooming, orbiting, and resetting the 3D relief preview.
- Added a 280px production relief resolution default with updated printability caps for 500,000 triangles and 25 MB binary STL output.
- Added image-window edge fade before mesh construction so generated relief settles into the shaped frame instead of carrying hard crop artifacts to the physical edge.
- Added server-side portrait region analysis for the print-file generator, including soft face oval, central face, eye, and mouth masks plus `face_analysis_status` metadata.
- Added a 768px geometry-analysis image and 400px mesh/color output default for the production relief path, with metadata for geometry-analysis dimensions.
- Added geometry-only proof cleanup, contour-smoothed subject masks, and nose-aware portrait relief shaping to reduce blocky subject edges, white outline ridges, rough shirt/background texture, and nose recession.
- Added hybrid relief debug artifacts under `debug/*.png` for geometry input, masks, detail maps, blended depth, relief depth, and final heightmap; local Functions mirroring now includes these debug artifacts.
- Added the Super Dad generated proof as the MVP relief north star in project direction docs, with smooth default surfaces and intentional texture called out as the next product-quality layer.
- Added roadmap/checklist direction for a surface-intent/material policy where smooth skin, scalp, neck, simple clothing, and backgrounds stay smooth unless text, logos, panel lines, hair, fabric, or another printable texture class is explicitly requested.
- Added the `super-dad-north-star-v1` proof-generation style contract for smooth printable poster art and intentional raised graphics.
- Added the print-file generator `smooth-default-v1` surface-intent/material policy schema, with metadata coverage for smooth skin/scalp/neck/hands/simple clothing/backgrounds and crisp text/logos/panel lines.
- Added v1 inferred surface-intent masks to the print-file generator, including smooth, crisp, texture, smoothing, and detail-gate debug artifacts plus `surface_intent_status` metadata.
- Added `surfaceIntentStatus` capture to the Functions print-file audit when `metadata.json` includes inferred surface-intent status.
- Added a graphic emboss mask/layer for the hybrid relief path so inferred text, logos, emblems, and graphic edges can be deliberately raised without allowing random proof texture into smooth regions.
- Added `surface-intent-emboss-mask.png` debug output and `surface_intent_status.roughness_metrics` for smooth-subject, flat-background, and crisp-graphic region review.
- Added approved-relief training protocols for working backward from human-approved production STLs into gold-master heightmaps, masks, QA renders, deterministic-generator tuning, and future LoRA/ControlNet datasets.
- Added a Blender MCP setup handoff task for the next chat so gold-master STL review can begin with an MCP-controlled Blender session.

### Changed

- Changed the active product priority from poster-relief quality tuning to proving a PrintU-like figurine funnel with `3dprintyou.com` as the better-fit public domain candidate.
- Changed docs to clarify that image-to-3D providers were rejected for poster relief only, and are now valid candidates for standalone figurines.
- Changed roadmap/checklist/architecture/README/PRD positioning so Meshy is the first generated-3D provider candidate and the existing relief path is parked R&D.
- Changed the default hybrid relief path to lean back toward HueForge/lithophane behavior: `lithophane_baseline` now contributes to the subject height signal, default `detail_weight` is `0.38`, bas-relief compression is less aggressive, and final subject/portrait smoothing is reduced so facial/body/graphic detail is not flattened away.
- Updated roadmap, checklist, README, architecture, workflow, service, and developer notes to make deterministic closed-relief generation the next print-file implementation slice.
- Wired the print-file generator `/v1/generate` route to produce real baseline artifacts when the selected image is readable from local filesystem or GCS storage.
- Raised the print-file generator's default decoded source-image limit to 4,000,000 pixels so normal AI proof images can be resized into relief artifacts.
- Added dev Firebase Storage CORS configuration so browser-based Three.js previews can fetch generated `preview.glb` artifacts.
- Tuned deterministic relief heightmaps to smooth noisy proof texture into broader poster-like depth bands while retaining softened edge detail.
- Stabilized the job-page GLB preview framing and added a regenerate action for approved 3D previews.
- Renamed the server-side Storage bucket env var to `APP_STORAGE_BUCKET` because Firebase Functions reserves the `FIREBASE_` prefix.
- Updated local PWA behavior so the service worker does not cache stale localhost development bundles.
- Replaced the earlier `posterized_luminance` print-file generator default with the chosen hybrid provider path.
- Corrected closed-relief mesh orientation so STL/GLB outputs preserve the source image's upright top-to-bottom direction.
- Made `lithophane_baseline` the production in-mask detail source for the hybrid provider.
- Tuned `masked_depth_detail_blend` to damp deterministic lithophane detail, smooth broad subject-surface roughness such as shirt texture, and further smooth detected eyes, mouth, and central-face skin while preserving low-frequency semantic shape and stronger structural edges.
- Added height-provider policy metadata and warnings so deterministic brightness-to-height providers are explicitly marked as fallback-only, not the target production-quality path.
- Updated the repo PM skill and agent guide to create or summarize human follow-up tasks during handoffs.
- Promoted `masked_depth_detail_blend` with `lithophane_baseline` detail source into the default web approval flow and print-file generator defaults.
- Changed hybrid relief generation to fail loudly when required depth or segmentation providers are unavailable instead of quietly substituting a lower-quality result.
- Condensed `AI_DEVELOPER_NOTES.md` into compact durable memory and aligned `AGENTS.md` plus the repo PM skill around source-of-truth boundaries.
- Changed default relief geometry from a full-bleed 5in x 7in plate to a 5in x 7in relief window inside a 5.5in x 7.5in physical object.
- Replaced placeholder color-package and filament-painting warnings with generated artifact checks in the print-file readiness summary.
- Changed generated `preview.glb` files from neutral material previews to image-colored previews using vertex colors sampled from the normalized proof image.
- Removed `scikit-image` from the print-file generator quality-gates extra because composition scoring no longer depends on SSIM.
- Changed the bordered relief mesh from a flat perimeter ring to a shaped product frame while preserving the 5in x 7in image window and 1/4in border dimensions.
- Removed customer-facing print-file download buttons from the job review preview while keeping proof, heightmap, GLB preview, and printability inspection.
- Changed the job-page GLB preview from a passive animated model to a stable inspection viewer with explicit zoom controls.
- Changed the job-page artifact layout so the approved proof and heightmap stay in the comparison row while the GLB preview gets a larger full-width inspection panel underneath.
- Changed the Functions approval flow and print-file generator defaults from a 200px to 280px working relief width.
- Changed the Functions approval flow and print-file generator defaults from a single 280px working relief width to 768px geometry analysis, 400px mesh output, 1,000,000 triangle cap, and 50 MB binary STL cap.
- Extended the proof-approval callable and browser callable timeout to 9 minutes so the production hybrid relief path can finish before the client reports an internal timeout.
- Changed local artifact mirroring so approved jobs become `generated` before the optional `.tmp` mirror downloads every print-file artifact.
- Removed the hybrid provider's nose-specific height boost after Blender review showed a puppet-like nose. The path now uses lower default detail weight, broader face-oval smoothing, and a face/forehead pit guard instead of creating a nose protrusion.
- Tightened Super Dad surface-intent smoothing by reducing default subject detail leakage, increasing smooth subject/background damping, and protecting only stronger graphic emboss regions from broad smoothing.
- Changed the relief-quality roadmap from raw subject-detail recovery toward controlled proof-to-print manufacturing: the customer photo is identity input, while the approved generated proof and surface-intent policy should determine printable geometry.
- Changed AI generation metadata to store the selected style contract metadata instead of raw prompt text.
- Changed `masked_depth_detail_blend` to gate deterministic detail through inferred surface intent, smooth scalp/neck/ear/body/background regions beyond face masks, keep crisp text/logos/graphic edges raised, and allow shallow material texture only when explicitly requested by proof-generation or human override metadata.
- Split the print-file generator depth/heightmap implementation into focused modules while preserving `app.depth` as a compatibility facade.

### Verified

- Verified `services/print-file-generator` tests pass.
- Verified Firebase Functions build after print-file audit persistence changes.
- Verified the reorganized print-file generator test suite still collects and passes all 62 tests.
- Verified Depth Anything V2 Small experiment outputs for both canonical local input images under `.tmp/experiments/experiment_2`.
- Verified mesh orientation with a regression test that maps the image top row to positive model `Y`.
- Verified `masked_depth_detail_blend` with unit coverage for subject-only detail blending and deterministic detail-source switching.
- Verified both canonical inputs with hybrid lithophane and posterized detail-source runs under `.tmp/experiments/hybrid`.
- Verified the print-file generator test suite passes with the bordered physical object defaults.
- Verified color-package generation with focused Python contract/unit tests, Functions build, and web typecheck.
- Verified color preview GLB generation with focused print-file generator unit and contract tests.
- Verified shaped border/frame geometry with the full print-file generator test suite.
- Verified the web typecheck after adding job-page GLB inspection controls.
- Verified the full print-file generator test suite and Firebase Functions build at the 280px production default.
- Verified focused print-file generator unit and contract coverage for geometry-analysis resampling, contour smoothing, geometry cleanup, and nose-aware shaping.
- Verified the full print-file generator suite, Firebase Functions build, and web typecheck after promoting the 400px/768px relief-quality path.
- Verified focused print-file generator unit/contract tests and Firebase Functions build after removing the nose boost, adding the face pit guard, reducing texture detail, and returning debug artifact paths.
- Verified the full print-file generator suite, Firebase Functions build, and web typecheck after adding the Super Dad style contract and surface-intent schema.
- Verified the full print-file generator suite after adding inferred surface-intent masks and detail/smoothing gates.
- Verified the full print-file generator suite passes after the depth module split.

## [Unreleased] - 2026-05-05

### Added

- Added Firebase client initialization for the web app, including optional local emulator wiring.
- Added web sign-in controls for email/password accounts and anonymous guest sessions.
- Added authenticated source-photo upload to Firebase Storage under `uploads/{uid}/{jobId}/source.{jpg|png}`.
- Wired the web flow to call `createGenerationJob` with the uploaded Storage path, selected style, and generated job id.
- Wired checkout to call the authenticated `createCheckoutSession` Firebase Function with the real job id instead of the local preview placeholder.
- Added responsive UI status/error states for auth, upload, job creation, and checkout readiness.
- Added a job proof review route at `/jobs/[jobId]` with approval controls.
- Added an `approveGeneratedImage` callable Function and gated checkout until a proof is approved.
- Added an order status route at `/orders/[orderId]` for payment, proof, and fulfillment state.
- Added a separate `NEXT_PUBLIC_USE_FIREBASE_FUNCTIONS_EMULATOR` switch so local callable Function testing can run without moving Auth, Firestore, and Storage to emulators.
- Added Firebase App Hosting as the selected first public web hosting target and checked in `apps/web/apphosting.yaml`.
- Added a checked-in `.firebaserc` with local `dev` and `default` aliases for `gen-lang-client-0675309660`.
- Wired `createGenerationJob` through the server-side AI provider adapter and persisted non-secret generation metadata on the Firestore job.
- Added idempotency guards for repeated job creation calls and Stripe Checkout session creation, with a new checkout attempt key after an expired session.
- Added npm scripts for Firestore rules, Storage rules, combined rules, and rules dry-run deployment.
- Added npm scripts for function-only and full Firebase emulator startup, including a JDK 21+ preflight for the full suite.
- Initialized the dev Firebase Storage default bucket at `gen-lang-client-0675309660.firebasestorage.app` in `US-CENTRAL1`.
- Added a direct Vertex/Gemini proof-generation request that reads the uploaded source image and stores the generated proof in job-scoped Firebase Storage.
- Added PWA icon assets, service worker registration, and a browser-gated install control.

### Changed

- Tightened `createGenerationJob` validation so job ids are client-provided but constrained, unique, and tied to the signed-in user's upload path.
- Changed the generation path to create a durable `generating` job, call the direct Vertex/Gemini adapter, and publish the generated proof image instead of using the uploaded source image as the proof.
- Changed checkout order creation to use the job id as the deterministic order document id for the current one-order-per-job MVP path.
- Updated the relief preview to show the MVP 5in x 7in dimensions as `127mm x 178mm` and keep the canvas framed on mobile.
- Updated `.gitignore` so source files under `apps/web/lib` can be tracked while generated package `lib` folders remain ignored.
- Updated checklist and docs to reflect proof approval, checkout gating, single-order status, current local testing, Firebase App Hosting, and the staging-first DNS plan.

### Verified

- Verified web and Functions TypeScript checks.
- Verified Firestore rules compile successfully through a Firebase deploy dry-run.
- Verified Storage rules compile successfully through a Firebase deploy dry-run.
- Deployed Firestore and Storage rules to the dev Firebase project.
- Verified the Next.js production build.
- Verified the local Next.js app route responses for `/`, `/jobs/test-job`, and `/orders/test-order`.
- Verified the Functions emulator loads `createGenerationJob`, `approveGeneratedImage`, `createCheckoutSession`, and `stripeWebhook`.
- Verified the full emulator preflight reports the current Java 17 install and blocks before starting the JDK 21+ dependent suite.
- Verified desktop and mobile rendering through a headless browser smoke check, including nonblank 3D canvas pixels and no mobile horizontal overflow.

### Known Limitations

- Public web hosting is not configured yet; testing is local at `http://localhost:3000`.
- The full Firebase emulator suite remains blocked on this machine until JDK 21+ is available, but the checked-in full-suite workflow now fails early with a clear preflight message.

## [Unreleased] - 2026-04-26

### Added

- Chose direct GCP Vertex/Gemini as the first MVP AI route and added a Functions provider adapter boundary for a future Cloudflare AI Gateway route.
- Added `services/print-file-generator` as the broader Cloud Run service scaffold for relief geometry, full-color print packages, and filament painting support files.
- Added a print file generation workflow doc and artifact manifest covering STL, 3MF/OBJ texture package, preview, metadata, palette, layer swaps, and print settings.
- Verified Cloudflare account API token access for account-scoped API calls.
- Verified Cloudflare can resolve the `3dprintposters.com` zone through the API.
- Verified AI Gateway API access for the Cloudflare account; no gateway is configured yet.
- Verified Google/Gemini/Vertex API keys with small live Gemini and Vertex AI requests.
- Repaired local `gcloud` usage, configured the project, and created Application Default Credentials for local Google client libraries.
- Updated product and conversion docs for a 5in x 7in target relief and Mimaki 3DUJ-2207 print-partner strategy.
- Added AI-provider environment placeholders and deployment notes.
- Added this documentation cleanup path for project progress, roadmap, and Cloudflare setup tracking.

### Planned

- Create the project AI Gateway after choosing the first provider and model strategy.
- Choose the first production hosting target before adding final Cloudflare DNS records.

## [Unreleased] - 2026-04-25

### Added

- Created initial monorepo architecture for web app, Firebase functions, Python STL service, and infrastructure docs.
- Added product implementation checklist and high-level architecture documentation.
- Added secret-safe `.gitignore` patterns for local env files and GCP/Firebase JSON keys.
- Added initial Next.js mobile-first PWA scaffold.
- Added initial Firebase Functions scaffold for job creation and Stripe checkout/webhook boundaries.
- Added initial Python Cloud Run service contract for image-to-STL conversion.
- Installed workspace dependencies and generated `package-lock.json`.
- Verified TypeScript checks for web and functions workspaces.
- Verified the Next.js production build.
- Created Stripe test product and $60 USD one-time price for the physical poster workflow.
- Updated checkout scaffolds to use `STRIPE_POSTER_PRICE_ID` when configured.
- Verified local checkout session creation returns a Stripe Checkout URL with a $60 USD total.

### Planned

- Connect Firebase Auth, Firestore, and Storage to the web UI.
- Wire the selected AI provider behind a server-side job pipeline.
- Implement the STL conversion pipeline and printability checks.
- Connect Stripe checkout and the selected Mimaki-capable fulfillment partner in test mode.
