# Architecture

## Product Shape

3D Print Posters is pivoting to a mobile-first web/PWA flow for proving personalized AI figurine demand. Users upload a photo, choose a figurine style and posture, approve a 2D proof, preview a standalone generated 3D figurine, and either check out or enter a preorder/manual-fulfillment funnel.

The poster-relief product remains implemented R&D. If that line resumes, users upload a photo, choose a style, approve controlled generated art, preview a 5in x 7in 3D relief, pay for a physical poster, and track fulfillment. The "Super Dad" generated proof remains the parked relief north star.

The native app path stays open because the product boundaries are server-centered. A future iOS or Android app can reuse the same Firebase Auth, Firestore records, Storage artifacts, Stripe order state, and print file generation service.

## System Components

### Customer App

Location: `apps/web`

- Next.js App Router.
- Mobile-first responsive UI.
- Firebase Auth for user identity, with email/password and anonymous guest sessions in the MVP UI.
- Firebase Storage for source uploads and generated assets.
- Firebase callable Functions for authenticated generation job creation, proof approval, and checkout session creation.
- Firestore reads for job/order status.
- Three.js/React Three Fiber for relief preview.
- Stripe Checkout for physical poster payment.

For the figurine pivot, the same app should present a PrintU-like style/posture flow and standalone figurine GLB review instead of assuming every job has a heightmap/relief preview.

### Firebase Functions

Location: `apps/functions`

Responsibilities:

- Create authenticated generation jobs.
- Validate user quota, upload ownership, and upload metadata.
- Trigger selected AI provider generation through the internal provider adapter. Direct Vertex/Gemini image generation is the default MVP route; Cloudflare AI Gateway can be added later behind the same adapter.
- Record approved generated proofs and block checkout until approval exists.
- Dispatch generated 3D model provider work for standalone figurines through a server-side provider adapter, with Meshy.ai as the first candidate after terms/cost/output review.
- Dispatch print file generation work.
- Create Stripe Checkout sessions.
- Receive Stripe webhooks.
- Receive fulfillment callbacks.
- Own Firestore status transitions that users cannot write directly.

### Generated 3D Model Provider

Initial candidate: Meshy.ai.

Responsibilities:

- Generate standalone figurine or character/object assets from an approved proof or source image.
- Keep provider API keys server-side only.
- Support asynchronous task creation, polling, and later webhook updates.
- Store returned assets under user/job scoped Storage paths before external provider retention expires.
- Preserve GLB for browser preview, STL for geometry validation or single-color printing, and 3MF when multicolor/Bambu-style workflows are in scope.
- Record provider audit metadata such as provider id, model version, task id, requested formats, status, warnings, consumed credits/cost, and source artifact paths without storing secrets.

Meshy webhook setup note: official Meshy docs currently direct users to create webhooks in the Meshy web app API settings page. Webhooks require HTTPS URLs. The Cloudflare Worker receiver is live as a Workers custom domain at `https://api.3dprintyou.com/webhooks/meshy`, with the default `workers.dev` trigger disabled.

### Print File Generator Service

Location: `services/print-file-generator`

Runtime target: Python on Cloud Run.

Architecture decision: keep this as the production FastAPI/Cloud Run boundary and selectively extract core image, heightmap, STL, metadata, color, and test concepts from `E:\PROJECTS\print-file-generator`. Do not vendor that standalone project's Flask web app, SQLite local project database, browser session state, CLI control plane, or TD1 hardware code into this service.

Parked poster-relief responsibilities:

- Read selected generated image from Cloud Storage.
- Interpret style and surface-intent metadata when available, with smooth surfaces as the default unless text, logos, panel lines, fabric, hair, or other printable texture classes are explicitly requested.
- Convert image into a geometry-analysis relief heightmap and final mesh/color output geometry.
- Generate a closed, watertight 5.5in x 7.5in physical relief mesh with a 5in x 7in image window, top surface, base plane, sidewalls, controlled relief range, and exact physical bounds.
- Generate binary STL as a baseline geometry artifact.
- Generate a color-capable print package for Mimaki 3DUJ-2207 partners, such as 3MF or OBJ plus texture.
- Generate filament painting support files such as palette, layer swaps, print settings, and preview.
- Generate an image-colored GLB/mesh preview for the web app from the same output geometry.
- Write print artifacts and preview assets back to Cloud Storage.
- Return an artifact manifest and printability metadata.

This is intentionally separate from Firebase Functions because geometry generation, texture packaging, and filament painting preparation may need Python libraries, CPU time, memory, and longer request windows.

The current implementation is a hybrid deterministic/service boundary: validated image input, separate 768px geometry-analysis and 400px output normalizations, geometry-only proof cleanup, Depth Anything V2 semantic depth, contour-smoothed SegFormer subject masking, deterministic in-mask lithophane detail, face/forehead pit guarding without a nose-specific boost, closed mesh generation, STL/heightmap/GLB/metadata output, color packages, filament-painting support files, and printability checks.

The next product-quality layer is surface-intent aware relief generation. Instead of treating every approved-proof texture as geometry, the service should infer or consume region/material intent so scalp, neck, skin, simple clothing, and background areas stay smooth, while text, logos, suit panels, emblems, and deliberate material textures stay crisp.

### Firebase/GCP

- Firebase Auth: account identity and order ownership.
- Firestore: users, jobs, orders, fulfillment events, audit records.
- Cloud Storage: original uploads, generated previews, STL files, thumbnails.
- Direct Vertex/Gemini through the internal provider adapter for the first AI image generation and possible depth/segmentation workflow. Cloudflare AI Gateway remains a later routing and observability layer.
- Secret Manager/Firebase secrets: Stripe, fulfillment provider, webhook, and model credentials.
- Cloud Tasks or Pub/Sub: async dispatch between generation, print file generation, and fulfillment.

