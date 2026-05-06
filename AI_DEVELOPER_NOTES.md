# 3DPrintPosters - AI Developer Notes

Last updated: 2026-05-06

## Project Intent

3DPrintPosters will let users upload personal photos, generate a stylized 3D-printable poster design, convert the result into a 5in x 7in 3D relief package, and send the print job to a fulfillment business that can print on a Mimaki 3DUJ-2207 or comparable full-color 3D printer.

Note: use `STL` for the 3D model format. If any prompt or ticket says `SLT`, treat it as a typo.

## Planned Stack

- Frontend app: Next.js web-first PWA in `apps/web`
- Backend and app platform: Firebase
- Cloud project strategy: use existing GCP/Firebase project `gen-lang-client-0675309660` for local development and MVP testing only; create separate dedicated staging and production projects before public deploy.
- CLI tooling already installed locally:
  - Firebase CLI
  - Node.js 22
  - npm
- Web hosting: Firebase App Hosting for the Next.js customer app in `apps/web`, with a staging backend before production.
- Serverless runtime target: Firebase Cloud Functions 2nd gen on Node.js 22
- Database: Cloud Firestore
- Auth: Firebase Authentication
- Storage: Firebase Storage or Google Cloud Storage for uploaded photos, generated previews, and print file artifacts
- AI/image generation: start with direct GCP Vertex/Gemini integration for MVP speed, behind an internal provider adapter that can later route through Cloudflare AI Gateway
- Fulfillment: Mimaki 3DUJ-2207 print partner first; Sculpteo API access is on hold until provider fit is confirmed
- Future native/mobile packaging can be evaluated after the web MVP is stable.

## High-Level User Flow

1. User signs in.
2. User uploads one photo for the first MVP path.
3. App stores the original image in Storage and creates a Firestore job record.
4. Backend validates image safety, size, file type, and user quota.
5. AI pipeline creates a stylized poster image or depth/heightmap source.
6. User approves one generated proof. In the current test build, the uploaded source photo is used as a temporary proof so the approval and checkout path can be tested before AI output is connected.
7. Print file generator converts the approved design into a 5in x 7in artifact bundle with relief geometry, color-capable print package, and filament painting support files.
8. User previews the 3D result in-app.
9. User checks out.
10. Payment webhook locks the order and sends the geometry, color-capable print package, and order metadata to the selected print partner.
11. Fulfillment status updates are written back to Firestore and shown in the web app.

## Suggested Firebase/GCP Services

- Firebase Auth: user accounts and order ownership.
- Firestore: users, jobs, designs, orders, fulfillment events, pricing snapshots.
- Cloud Storage: raw uploads, generated images, STL files, thumbnails, logs where appropriate.
- Dev Firebase Storage bucket: `gen-lang-client-0675309660.firebasestorage.app` in `US-CENTRAL1`.
- Cloud Functions:
  - Callable functions for user-triggered actions such as starting a generation job.
  - Firestore/Storage triggers for async pipeline steps.
  - HTTPS webhooks for Stripe and fulfillment callbacks.
  - Scheduled cleanup for abandoned uploads and expired generated assets.
- Direct Vertex/Gemini first for image generation, image editing, classification, or moderation where needed; keep calls behind an internal adapter so Cloudflare AI Gateway can be introduced later without changing orchestration code.
- Secret Manager: fulfillment provider credentials, Stripe keys, webhook secrets, model provider credentials.
- Cloud Tasks or Pub/Sub: queue long-running generation and fulfillment steps.

## Important Architecture Notes

