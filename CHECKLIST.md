# Implementation Checklist

## Phase 0 - Project Foundation

- [x] Choose web-first PWA architecture with backend services that can support native apps later.
- [x] Create monorepo folders for web, functions, print file generation services, infrastructure, and docs.
- [x] Add changelog.
- [x] Add implementation checklist.
- [x] Add secret-safe gitignore patterns.
- [x] Confirm final production/staging Firebase project strategy.
- [x] Install dependencies and create lockfile.
- [x] Configure Firebase project alias for local development.
- [x] Verify Cloudflare account API token access for account AI Gateway reads and the `3dprintposters.com` zone.
- [x] Verify Google/Gemini/Vertex API keys for initial live model-provider calls.
- [x] Confirm Cloudflare DNS target for the first deploy.
- [x] Choose direct GCP Vertex/Gemini as the first MVP AI route.
- [x] Keep AI calls behind a provider adapter so Cloudflare AI Gateway can be added later without changing orchestration code.
- [x] Defer Cloudflare AI Gateway creation until provider comparison, centralized AI observability, rate limits, or retries are needed.
- [x] Defer Workers AI evaluation until after the direct Vertex/Gemini MVP path proves the product workflow.

## Phase 1 - Web MVP

- [x] Scaffold mobile-first Next.js app shell.
- [x] Add placeholder upload and 3D preview UI.
- [x] Add Firebase Auth sign-in.
- [x] Add authenticated upload to Cloud Storage.
- [x] Add style selection and job creation flow.
- [x] Add generated image approval gallery for the test flow, using the source photo as the temporary proof until AI output is connected.
- [x] Add single-job proof review route and gate checkout on approved proof.
- [x] Add single-order status route for checkout/payment/fulfillment state.
- [x] Add real GLB preview from backend output on the job review route.
- [x] Add side-by-side proof, heightmap, and 3D preview inspection on the job review route, with local `.tmp` artifact mirroring for developer inspection.
- [ ] Add account-level order history and richer fulfillment status screens.
- [x] Add PWA manifest, icons, and install behavior.

## Phase 2 - Backend Orchestration

- [x] Scaffold Firebase Functions package.
- [x] Add job creation boundary.
- [x] Add checkout and Stripe webhook boundaries.
- [x] Add internal AI provider adapter scaffold with direct Vertex/Gemini as the default route.
- [x] Add proof approval callable and checkout precondition.
- [x] Add Firestore rules deployment.
- [x] Add Storage rules deployment.
- [x] Add full Firebase emulator workflow. Function-only emulator testing works, and the full suite has a checked-in JDK 21+ preflight.
- [x] Add server-side AI generation callable or queue worker through the internal provider adapter.
- [x] Replace the adapter stub with a real direct Vertex/Gemini request.
- [x] Store generated preview images in user/job-scoped Cloud Storage paths.
- [x] Persist AI generation metadata on the Firestore job without storing secrets.
- [x] Call the print-file generator after proof approval and persist STL/GLB artifact paths on the job.
- [x] Gate checkout on generated print-file artifacts instead of only proof approval.
- [ ] Add queueing with Cloud Tasks or Pub/Sub.
- [x] Add idempotency guards for job creation and checkout session creation.
- [ ] Add idempotency keys for fulfillment actions once the fulfillment provider path exists.
- [ ] Add user quotas and abuse controls.

## Phase 3 - Print File Generation And Relief Quality

