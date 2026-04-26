# 3DPrintPosters - AI Developer Notes

Last updated: 2026-04-26

## Project Intent

3DPrintPosters will let users upload personal photos, generate a stylized 3D-printable poster design, convert the result into an STL file, and send the print job to a fulfillment provider such as Sculpteo.

Note: use `STL` for the 3D model format. If any prompt or ticket says `SLT`, treat it as a typo.

## Planned Stack

- Frontend app: Next.js web-first PWA in `apps/web`
- Backend and app platform: Firebase
- Cloud project: reuse existing GCP/Firebase project `gen-lang-client-0675309660`
- CLI tooling already installed locally:
  - Firebase CLI
  - Node.js 22
  - npm
- CLI tooling still needed for some deployment work:
  - Google Cloud CLI (`gcloud`)
- Serverless runtime target: Firebase Cloud Functions 2nd gen on Node.js 22
- Database: Cloud Firestore
- Auth: Firebase Authentication
- Storage: Firebase Storage or Google Cloud Storage for uploaded photos, generated previews, and STL artifacts
- AI/image generation: provider undecided; Cloudflare AI Gateway is planned as the routing and observability layer
- Fulfillment: Sculpteo API or comparable 3D print fulfillment API
- Future native/mobile packaging can be evaluated after the web MVP is stable.

## High-Level User Flow

1. User signs in.
2. User uploads one or more photos.
3. App stores the original image in Storage and creates a Firestore job record.
4. Backend validates image safety, size, file type, and user quota.
5. AI pipeline creates a stylized poster image or depth/heightmap source.
6. STL generation service converts the selected design into a 3D relief model.
7. User previews the 3D result in-app.
8. User checks out.
9. Payment webhook locks the order and sends STL plus order metadata to Sculpteo.
10. Fulfillment status updates are written back to Firestore and shown in the web app.

## Suggested Firebase/GCP Services

- Firebase Auth: user accounts and order ownership.
- Firestore: users, jobs, designs, orders, fulfillment events, pricing snapshots.
- Cloud Storage: raw uploads, generated images, STL files, thumbnails, logs where appropriate.
- Cloud Functions:
  - Callable functions for user-triggered actions such as starting a generation job.
  - Firestore/Storage triggers for async pipeline steps.
  - HTTPS webhooks for Stripe and Sculpteo callbacks.
  - Scheduled cleanup for abandoned uploads and expired generated assets.
- AI Gateway plus selected model provider: image generation, image editing, classification, or moderation where needed.
- Secret Manager: Sculpteo API keys, Stripe keys, webhook secrets, model provider credentials.
- Cloud Tasks or Pub/Sub: queue long-running generation and fulfillment steps.

## Important Architecture Notes

- Do not run STL generation directly in the browser client. Keep geometry generation server-side so API keys, model logic, and fulfillment details remain private.
- If STL generation needs Python, native libraries, or longer CPU time, consider Cloud Run for that specific service instead of Cloud Functions.
- Keep Cloud Functions for orchestration, webhooks, auth checks, Firestore writes, and short API calls.
- Store user uploads and generated artifacts under user/job scoped paths, for example:
  - `uploads/{uid}/{jobId}/source.jpg`
  - `generated/{uid}/{jobId}/preview.png`
  - `stl/{uid}/{jobId}/model.stl`
- Firestore should store metadata and signed URLs or storage paths, not large binary payloads.
- Use idempotency keys for checkout, STL upload, and Sculpteo order creation.
- Track every external fulfillment request and response enough to debug failed orders.

## Initial Firestore Model

Collections to consider:

- `users/{uid}`
  - profile, email, createdAt, role, quota, Stripe customer id
- `jobs/{jobId}`
  - uid, status, sourceImagePath, selectedStyle, generatedImagePath, stlPath, error, createdAt, updatedAt
- `orders/{orderId}`
  - uid, jobId, status, paymentStatus, fulfillmentStatus, provider, providerOrderId, shippingSummary, priceSnapshot
- `fulfillmentEvents/{eventId}`
  - orderId, provider, eventType, payload, createdAt

## Security Rules Direction

- Users can read only their own jobs and orders.
- Users can create upload/job records only for themselves.
- Users cannot directly mark jobs as complete, set STL paths, or create fulfillment orders.
- Server-side functions should own status transitions after validation.
- Storage rules should restrict reads/writes by authenticated uid and file path ownership.

## Cloudflare Notes

- Product domain: `3dprintposters.com`.
- Cloudflare account ID: `778c1ab69c11e349c591073496bcb4a9`.
- Local environment variable names:
  - `CLOUDFLARE_ACCOUNT_ID`
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ZONE_NAME`
- The Cloudflare account API token was verified on 2026-04-26 for account token verification, AI Gateway list access, and zone lookup for `3dprintposters.com`.
- Keep Cloudflare tokens local-only. Do not paste token values into chat, docs, source files, or issue text.
- Browser Use dashboard automation is currently blocked on this machine because the Node runtime resolved for `node_repl` is `v22.17.1`, while the Browser Use plugin requires Node `>=22.22.0`.
- AI Gateway is planned but not configured yet; choose the first provider/model before wiring app calls through the gateway.

## Local Setup Commands

Use the same Firebase/GCP project:

```powershell
firebase use gen-lang-client-0675309660
gcloud config set project gen-lang-client-0675309660
```

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

## Sculpteo/Fulfillment Integration Notes

- Confirm current Sculpteo API capabilities before implementation:
  - STL upload endpoint
  - printability checks
  - material selection
  - dimensions and units
  - pricing quote endpoint
  - order creation endpoint
  - webhook/callback support
- Do not create a paid fulfillment order until payment is confirmed.
- Save the exact STL, material, dimensions, quote, shipping option, and API response used for each order.
- Build a manual admin retry path for failed fulfillment orders.

## Open Decisions

- First AI model provider and whether to start with Cloudflare AI Gateway plus a provider-native API or Workers AI.
- Whether STL generation runs in Node.js Functions, Python Cloud Run, or a hybrid.
- Which AI model creates the printable source image or heightmap.
- Whether users can edit depth/relief settings before checkout.
- Whether native iOS/Android packaging is needed after the web MVP.
- Whether the same Firebase project should host production and staging, or whether a separate Firebase project should be created later for staging.

## Developer Cautions

- The existing `gen-lang-client-0675309660` project is shared with other work. Use clear app names, service names, Firestore collection prefixes if needed, and separate Storage paths.
- Keep API keys and webhook secrets in Secret Manager or Firebase Functions secrets.
- Generated images and STL files can become expensive. Add quotas, cleanup jobs, and lifecycle policies early.
- Validate file size, MIME type, image dimensions, and STL size before accepting or fulfilling a job.
- Add audit logging for payment and fulfillment state transitions.