- Do not run print file generation directly in the browser client. Keep geometry generation, texture packaging, and filament painting logic server-side so API keys, model logic, and fulfillment details remain private.
- The current web MVP creates an authenticated Firebase session, uploads a source JPG or PNG to `uploads/{uid}/{jobId}/source.{jpg|png}`, and then calls `createGenerationJob` with the generated job id, upload path, and selected style.
- `createGenerationJob` requires the supplied upload path to match the signed-in user's `uploads/{uid}/{jobId}` prefix before it creates `jobs/{jobId}`.
- `createGenerationJob` now creates a durable `generating` job, calls the internal AI provider adapter server-side, stores non-secret `aiGeneration` metadata, stores the generated proof in Firebase Storage, and then marks the job `preview_ready` or `failed`.
- Repeated `createGenerationJob` calls for the same signed-in user, upload path, and style return the existing job status instead of creating a duplicate.
- The direct Vertex/Gemini adapter now reads the uploaded source image, sends it to the Vertex AI express-mode `generateContent` endpoint with text and image response modalities, stores the returned proof under `generated/{uid}/{jobId}/preview.{png|jpg|webp}`, and then uses `approveGeneratedImage` to set `approvedImagePath`.
- `createCheckoutSession` should reject jobs that do not have `status: "approved"` and an `approvedImagePath`.
- For the current one-order-per-job MVP path, `createCheckoutSession` uses `orders/{jobId}` as the deterministic order document and sends a Stripe idempotency key based on user id, job id, and approved proof path.
- If print file generation needs Python, native libraries, or longer CPU time, use Cloud Run for that specific service instead of Cloud Functions.
- Keep Cloud Functions for orchestration, webhooks, auth checks, Firestore writes, and short API calls.
- Accepted print-file generator decision: keep `services/print-file-generator` as the production FastAPI/Cloud Run boundary and selectively extract core image, heightmap, STL, metadata, color, and test concepts from `E:\PROJECTS\print-file-generator`.
- Do not vendor the standalone generator's Flask routes, SQLite local project database, browser session state, local CLI control flow, TD1 hardware code, or current open-surface mesh topology into production.
- The next print-file implementation slice is deterministic closed relief generation: validated image input, 5:7 crop/pad, luminance heightmap fallback, closed 127mm x 177.8mm mesh with top surface/base/sidewalls, binary STL, heightmap PNG, metadata JSON, and printability checks.
- Add AI depth providers only after the deterministic relief path works. Start with Depth Anything V2 Small as the first experimental provider, then compare Depth Pro and MoGe if needed.
- Store user uploads and generated artifacts under user/job scoped paths, for example:
  - `uploads/{uid}/{jobId}/source.jpg`
  - `generated/{uid}/{jobId}/preview.png`
  - `print-files/{uid}/{jobId}/model.stl`
  - `print-files/{uid}/{jobId}/full-color/print-package.3mf`
  - `print-files/{uid}/{jobId}/filament-painting/palette.json`
- Firestore should store metadata and signed URLs or storage paths, not large binary payloads.
- Use idempotency keys for checkout, file handoff, and fulfillment order creation.
- Track every external fulfillment request and response enough to debug failed orders.

## Initial Firestore Model

Collections to consider:

- `users/{uid}`
  - profile, email, createdAt, role, quota, Stripe customer id
- `jobs/{jobId}`
  - uid, status, sourceImagePath, selectedStyle, generatedImages, approvedImagePath, approvedAt, aiGeneration, printFileOutputPrefix, printFileArtifacts, error, createdAt, updatedAt
- `orders/{orderId}`
  - uid, jobId, approvedImagePath, status, paymentStatus, fulfillmentStatus, stripeCheckoutSessionId, provider, providerOrderId, shippingSummary, priceSnapshot
- `fulfillmentEvents/{eventId}`
  - orderId, provider, eventType, payload, createdAt

## Security Rules Direction

- Users can read only their own jobs and orders.
- Users can create upload/job records only for themselves.
- Users cannot directly mark jobs as complete, set print artifact paths, or create fulfillment orders.
- Server-side functions should own status transitions after validation.
- Storage rules should restrict reads/writes by authenticated uid and file path ownership.

## Cloudflare Notes

- Product domain: `3dprintposters.com`.
- First deploy DNS plan: `staging.3dprintposters.com` points to the staging Firebase App Hosting backend domain after it exists.
- Launch DNS plan: `www.3dprintposters.com` points to the production Firebase App Hosting backend domain, with apex redirect or flattening handled in Cloudflare.
- Cloudflare account ID: `778c1ab69c11e349c591073496bcb4a9`.
- Local environment variable names:
  - `CLOUDFLARE_ACCOUNT_ID`
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ZONE_NAME`
- The Cloudflare account API token was verified on 2026-04-26 for account token verification, AI Gateway list access, and zone lookup for `3dprintposters.com`.
- Keep Cloudflare tokens local-only. Do not paste token values into chat, docs, source files, or issue text.
- Browser Use dashboard automation is currently blocked on this machine because the Node runtime resolved for `node_repl` is `v22.17.1`, while the Browser Use plugin requires Node `>=22.22.0`.
- AI Gateway is not an MVP dependency. Start with direct Vertex/Gemini calls from server runtimes, and add Cloudflare AI Gateway later if provider comparison, centralized AI observability, rate limits, retries, or fallback become important.

## AI Provider Credential Notes

- Google/Gemini/Vertex credentials were verified on 2026-04-26 with secret values redacted from output.
- `GOOGLE_API_KEY` and `GEMINI_API_KEY` are present in the root `.env` and are currently the same key. Both completed a live Gemini Developer API `gemini-2.5-flash` request.
- `VERTEX_API_KEY` is present in the root `.env`, is separate from the Google/Gemini key, and completed a live Vertex AI Gemini API `gemini-2.5-flash` request through `https://aiplatform.googleapis.com`.
- `VERTEX_IMAGE_MODEL` defaults to `gemini-2.5-flash-image` for generated proof images. `VERTEX_IMAGE_ASPECT_RATIO` is optional and should be left blank unless a supported Vertex/Gemini image aspect ratio is intentionally chosen.
- `VERTEX_PROJECT`, `VERTEX_LOCATION`, and `VERTEX_GCS_BUCKET` are present locally.
- `gcloud` was repaired on 2026-04-26 using the existing user install at `C:\Users\Eliud\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd`.
- Application Default Credentials were created on 2026-04-26 for local Google client libraries, with quota project `gen-lang-client-0675309660`.
- Vertex AI, Gemini API, and Cloud Storage APIs are enabled for the configured project, and the configured `VERTEX_GCS_BUCKET` was reachable with `gcloud storage buckets describe`.
- Keep `GOOGLE_API_KEY`, `GEMINI_API_KEY`, and `VERTEX_API_KEY` server-only. Use Firebase Functions secrets or Google Secret Manager for deployed runtimes.
- Official reference: [Gemini API in Vertex AI quickstart](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start?usertype=apikey). It supports API-key auth for Vertex AI Gemini testing; production should still prefer tighter server-side auth and secret handling.

