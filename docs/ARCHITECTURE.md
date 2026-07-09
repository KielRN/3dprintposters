# Architecture

## Product Shape

3D Print Posters is pivoting to a mobile-first web/PWA flow for proving personalized AI figurine demand. Public customers create a verified email account, upload a photo, choose a figurine style and posture, approve a 2D proof, preview a standalone generated 3D figurine, and check out only after the active full-color partner fulfillment path is validated.

The poster-relief product remains implemented R&D. If that line resumes, users upload a photo, choose a style, approve controlled generated art, preview a 5in x 7in 3D relief, pay for a physical poster, and track fulfillment. The "Super Dad" generated proof remains the parked relief north star.

The native app path stays open because the product boundaries are server-centered. A future iOS or Android app can reuse the same Firebase Auth, Firestore records, Storage artifacts, Stripe order state, and print file generation service.

## System Components

### Customer App

Location: `apps/web`

- Next.js App Router.
- Mobile-first responsive UI.
- Firebase Auth for user identity. The current UI still contains email/password and anonymous guest-session plumbing, but the public creation target is verified email before upload or job creation.
- Firebase Storage for source uploads and generated assets.
- Firebase callable Functions for authenticated generation job creation, proof approval, and checkout session creation.
- Firestore reads for job/order status.
- Three.js/React Three Fiber for relief preview.
- Stripe Checkout for physical poster payment.

For the figurine pivot, the same app should present a PrintU-like style/posture flow and standalone figurine GLB review instead of assuming every job has a heightmap/relief preview.

### User Surfaces

- Customer accounts create jobs, spend creation credits, approve proofs, review previews, and check out only when backend eligibility says the package is fulfillable.
- Admin/operator users handle support, refunds, credit adjustments, manual holds, job review, and fulfillment exceptions through server-enforced roles.
- Print-partner users access only assigned approved print packages, partner-facing order details, and download links needed for fulfillment.

### Firebase Functions

Location: `apps/functions`

Responsibilities:

- Create authenticated generation jobs.
- Validate verified email status, user quota/creation-credit state, upload ownership, and upload metadata.
- Reserve, consume, refund, and adjust creation credits through an auditable ledger before provider-spend steps.
- Trigger selected AI provider generation through the internal provider adapter. Direct Vertex/Gemini image generation is the default MVP route; Cloudflare AI Gateway can be added later behind the same adapter.
- Record approved generated proofs and block checkout until approval exists.
- Own the new figurine workflow service layer: source validation, style/posture persistence, concept history, selected concept/model IDs, generated model status, readiness, editor configuration, and checkout/preorder eligibility.
- Dispatch generated 3D model provider work for standalone figurines through a server-side provider adapter, with Meshy.ai as the first candidate after terms/cost/output review.
- Dispatch print file generation work.
- Create Stripe Checkout sessions.
- Receive Stripe webhooks.
- Receive fulfillment callbacks.
- Own Firestore status transitions that users cannot write directly.
- Gate admin/operator and print-partner actions through server-side role checks and audit events.

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

### Figurine Workflow Services To Add

The current figurine workflow contracts live in `docs/Workflows/figurine-and-operator-workflows.md` and the style-specific workflow docs beside it. `docs/MESHY_FIGURINE_UI_WORKFLOW.md` remains the PrintU-inspired planning reference. These services support that workflow family:

- Figurine job orchestration: create/validate figurine jobs, persist style and posture, track selected concept/model IDs, and expose status to the web app.
- Source-image validation: verify upload ownership, MIME type, size, decode, minimum dimensions, and basic person/face suitability before provider credits are spent.
- 2D concept generation/history: create concept proofs through the AI provider adapter, store multiple concept attempts, and approve/select one concept for 3D generation.
- Meshy provider adapter: submit approved proof/source images to Meshy through a replaceable generated-3D provider interface.
- Meshy task tracking: correlate task submission, polling, webhook events, sanitized audit data, retry/failure states, and consumed credit/cost metadata.
- Asset ingestion: copy returned GLB, STL, optional 3MF, thumbnails, textures, and metadata into user/job-scoped Storage before Meshy retention expires.
- Readiness and gating: summarize model availability, printability warnings, manual-review needs, and checkout/preorder/lead-capture eligibility.
- Creation-credit gating: expose remaining credits, hard-stop provider-spend steps when credits are exhausted, and record reservations/consumption/refunds against each job.
- Editor configuration persistence: save color mode, base style, base texture, base color, sign text/style, print-separately flags, and any supported pose/transform revisions as structured job metadata.

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

