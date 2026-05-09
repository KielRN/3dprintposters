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
- [x] Defer Cloudflare AI Gateway creation until provider comparison, centralized AI observability, rate limits, retries, or fallback are needed.
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
- [x] Add side-by-side proof, heightmap, and 3D preview inspection with artifact downloads on the job review route.
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

## Phase 3 - Print File Generation

- [x] Create Python Cloud Run service contract for STL generation.
- [x] Create broader print file generator service contract.
- [x] Decide to keep `services/print-file-generator` as the production FastAPI/Cloud Run boundary and selectively extract core modules from `E:\PROJECTS\print-file-generator`.
- [x] Document the extraction roadmap in `docs/PRINT_FILE_GENERATOR_ARCHITECTURE_ROADMAP_EVALUATION.md`.
- [x] Add service module skeleton for `image_pipeline`, `depth`, `relief`, `packages`, `storage`, and `metadata`.
- [x] Port/adapt image validation, RGB conversion, pixel-array handling, and generation-limit tests from the standalone generator.
- [x] Implement image validation and normalization.
- [x] Add 5:7 crop/pad handling for the 5in x 7in product.
- [x] Implement deterministic luminance-to-heightmap generation as the fallback provider.
- [x] Implement closed watertight relief mesh generation with top surface, base plane, sidewalls, consistent normals, and exact 127mm x 177.8mm bounds.
- [x] Implement binary STL export for the closed relief mesh.
- [x] Export `heightmap.png`, `model.stl`, and `metadata.json` for a local test fixture.
- [x] Add printability checks for bounds, base thickness, relief depth, triangle count, file size, and watertightness.
- [x] Add known-image fixture tests for deterministic metadata and safe error handling.
- [x] Wire the FastAPI `/v1/generate` implementation to produce real artifacts behind a storage adapter while preserving the existing response contract.
- [x] Add optional GLB/preview mesh generation for browser preview.
- [x] Add depth provider interface and keep luminance as the default provider.
- [x] Add experiment 1 deterministic heightmap comparison providers and local sidecar runner.
- [x] Add opt-in 16-bit heightmap PNG export for experiment runs.
- [ ] Prototype Depth Anything V2 Small as the first experimental depth provider after deterministic relief generation passes tests.
- [ ] Add color-capable export package for Mimaki 3DUJ-2207 partners.
- [ ] Add filament painting palette, layer swap, print settings, and preview outputs.
- [ ] Add color/material recipe generation.
- [ ] Decide where later AI workflow assists beyond depth estimation: segmentation, style constraints, preview QA, or texture cleanup.

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

## Phase 5 - Launch Readiness

- [ ] Privacy policy and terms.
- [ ] App content moderation and safety review.
- [ ] Analytics and conversion funnel events.
- [ ] Error monitoring and structured logs.
- [ ] Cloud Storage lifecycle rules for abandoned uploads.
- [ ] Cost caps, quotas, and alerts.
- [ ] Resolve dependency audit advisories or document accepted transitive risk.
- [ ] Create Firebase App Hosting staging and production backends.
- [ ] Add Cloudflare DNS records after Firebase App Hosting backend domains exist.
- [ ] Domain, SSL, and production deploy.