## Local Setup Commands

Use the same Firebase/GCP project:

```powershell
firebase use dev
gcloud config set project gen-lang-client-0675309660
```

The checked-in `.firebaserc` maps `dev` and `default` to `gen-lang-client-0675309660`. Add `staging` and `production` aliases only after dedicated Firebase/GCP projects exist.

For the web app, populate `apps/web/.env.local` with the public Firebase web config values from `apps/web/.env.local.example`. Set `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true` only when the local Firebase emulator suite is running.

For local Functions emulator runs, populate `apps/functions/.env` from `apps/functions/.env.example` with server-only values such as `VERTEX_API_KEY`.

For the function-only customer-flow test, keep Auth, Firestore, and Storage pointed at the configured Firebase project:

```powershell
npm run firebase:emulators:functions
```

Then run the web app with `NEXT_PUBLIC_USE_FIREBASE_FUNCTIONS_EMULATOR=true`.

For the full local emulator suite, install JDK 21+, set `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true`, and run:

```powershell
npm run firebase:emulators:full
```

Use `npm run firebase:emulators:full:export` when emulator data should be imported/exported under `.codex-run/firebase-emulators`. On this machine, the full suite preflight currently reports Java 17 and blocks until JDK 21+ is installed.

For the first public staging deploy, create a Firebase App Hosting backend with app root `apps/web`, region `us-central1`, and backend name `3dprintposters-web-staging`. Keep `apps/web/apphosting.yaml` as the checked-in non-secret runtime baseline.

For Functions, use Node.js 22:

```json
{
  "engines": {
    "node": "22"
  }
}
```

Deploy examples:

```powershell
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only functions
```

## Fulfillment Integration Notes

- Sculpteo API access is on hold.
- Prioritize finding a business that can print on a Mimaki 3DUJ-2207 or comparable full-color UV-curable inkjet 3D printer.
- Confirm these partner capabilities before implementation:
  - accepted 3D file formats for full-color jobs
  - whether STL is useful only as geometry reference
  - OBJ/VRML/PLY/3MF package requirements
  - 5in x 7in relief dimensions and units
  - minimum base thickness, wall thickness, relief depth, and minimum feature size
  - color/texture handling and color-management expectations
  - pricing quote workflow
  - order creation workflow or manual review workflow
  - webhook/callback support, email updates, or manual status process
- Do not create a paid fulfillment order until payment is confirmed.
- Save the exact geometry file, color package, material profile, dimensions, quote, shipping option, and partner response used for each order.
- Build a manual admin retry path for failed fulfillment orders.

## Open Decisions

- Which AI model creates the printable source image, segmentation, or heightmap.
- Whether and when Cloudflare AI Gateway should be added after direct Vertex/Gemini MVP integration.
- Whether users can edit depth/relief settings before checkout.
- Whether a source-photo proof fallback is needed for provider outages or if generation failures should stay hard failures.
- Whether native iOS/Android packaging is needed after the web MVP.

## Developer Cautions

- The existing `gen-lang-client-0675309660` project is shared with other work. Use clear app names, service names, Firestore collection prefixes if needed, and separate Storage paths.
- Keep API keys and webhook secrets in Secret Manager or Firebase Functions secrets.
- Generated images and STL files can become expensive. Add quotas, cleanup jobs, and lifecycle policies early.
- Validate file size, MIME type, image dimensions, STL size, texture package size, and 5x7 physical dimensions before accepting or fulfilling a job.
- Add audit logging for payment and fulfillment state transitions.
