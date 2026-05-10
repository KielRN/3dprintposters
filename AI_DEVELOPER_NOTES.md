# 3DPrintPosters - AI Developer Notes

Last updated: 2026-05-09

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
6. User approves one generated proof.
7. Print file generator converts the approved design into a 5in x 7in baseline artifact bundle with `model.stl`, `preview.glb`, `heightmap.png`, `metadata.json`, and printability output.
8. User inspects the approved proof, generated heightmap, and generated GLB relief side by side on the job page.
9. User checks out only after print-file artifacts are generated.
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
- The direct Vertex/Gemini adapter now reads the uploaded source image, sends it to the Vertex AI express-mode `generateContent` endpoint with text and image response modalities, and stores the returned proof under `generated/{uid}/{jobId}/preview.{png|jpg|webp}`.
- `approveGeneratedImage` sets `approvedImagePath`, calls `PRINT_FILE_GENERATOR_URL`, generates baseline print-file artifacts under `print-files/{uid}/{jobId}`, and persists `printFileStatus`, `printFileOutputPrefix`, `printFileArtifacts`, and `printability` on the job.
- `createCheckoutSession` should reject jobs that do not have `status: "approved"`, an `approvedImagePath`, `printFileStatus: "generated"`, and generated `modelStl`/`previewGlb` paths.
- For the current one-order-per-job MVP path, `createCheckoutSession` uses `orders/{jobId}` as the deterministic order document and sends a Stripe idempotency key based on user id, job id, approved proof path, and checkout attempt.
- If print file generation needs Python, native libraries, or longer CPU time, use Cloud Run for that specific service instead of Cloud Functions.
- Keep Cloud Functions for orchestration, webhooks, auth checks, Firestore writes, and short API calls.
- Accepted print-file generator decision: keep `services/print-file-generator` as the production FastAPI/Cloud Run boundary and selectively extract core image, heightmap, STL, metadata, color, and test concepts from `E:\PROJECTS\print-file-generator`.
- Do not vendor the standalone generator's Flask routes, SQLite local project database, browser session state, local CLI control flow, TD1 hardware code, or current open-surface mesh topology into production.
- The current print-file implementation slice is deterministic closed relief generation: validated image input up to 4,000,000 decoded pixels by default, 5:7 crop/pad, posterized luminance heightmap fallback with smoothing and softened edge detail, closed 127mm x 177.8mm mesh with top surface/base/sidewalls, binary STL, neutral-material GLB preview, heightmap PNG, metadata JSON, and printability checks.
- The five-experiment heightmap research cycle is complete as of 2026-05-09. See [research/HEIGHTMAP_EXPERIMENTS_FINAL_EVALUATION.md](research/HEIGHTMAP_EXPERIMENTS_FINAL_EVALUATION.md) for the cycle summary and [research/HEIGHTMAP_FINAL_EVALUATION_REVIEW.md](research/HEIGHTMAP_FINAL_EVALUATION_REVIEW.md) for the active production-build plan, calibrated quality gates, and decisions made along the way.
- Experiment 1 (deterministic) outcome: `posterized_luminance`, `continuous_luminance`, and `lithophane_baseline` are kept as the last-resort safety net for when every API-backed provider in the chain fails. They are no longer treated as the production target. `posterized_luminance` remains the default checkout fallback today; the deterministic-fallback choice between posterized and lithophane will be settled while building the hybrid (lithophane preserved more facial identity in the contact sheet but its background-noise behavior is not yet quantified against the gates).
- Experiments 2 and 3 outcome: monocular depth (`depth_anything_v2_small`) and the bas-relief transform are wired. The bas-relief transform was replaced 2026-05-09 with guided-filter detail/base separation; the previous gradient-attenuation transform was structurally a no-op. New transform compresses global range while preserving local detail, runs in ~5 ms on a 200×280 heightmap, and uses pure numpy (no opencv-contrib or kornia dependency).
- Experiment 4 outcome: `segformer_masked_depth` (renamed from `sam_masked_depth` on 2026-05-09 to match the actual SegFormer/ADE20K-via-HF-Inference implementation) passes all calibrated quality gates after the bas-relief swap and is the foundation for the next hybrid provider. Historical `sam_masked_depth/` artifacts under `.tmp/experiments/experiment_4/` are retained for audit.
- Experiment 5 outcome: full image-to-3D reconstruction (TripoSR class) is rejected for poster relief — the model builds standalone 360° figurines, not image-plane depth. The rejection extends to Stable Fast 3D, TRELLIS, SAM 3D Objects, and TriplaneGaussian. Revisit only if the product expands to standalone figurines.
- Production provider registry: each AI role lives behind a typed `*Provider` Protocol with a `*Chain` that does `ProviderError` failover and writes a `ProviderAudit` (succeeded provider, attempted chain, fallback reason). Scaffolding under [services/print-file-generator/app/providers/](services/print-file-generator/app/providers/). Roles wired today: `SubjectSegmentationProvider` (concrete: HF Inference SegFormer; stubs: Vertex Vision, Cloudflare gateway) and `MonocularDepthProvider` (concrete: local Depth Anything V2 — dev-only; stubs: HF Inference Depth Anything, Vertex). Refactor existing free helpers in `app/depth.py` are thin shims over the chains.
- Quality gates: per-metric pure functions in [services/print-file-generator/app/quality_gates.py](services/print-file-generator/app/quality_gates.py); pytest harness at [tests/test_quality_gates.py](services/print-file-generator/tests/test_quality_gates.py); calibration view at `scripts/run_quality_gates.py`. Calibrated thresholds (in `research/HEIGHTMAP_FINAL_EVALUATION_REVIEW.md` item 3) require background flatness ≤ 0.25 mm as the primary discriminator and portrait face detection to reject TripoSR-class output. Composition SSIM is dropped pending replacement with a relief-appropriate metric.
- The job page now acts as the first quality-control surface for relief output: it shows the approved proof, generated `heightmap.png`, `preview.glb`, printability warnings, and download links for `model.stl`, `preview.glb`, `heightmap.png`, and `metadata.json`.
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

