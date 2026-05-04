# Architecture

## Product Shape

3D Print Posters starts as a mobile-first web app/PWA. Users upload a photo, choose a style, approve generated art, preview a 5in x 7in 3D relief, pay for a physical poster, and track fulfillment.

The native app path stays open because the product boundaries are server-centered. A future iOS or Android app can reuse the same Firebase Auth, Firestore records, Storage artifacts, Stripe order state, and STL conversion service.

## System Components

### Customer App

Location: `apps/web`

- Next.js App Router.
- Mobile-first responsive UI.
- Firebase Auth for user identity.
- Firebase Storage for source uploads and generated assets.
- Firestore reads for job/order status.
- Three.js/React Three Fiber for relief preview.
- Stripe Checkout for physical poster payment.

### Firebase Functions

Location: `apps/functions`

Responsibilities:

- Create authenticated generation jobs.
- Validate user quota and upload metadata.
- Trigger selected AI provider generation through Cloudflare AI Gateway.
- Dispatch STL conversion work.
- Create Stripe Checkout sessions.
- Receive Stripe webhooks.
- Receive fulfillment callbacks.
- Own Firestore status transitions that users cannot write directly.

### Print File Generator Service

Location: `services/print-file-generator`

Runtime target: Python on Cloud Run.

Responsibilities:

- Read selected generated image from Cloud Storage.
- Convert image into a relief heightmap and geometry.
- Generate binary STL as a baseline geometry artifact.
- Generate a color-capable print package for Mimaki 3DUJ-2207 partners, such as 3MF or OBJ plus texture.
- Generate filament painting support files such as palette, layer swaps, print settings, and preview.
- Optionally generate a lower-poly GLB/mesh preview for the web app.
- Write print artifacts and preview assets back to Cloud Storage.
- Return an artifact manifest and printability metadata.

This is intentionally separate from Firebase Functions because geometry generation, texture packaging, and filament painting preparation may need Python libraries, CPU time, memory, and longer request windows.

### Firebase/GCP

- Firebase Auth: account identity and order ownership.
- Firestore: users, jobs, orders, fulfillment events, audit records.
- Cloud Storage: original uploads, generated previews, STL files, thumbnails.
- Cloudflare AI Gateway plus selected provider: AI image generation and possible depth/segmentation workflow.
- Secret Manager/Firebase secrets: Stripe, fulfillment provider, webhook, and model credentials.
- Cloud Tasks or Pub/Sub: async dispatch between generation, STL conversion, and fulfillment.

### Stripe

Stripe is used for checkout because the primary purchase is a physical product. Physical goods are not treated as digital in-app purchases, which also keeps native app options cleaner later.

Initial objects:

- Checkout Session.
- Customer.
- Payment Intent.
- Webhook events.
- Metadata linking `uid`, `jobId`, and `orderId`.

### Fulfillment

Target provider: a business that can print on a Mimaki 3DUJ-2207 or comparable full-color UV-curable inkjet 3D printer. Sculpteo API work is on hold until we confirm whether it fits the 5x7 full-color relief product.

The first implementation should isolate provider logic behind a small interface:

- Quote order.
- Upload or hand off STL plus color-capable package.
- Create paid fulfillment order.
- Receive provider status callback.
- Retry or flag manual review.

## Data Flow

1. User signs in.
2. User uploads a source image to Storage.
3. Web app calls `createGenerationJob`.
4. Function creates `jobs/{jobId}` with `status: "created"`.
5. Backend validates upload and starts generation through the selected AI provider.
6. Generated images are written to Storage and listed under the job.
7. User selects one generated image.
8. Backend dispatches `services/print-file-generator`.
9. Print file service writes `model.stl`, color package artifacts, filament painting support files, optional preview mesh, and printability metadata.
10. User reviews preview and starts checkout.
11. Function creates Stripe Checkout Session and `orders/{orderId}`.
12. Stripe webhook confirms payment.
13. Function sends the locked print file manifest and shipping data to fulfillment.
14. Fulfillment events update the order record.

## Firestore Collections

### `users/{uid}`

- `email`
- `displayName`
- `createdAt`
- `stripeCustomerId`
- `quota`
- `role`

### `jobs/{jobId}`

- `uid`
- `status`
- `selectedStyle`
- `sourceImagePath`
- `generatedImages`
- `selectedImagePath`
- `printFileOutputPrefix`
- `printFileArtifacts`
- `previewMeshPath`
- `printability`
- `error`
- `createdAt`
- `updatedAt`

Suggested statuses:

- `created`
- `upload_validated`
- `generating`
- `awaiting_selection`
- `print_files_queued`
- `print_files_processing`
- `ready_for_checkout`
- `failed`

### `orders/{orderId}`

- `uid`
- `jobId`
- `status`
- `paymentStatus`
- `fulfillmentStatus`
- `stripeCheckoutSessionId`
- `stripePaymentIntentId`
- `provider`
- `providerOrderId`
- `shippingSummary`
- `priceSnapshot`
- `createdAt`
- `updatedAt`

### `fulfillmentEvents/{eventId}`

- `orderId`
- `provider`
- `eventType`
- `payload`
- `createdAt`

## Security Boundaries

- The client can upload only to user-scoped Storage paths.
- The client can create initial job records only for itself or call a function that creates them.
- The client cannot mark jobs complete, set STL paths, set fulfillment data, or mark orders paid.
- Stripe, fulfillment provider, model provider, Cloudflare, and service account credentials live only in server runtimes.
- Every external side effect should be idempotent and logged.

## Domain and Hosting Direction

Cloudflare owns DNS. Initial deployment options:

1. Firebase App Hosting for the Next.js app.
2. Cloud Run for the Next.js app behind Cloudflare.
3. Vercel for the Next.js app, with Firebase/GCP backend services.

Preferred first pass: Firebase App Hosting or Cloud Run, because the backend already sits in GCP/Firebase.

## Open Decisions

- Production/staging project split.
- Whether Firebase App Hosting or Cloud Run hosts the Next.js app.
- Exact Mimaki 3DUJ-2207 print partner and whether it supports API order creation or requires manual quoting/file review.
- Which first AI provider/model should generate final artwork, and whether AI should also help produce depth maps.
- Whether filament painting should stay as support files first or eventually produce slicer-specific projects.
- Whether the preview mesh should be generated in Python, in the browser, or both.
