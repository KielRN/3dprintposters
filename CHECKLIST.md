# Implementation Checklist

## Phase 0 - Project Foundation

- [x] Choose web-first PWA architecture with backend services that can support native apps later.
- [x] Create monorepo folders for web, functions, STL service, infrastructure, and docs.
- [x] Add changelog.
- [x] Add implementation checklist.
- [x] Add secret-safe gitignore patterns.
- [ ] Confirm final production/staging Firebase project strategy.
- [x] Install dependencies and create lockfile.
- [ ] Configure Firebase project alias for local development.
- [x] Verify Cloudflare account API token access for account AI Gateway reads and the `3dprintposters.com` zone.
- [ ] Confirm Cloudflare DNS target for the first deploy.
- [ ] Create Cloudflare AI Gateway for the project.
- [ ] Choose first AI Gateway provider and model strategy.
- [ ] Route server-side AI calls through the selected AI Gateway.

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
- [ ] Add Firestore rules deployment.
- [ ] Add Storage rules deployment.
- [ ] Add Firebase emulator workflow.
- [ ] Add server-side AI generation function behind the selected gateway/provider.
- [ ] Add queueing with Cloud Tasks or Pub/Sub.
- [ ] Add idempotency keys for job, checkout, and fulfillment actions.
- [ ] Add user quotas and abuse controls.

## Phase 3 - STL Conversion

- [x] Create Python Cloud Run service contract.
- [ ] Implement image validation and normalization.
- [ ] Implement heightmap generation.
- [ ] Implement binary STL mesh generation.
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
- [ ] Confirm Sculpteo API endpoints and material options.
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