For local end-to-end testing with live Vertex/Gemini and real GLB/STL artifacts, run the print-file generator too:

```powershell
cd services/print-file-generator
uvicorn app.main:app --reload --port 8089
```

Then set `PRINT_FILE_GENERATOR_URL=http://127.0.0.1:8089` in `apps/functions/.env`, restart the Functions emulator, and keep `AI_PROVIDER_ROUTE=vertex-gemini-direct`.

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

- ~~Which AI model creates the printable source image, segmentation, or heightmap.~~ Settled 2026-05-09: poster proof = Vertex/Gemini (`gemini-2.5-flash-image`); subject segmentation = SegFormer/ADE20K via HF Inference (Vertex Vision and Cloudflare-gatewayed paths stubbed for follow-up); monocular depth = Depth Anything V2 Small (Vertex/HF-Inference-hosted/Cloudflare-gatewayed paths stubbed). Each role lives behind the `app/providers/` chain with audit + failover. Image-to-3D (TripoSR class) rejected.
- ~~Whether and when Cloudflare AI Gateway should be added after direct Vertex/Gemini MVP integration.~~ Settled 2026-05-09: Cloudflare AI Gateway is the unified observability/rate-limit/fallback pane for the provider registry, not an MVP-only afterthought. Wire roles through it as gateway-served implementations land.
- Whether users can edit depth/relief settings before checkout.
- Whether a source-photo proof fallback is needed for provider outages or if generation failures should stay hard failures.
- Whether native iOS/Android packaging is needed after the web MVP.

## Production Build Tasks (deferred to hybrid build cycle)

Tracked in [research/HEIGHTMAP_FINAL_EVALUATION_REVIEW.md](research/HEIGHTMAP_FINAL_EVALUATION_REVIEW.md) Net Position section:

- Build the hybrid `masked_depth_detail_blend` provider that combines semantic depth, subject masking, in-mask detail blend (lithophane- or posterized-sourced — settles the deterministic fallback default), and the new guided-filter compression.
- Implement `VertexSegmentationProvider`, `HfInferenceDepthAnythingProvider`, `VertexDepthProvider`, `CloudflareGatewaySegmentationProvider`. Stubs exist and raise `ProviderError` cleanly so chains fall through.
- Wire `ProviderAudit` into per-job `metadata.json` and the Firestore audit document.
- Cache provider responses by content hash in Firebase Storage (`cache/{role}/{provider_id}/{model_version}/{sha256}.{ext}`); TTL infinite, invalidated only by registry `model_version` change.
- Replace the dropped composition-preservation gate with a relief-appropriate metric (gradient-magnitude correlation or edge-map IoU).
- Surface segmentation status (`ok` / `empty_mask` / `full_image_mask` / `api_failure`) into job metadata.
- Declare implicit deps (`requests`, `python-dotenv`) in `services/print-file-generator/pyproject.toml`.

## Developer Cautions

- The existing `gen-lang-client-0675309660` project is shared with other work. Use clear app names, service names, Firestore collection prefixes if needed, and separate Storage paths.
- Keep API keys and webhook secrets in Secret Manager or Firebase Functions secrets.
- Generated images and STL files can become expensive. Add quotas, cleanup jobs, and lifecycle policies early.
- Validate file size, MIME type, image dimensions, STL size, texture package size, and 5x7 physical dimensions before accepting or fulfilling a job.
- Add audit logging for payment and fulfillment state transitions.