### Fulfillment Pipeline

The operator console and post-payment lifecycle are implemented today (not parked), independent of which physical fulfillment provider is eventually chosen above. The stage vocabulary, transition rules, and derivation logic live in a single module mirrored between `apps/functions/src/pipeline.ts` and `apps/web/lib/pipeline.ts` (same copy-in-sync pattern as `figurineWorkflowConfig.ts`); the two files must be kept identical.

**Stage list.** The full pipeline stage vocabulary, in order:

`draft -> generating -> preview_ready -> 2d_approved -> 3d_ready -> paid -> accepted -> in_production -> shipped -> completed`

with side paths off the fulfillment portion of the lifecycle (`paid` and later): `rejected_by_operator` and `refunded`, plus the pre-existing `canceled` and `failed` terminal states available at any point. The narrower `paid | accepted | in_production | shipped | completed | rejected_by_operator | refunded` set is the "fulfillment stage" subset with its own legal-transition table (for example `accepted` can move to `in_production`, `rejected_by_operator`, or `refunded`, but not directly to `shipped`); `canTransition(from, to)` enforces this before any operator/admin mutation is written.

**`orders/{jobId}.fulfillment` object shape:**

- `stage` - one of the fulfillment stages above.
- `productionSubState` - free-form sub-status while `stage: "in_production"` (for example `"printing"`), settable via `operatorUpdateFulfillment`'s `set_production_substate` action.
- `acceptedAt` / `acceptedBy` - set when an operator claims the job via `operatorAcceptJob`.
- `rejection` - populated when an operator rejects a job (also posts a note into the admin-support notes system); cleared on re-queue.
- `tracking` - shipping tracking details set on the `ship` action.
- `refund` - Stripe refund metadata set by `adminRefundJob`.
- `history` - append-only array of `{ stage, at, by }` entries, seeded by the Stripe webhook with the initial `paid` event and appended to on every subsequent transition.

**`pipelineStage` on `jobs/{jobId}`.** The Stripe webhook and every operator/admin fulfillment mutation also stamp a denormalized `pipelineStage` (plus `pipelineUpdatedAt`) directly onto the job document, so the `/admin` and `/operator` work-queue lists can filter and sort on one field instead of joining the order doc per row. `derivePipelineStage` is the single source of truth for reading effective stage: it prefers the stamped `jobs/{jobId}.pipelineStage`, falls back to `orders/{jobId}.fulfillment.stage`, falls back to legacy paid-order detection (orders paid before this pipeline existed), and finally derives a pre-payment stage from job status/product-type fields for jobs that never reached checkout.

**Operator allowlist.** A new `OPERATOR_ALLOWLIST` secret (same shape as `ADMIN_SUPPORT_ALLOWLIST`: UIDs or case-insensitive emails) gates the `/operator` route and its callables, separately from the admin support allowlist. Admins on `ADMIN_SUPPORT_ALLOWLIST` are implicitly treated as operators as well, so the product owner does not need a second allowlist entry to exercise the operator view; a plain operator is not implicitly an admin.

**Required new secrets/env:**

- `OPERATOR_ALLOWLIST` - operator console access, see above.
- `STRIPE_FIGURINE_PAINTED_PRICE_ID` / `STRIPE_FIGURINE_UNPAINTED_PRICE_ID` - Stripe price ids selected by the customer's painted/unpainted figurine choice at checkout; both fall back to hardcoded prices if unset.

## Data Flow

Active figurine target flow:

