# Implementation Checklist

## Phase 0 - Project Foundation

- [x] Choose web-first PWA architecture with backend services that can support native apps later.
- [x] Create monorepo folders for web, functions, print file generation services, infrastructure, and docs.
- [x] Add changelog.
- [x] Add implementation checklist.
- [x] Add secret-safe gitignore patterns.
- [ ] Confirm final production/staging Firebase project strategy.
- [x] Install dependencies and create lockfile.
- [ ] Configure Firebase project alias for local development.
- [x] Verify Cloudflare account API token access for account AI Gateway reads and the `3dprintposters.com` zone.
- [x] Verify Google/Gemini/Vertex API keys for initial live model-provider calls.
- [ ] Confirm Cloudflare DNS target for the first deploy.
- [x] Choose direct GCP Vertex/Gemini as the first MVP AI route.
- [x] Keep AI calls behind a provider adapter so Cloudflare AI Gateway can be added later without changing orchestration code.
- [ ] Defer Cloudflare AI Gateway creation until provider comparison, centralized AI observability, rate limits, retries, or fallback are needed.
- [ ] Defer Workers AI evaluation until after the direct Vertex/Gemini MVP path proves the product workflow.

## Phase 1 - Web MVP

- [x] Scaffold mobile-first Next.js app shell.
- [x] Add placeholder upload and 3D preview UI.
- [ ] Add Firebase Auth sign-in.
- [ ] Add authenticated upload to Cloud Storage.
- [ ] Add style selection and job creation flow.
- [ ] Add generated image approval gallery.
- [ ] Add real STL preview from backend output.
- [ ] Add order history and fulfillment status screens.
- [ ] Add PWA manifest, icons, and install behavior.

## Phase 2 - Backend Orchestration

- [x] Scaffold Firebase Functions package.
- [x] Add job creation boundary.
- [x] Add checkout and Stripe webhook boundaries.
- [x] Add internal AI provider adapter scaffold with direct Vertex/Gemini as the default route.
- [ ] Add Firestore rules deployment.
- [ ] Add Storage rules deployment.
- [ ] Add Firebase emulator workflow.
- [ ] Add server-side AI generation callable or queue worker through the internal provider adapter.
- [ ] Replace the adapter stub with a real direct Vertex/Gemini request.
- [ ] Store generated preview images in user/job-scoped Cloud Storage paths.
- [ ] Persist AI generation metadata on the Firestore job without storing secrets.
- [ ] Add queueing with Cloud Tasks or Pub/Sub.
- [ ] Add idempotency keys for job, checkout, and fulfillment actions.
- [ ] Add user quotas and abuse controls.

## Phase 3 - Print File Generation

- [x] Create Python Cloud Run service contract for STL generation.
- [x] Create broader print file generator service contract.
- [ ] Implement image validation and normalization.
- [ ] Add 5:7 crop/pad handling for the 5in x 7in product.
- [ ] Implement heightmap generation.
- [ ] Implement binary STL mesh generation.
- [ ] Add color-capable export package for Mimaki 3DUJ-2207 partners.
- [ ] Add filament painting palette, layer swap, print settings, and preview outputs.
- [ ] Add optional GLB/preview mesh generation for browser preview.
- [ ] Add printability preflight checks.
- [ ] Add color/material recipe generation.
- [ ] Add tests with known image fixtures.
- [ ] Decide where AI workflow assists: depth estimation, segmentation, style constraints, or QA.

## Phase 4 - Payments and Fulfillment

- [x] Create Stripe test product and $60 USD one-time price.
- [ ] Configure Stripe webhook secrets.
- [x] Create checkout sessions for physical poster orders.
- [ ] Persist Stripe customer and session ids.
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
- [ ] Domain, SSL, and production deploy.
