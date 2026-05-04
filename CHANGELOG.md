# Changelog

All notable project changes will be documented in this file.

## [Unreleased] - 2026-05-04

### Added

- Added Firebase client initialization for the web app, including optional local emulator wiring.
- Added web sign-in controls for email/password accounts and anonymous guest sessions.
- Added authenticated source-photo upload to Firebase Storage under `uploads/{uid}/{jobId}/source.{jpg|png}`.
- Wired the web flow to call `createGenerationJob` with the uploaded Storage path, selected style, and generated job id.
- Wired checkout to call the authenticated `createCheckoutSession` Firebase Function with the real job id instead of the local preview placeholder.
- Added responsive UI status/error states for auth, upload, job creation, and checkout readiness.

### Changed

- Tightened `createGenerationJob` validation so job ids are client-provided but constrained, unique, and tied to the signed-in user's upload path.
- Updated the relief preview to show the MVP 5in x 7in dimensions as `127mm x 178mm` and keep the canvas framed on mobile.
- Updated `.gitignore` so source files under `apps/web/lib` can be tracked while generated package `lib` folders remain ignored.
- Marked the Phase 1 Firebase Auth, authenticated upload, and style/job creation checklist items as complete.

### Verified

- Verified web and Functions TypeScript checks.
- Verified the Next.js production build.
- Verified desktop and mobile rendering through a headless browser smoke check, including nonblank 3D canvas pixels and no mobile horizontal overflow.

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