1. User signs in with a verified email/password account before upload.
2. Web app creates a job id and uploads a source JPG or PNG to `uploads/{uid}/{jobId}/source.{jpg|png}`.
3. Web app calls `createGenerationJob` with `jobId`, `sourceImagePath`, selected figurine style, and selected posture.
4. Function verifies the signed-in user owns the upload path, has verified email, has enough creation credits for the requested step, and creates `jobs/{jobId}` with `status: "generating"`.
5. Function reserves/consumes the needed creation credits, calls the internal AI provider adapter, stores the generated 2D proof under `generated/{uid}/{jobId}/preview.{png|jpg|webp}`, stores non-secret `aiGeneration` metadata, and marks the job `preview_ready` or `failed`.
6. Job `generatedImages` lists the generated proof Storage path so the approval and checkout flow use the real AI output.
7. User selects/approves one concept; the Function records `selectedConceptId`, `approvedImagePath`, and concept approval metadata.
8. Backend dispatches the generated 3D model provider through the figurine workflow service, starting with Meshy if validation passes.
9. Backend tracks task submission, polling/webhook events, and provider status.
10. Backend downloads returned model assets into Storage under a path such as `generated-models/{uid}/{jobId}/{modelId}/`.
11. Job stores model history, selected model ID, provider audit, task id, status, warnings, consumed credits/cost, preview path, and readiness.
12. User reviews the standalone figurine GLB, optionally edits supported color/base/sign settings, and starts checkout only if backend eligibility says the package matches the validated full-color partner fulfillment path.
13. Stripe webhook confirms payment if checkout is enabled.
14. Function sends the locked model manifest and shipping data to manual or automated fulfillment only after the selected fulfillment path is validated.
15. Partner users download the approved package through scoped access, and fulfillment events update the order record.

Parked poster-relief flow: after proof approval, backend dispatches `services/print-file-generator`; the service writes `model.stl`, color package artifacts, filament painting support files, `heightmap.png`, `preview.glb`, and printability metadata; checkout is gated on generated print-file artifacts.

## Firestore Collections

### `users/{uid}`

- `email`
- `displayName`
- `stripeCustomerId`
- `emailVerified`
- `role`
- `creationCreditBalance`
- `quota`
- `acceptedPolicyVersions`
- `createdAt`
- `updatedAt`

### `userCreditLedger/{entryId}`

- `uid`
- `jobId`
- `orderId`
- `type`
- `amount`
- `status`
- `reason`
- `createdBy`
- `createdAt`
- `reconciledJobCostSnapshot`

### `adminAuditEvents/{eventId}`

- `actorUid`
- `actorRole`
- `targetUid`
- `jobId`
- `orderId`
- `eventType`
- `summary`
- `createdAt`

### `printPartnerAssignments/{assignmentId}`

- `partnerUid`
- `partnerId`
- `orderId`
- `jobId`
- `packagePrefix`
- `status`
- `expiresAt`
- `createdAt`

### `partnerDownloadEvents/{eventId}`

- `partnerUid`
- `partnerId`
- `orderId`
- `jobId`
- `artifactPath`
- `createdAt`

### `partnerCostSnapshots/{snapshotId}`

- `partnerId`
- `orderId`
- `jobId`
- `quoteId`
- `estimatedCost`
- `finalInvoiceCost`
- `currency`
- `includesShipping`
- `includesTax`
- `createdAt`

### `jobs/{jobId}`

- `uid`
- `status`
- `productType`
- `selectedStyle`
- `selectedPosture`
- `sourceImagePath`
- `sourceValidation`
- `generatedImages`
- `concepts`
- `selectedConceptId`
- `aiGeneration`
- `approvedImagePath`
- `approvedAt`
- `generatedModelOutputPrefix`
- `generatedModelArtifacts`
- `models`
- `selectedModelId`
- `generatedModelAudit`
- `readinessStatus`
- `checkoutEligibility`
- `editorConfig`
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
- `model_preview_ready`
- `needs_review`
- `printability_warning`
- `print_files_queued`
- `print_files_processing`
- `ready_for_checkout`
- `blocked`
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
- Public creation requires verified email and server-side creation-credit checks before provider-spend steps.
- Admin/operator and print-partner pages must be backed by server-side role checks, scoped queries, and audit logs.
- Print partners can download only assigned approved packages through scoped links; they cannot browse customer Storage paths or full customer profiles.
- Policy acceptance, likeness consent, minor/guardian consent, and refund/support actions should be versioned or logged so future disputes are reviewable.

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
