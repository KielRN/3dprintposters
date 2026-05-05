# Changelog

All notable project changes will be documented in this file.

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