- [x] Create Python Cloud Run service contract for STL generation.
- [x] Create broader print file generator service contract.
- [x] Decide to keep `services/print-file-generator` as the production FastAPI/Cloud Run boundary and selectively extract core modules from `E:\PROJECTS\print-file-generator`.
- [x] Document the extraction roadmap in `docs/PRINT_FILE_GENERATOR_ARCHITECTURE_ROADMAP_EVALUATION.md`.
- [x] Add service module skeleton for `image_pipeline`, `depth`, `relief`, `packages`, `storage`, and `metadata`.
- [x] Port/adapt image validation, RGB conversion, pixel-array handling, and generation-limit tests from the standalone generator.
- [x] Implement image validation and normalization.
- [x] Add 5:7 crop/pad handling for the 5in x 7in product.
- [x] Implement deterministic luminance-to-heightmap generation as a reference provider.
- [x] Implement closed watertight relief mesh generation with top surface, base plane, sidewalls, consistent normals, and exact 127mm x 177.8mm bounds.
- [x] Implement binary STL export for the closed relief mesh.
- [x] Export `heightmap.png`, `model.stl`, and `metadata.json` for a local test fixture.
- [x] Add printability checks for bounds, base thickness, relief depth, triangle count, file size, and watertightness.
- [x] Add known-image fixture tests for deterministic metadata and safe error handling.
- [x] Wire the FastAPI `/v1/generate` implementation to produce real artifacts behind a storage adapter while preserving the existing response contract.
- [x] Add optional GLB/preview mesh generation for browser preview.
- [x] Add depth provider interface and promote the chosen hybrid provider into the default product path.
- [x] Add experiment 1 deterministic heightmap comparison providers and local sidecar runner.
- [x] Add 16-bit heightmap PNG export for experiment runs.
- [x] Prototype Depth Anything V2 Small as the first experimental depth provider after deterministic relief generation passes tests.
- [x] Complete the five-experiment heightmap review against the two canonical local inputs.
- [x] Document the experiment cycle outcome in `research/HEIGHTMAP_EXPERIMENTS_FINAL_EVALUATION.md` and `research/HEIGHTMAP_FINAL_EVALUATION_REVIEW.md`.
- [x] Rename the Experiment 4 provider from `sam_masked_depth` to `segformer_masked_depth` while retaining historical `.tmp` artifacts for audit.
- [x] Reject TripoSR/full image-to-3D sidecars for poster relief and defer the same object-reconstruction class until product scope expands.
- [x] Replace the near-no-op Experiment 3 transform with guided-filter detail/base bas-relief compression and regression tests.
- [x] Add calibrated relief quality gates and reports for background flatness, subject separation, mask ridge, high-frequency noise, and portrait face detection.
- [x] Add typed provider-chain scaffolding for monocular depth and subject segmentation with `ProviderError` failover and `ProviderAudit` capture.
- [x] Settle AI workflow roles: Vertex/Gemini for proof generation, API-backed semantic depth, subject segmentation, optional proof cleanup/depth-friendly preprocessing, and no final STL/GLB geometry generation by image-to-3D models.
- [x] Build the `masked_depth_detail_blend` provider using semantic depth, subject masking, subject-only detail blending, guided-filter compression, and the existing STL/GLB generator.
- [x] During the hybrid build, compare `posterized_luminance` and `lithophane_baseline` as in-mask detail sources and promote `lithophane_baseline` for facial/detail quality.
- [x] Promote `masked_depth_detail_blend` with `lithophane_baseline` detail source into the web approval flow.
- [x] Keep deterministic brightness-to-height providers out of the default checkout path.
- [x] Wire `ProviderAudit` and segmentation status into `metadata.json` and the Firestore job audit document.
- [x] Change the physical relief object from a full-bleed 5in x 7in plate to a 5in x 7in image relief window with an additional 1/4in border on all sides, for a total object size of 5.5in x 7.5in.
- [x] Make generated `preview.glb` artifacts color-aware with image-derived vertex colors for job-page review.
- [x] Add border/frame geometry so the 1/4in border reads as an intentional product edge, not unused flat margin.
- [ ] Add an image-window mask and edge-fade so the relief settles cleanly before the border and avoids hard crop/depth artifacts at the physical edge.
- [ ] Add server-side face-region detection/landmarking for portrait relief tuning, preferring a local/on-service detector first and deferring any external face API fallback until real product-flow failures justify it.
- [ ] Tune `masked_depth_detail_blend` with face-aware soft masks so larger facial forms are preserved while eyes, teeth, mouth, and skin microtexture receive gentler deterministic detail.
- [ ] Tune hybrid portrait relief quality after human product-flow review: reduce bottom-band artifacts, preserve larger facial forms, and reduce harsh photo-embossed detail around eyes, teeth, and skin texture.
- [x] Increase and test production heightmap/mesh resolution from 200px to 280px width while keeping triangle count and preview performance inside the updated production caps.
- [ ] Tune color GLB preview lighting/material so the job page shows relief depth and image color clearly enough for human quality review.
- [ ] Add a content-hash cache for provider responses in Firebase Storage using role, provider id, model version, and image hash.
- [ ] Implement production API-backed depth and segmentation providers: HF Inference Depth Anything, Vertex depth/segmentation if available, and Cloudflare-gatewayed variants.
- [ ] Add provider registry config for priority order, retries, cost ceilings, model versions, license approval, and default eligibility.
- [x] Replace the dropped composition-preservation quality gate with a relief-appropriate metric before strict non-portrait gating.
- [ ] Feed provider latency and cost metrics from Cloud Logging/Monitoring into provider eligibility.
- [x] Declare implicit provider dependencies intentionally, including `requests`, optional `python-dotenv`, and experiment-only extras.
- [x] Add color-capable export package for Mimaki 3DUJ-2207 partners.
- [x] Add filament painting palette, layer swap, print settings, and preview outputs.
- [ ] Add color/material recipe generation.

## Phase 4 - Payments and Fulfillment

- [x] Create Stripe test product and $60 USD one-time price.
- [ ] Configure Stripe webhook secrets.
- [x] Create checkout sessions for physical poster orders.
- [x] Persist Stripe Checkout Session IDs on order records.
- [ ] Persist Stripe customer ids.
- [ ] Find a print partner with Mimaki 3DUJ-2207 or comparable full-color 3D printing.
- [ ] Confirm partner file formats, material profile, 5x7 constraints, quote process, and order workflow.
- [ ] Create fulfillment quote flow.
- [ ] Send paid orders to fulfillment only after confirmed payment.
- [ ] Add admin retry and manual review states.
- [ ] Add admin view for failed jobs, payment mismatches, fulfillment retries, and manual review.

## Phase 5 - Launch Readiness

- [ ] Privacy policy and terms.
- [ ] App content moderation and safety review.
- [ ] Analytics and conversion funnel events.
- [ ] Error monitoring and structured logs for job, payment, fulfillment, and provider state changes.
- [ ] Cloud Storage lifecycle rules for abandoned uploads and expired generated artifacts.
- [ ] Cost caps, quotas, upload/job/checkout rate limits, and alerts.
- [ ] Resolve dependency audit advisories or document accepted transitive risk.
- [ ] Create Firebase App Hosting staging and production backends.
- [ ] Add Cloudflare DNS records after Firebase App Hosting backend domains exist.
- [ ] Domain, SSL, and production deploy.