### Stripe

Stripe is used for checkout because the primary purchase is a physical product. Physical goods are not treated as digital in-app purchases, which also keeps native app options cleaner later.

Initial objects:

- Checkout Session.
- Customer.
- Payment Intent.
- Webhook events.
- Metadata linking `uid`, `jobId`, and `orderId`.

### Fulfillment

For the active figurine pivot, fulfillment is undecided. Evaluate the simplest path that can ship acceptable standalone figurines: local/Bambu-class FDM, a nearby print partner, manual quoting, or a later automated provider. Do not promise automated fulfillment until Meshy/provider outputs pass slicer and physical-print validation.

For the parked relief path, the target provider remains a business that can print on a Mimaki 3DUJ-2207 or comparable full-color UV-curable inkjet 3D printer. Sculpteo API work is on hold until we confirm whether it fits the 5x7 full-color relief product.

The first implementation should isolate provider logic behind a small interface:

- Quote order.
- Upload or hand off STL plus color-capable package.
- Create paid fulfillment order.
- Receive provider status callback.
- Retry or flag manual review.

## Data Flow

Active figurine target flow:

1. User signs in with email/password or an anonymous guest session.
2. Web app creates a job id and uploads a source JPG or PNG to `uploads/{uid}/{jobId}/source.{jpg|png}`.
3. Web app calls `createGenerationJob` with `jobId`, `sourceImagePath`, selected figurine style, and selected posture.
4. Function verifies the signed-in user owns the upload path and creates `jobs/{jobId}` with `status: "generating"`.
5. Function calls the internal AI provider adapter, stores the generated 2D proof under `generated/{uid}/{jobId}/preview.{png|jpg|webp}`, stores non-secret `aiGeneration` metadata, and marks the job `preview_ready` or `failed`.
6. Job `generatedImages` lists the generated proof Storage path so the approval and checkout flow use the real AI output.
7. User approves one proof through `approveGeneratedImage`; the Function records `approvedImagePath` and sets `status: "approved"`.
8. Backend dispatches the generated 3D model provider, starting with Meshy if validation passes.
9. Backend downloads returned model assets into Storage under a path such as `generated-models/{uid}/{jobId}/`.
10. Job stores `generatedModelArtifacts`, provider audit, task id, status, warnings, consumed credits/cost, and preview path.
11. User reviews the standalone figurine GLB and starts checkout, preorder, or lead capture.
12. Stripe webhook confirms payment if checkout is enabled.
13. Function sends the locked model manifest and shipping data to manual or automated fulfillment only after the selected fulfillment path is validated.
14. Fulfillment events update the order record.

Parked poster-relief flow: after proof approval, backend dispatches `services/print-file-generator`; the service writes `model.stl`, color package artifacts, filament painting support files, `heightmap.png`, `preview.glb`, and printability metadata; checkout is gated on generated print-file artifacts.

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
- `aiGeneration`
- `approvedImagePath`
- `approvedAt`
- `selectedPosture`
- `generatedModelOutputPrefix`
- `generatedModelArtifacts`
- `generatedModelAudit`
- `printFileOutputPrefix`
- `printFileArtifacts`
- `previewMeshPath`
- `printability`
- `error`
- `createdAt`
- `updatedAt`

Suggested statuses:

- `created`
- `preview_ready`
- `upload_validated`
- `generating`
- `awaiting_selection`
- `approved`
- `model_generation_queued`
- `model_generation_processing`
- `print_files_queued`
- `print_files_processing`
- `ready_for_checkout`
- `failed`

### `orders/{orderId}`

- `uid`
- `jobId`
- `approvedImagePath`
- `status`
- `paymentStatus`
- `fulfillmentStatus`
- `stripeCheckoutSessionId`
- `stripePaymentIntentId`
- `checkoutAttempt`
- `checkoutIdempotencyKey`
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
- The active web flow calls a Function to create job records after upload. The Function rejects job ids or source image paths that are not under the signed-in user's `uploads/{uid}/{jobId}` prefix.
- The client cannot mark jobs complete, set STL paths, set fulfillment data, or mark orders paid.
- Stripe, fulfillment provider, model provider, Cloudflare, and service account credentials live only in server runtimes.
- Every external side effect should be idempotent and logged.

## Domain and Hosting Direction

Cloudflare owns DNS. Firebase App Hosting is the selected first public web host for the Next.js customer app in `apps/web`.

Initial deployment shape:

- `3dprintyou.com` is the preferred customer-facing domain candidate for the figurine pivot.
- `staging.3dprintyou.com` or another chosen staging hostname points to the staging Firebase App Hosting backend domain.
- `www.3dprintyou.com` points to the production App Hosting backend domain after the production backend exists.
- `3dprintposters.com` remains available for the parked poster-relief line or redirect strategy.

## Open Decisions

- Exact Mimaki 3DUJ-2207 print partner and whether it supports API order creation or requires manual quoting/file review.
- Whether `3dprintyou.com` is staged and launched as the primary domain or shares traffic with `3dprintposters.com`.
- Whether Meshy output is strong enough for the first figurine MVP and whether the first release uses polling, webhooks, or both.
- Whether the first figurine fulfillment path is paid preorder/manual review, local printing, or an automated print partner.
- Exact v1 surface-intent mask implementation and how much should be inferred by the print-file generator versus emitted by proof generation.
- Which AI provider/model should generate the final controlled artwork for each style family, and whether AI should also help produce depth maps or region/material masks.
- Whether filament painting should stay as support files first or eventually produce slicer-specific projects.
- Whether the preview mesh should be generated in Python, in the browser, or both.
