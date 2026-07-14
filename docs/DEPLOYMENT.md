# Deployment Notes

## Local Tools

Already detected locally:

- Node.js 22
- npm
- Firebase CLI
- Google Cloud CLI (`gcloud`)

Google Cloud CLI status:

- Existing user install repaired for this session at `C:\Users\Eliud\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd`.
- Active project set to `gen-lang-client-0675309660`.
- Application Default Credentials were created on 2026-04-26 for local Google client libraries.

Browser Use dashboard automation currently needs a newer Node runtime than the one resolved by `node_repl`; use Cloudflare API calls until Node is upgraded or `NODE_REPL_NODE_PATH` points to Node `>=22.22.0`.

## Firebase

Local development uses the existing shared Firebase/GCP project through the
checked-in `.firebaserc` aliases:

```powershell
firebase use dev
```

Project strategy:

- `dev` and `default`: `gen-lang-client-0675309660` for local development, current MVP testing, and the temporary noindexed Railway product-app candidate.
- `staging`: optional until a persistent pre-production data/identity boundary is needed; do not create it only to duplicate the current dev-backed candidate.
- `production`: create a separate dedicated Firebase/GCP project before branded public traffic or live fulfillment.

Dev project Firebase Storage:

- Default bucket: `gen-lang-client-0675309660.firebasestorage.app`
- Location: `US-CENTRAL1`
- Storage class: `STANDARD`

The Railway service name and its `production` environment label do not make the shared Firebase project production. Do not promote or send public traffic to the candidate as a production app while it still uses `gen-lang-client-0675309660`.

Recommended before branded public traffic:

- Create the dedicated staging and production Firebase/GCP projects.
- Add `staging` and `production` aliases to `.firebaserc`.
- Enable Firestore.
- Enable Firebase Auth.
- Enable Email/Password sign-in for named test accounts.
- Do not enable Anonymous sign-in for the public customer path; upload, job creation, proof approval, scene preview, base naming, and checkout require a non-anonymous account.
- Enable Cloud Storage.
- Configure Firebase Functions 2nd gen.
- Add secrets with Firebase Functions secrets or Google Secret Manager.

## Web App Local Config

The customer app now initializes Firebase directly in the browser. Add these public web app values to `apps/web/.env.local` before testing sign-in or upload:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=false`
- `NEXT_PUBLIC_USE_FIREBASE_FUNCTIONS_EMULATOR=false`

The Railway product-app service uses those eight values. It does not need backend/provider credentials or a browser Stripe secret. Checkout creation stays in the Firebase callable Function.

For full local emulator testing, install JDK 21+, set `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true`, and run Firebase emulators for Auth, Functions, Firestore, and Storage:

```powershell
npm run firebase:emulators:full
```

The script builds Functions first, runs `scripts/firebase/check-emulator-java.mjs`, and then starts the configured emulator suite. Use `npm run firebase:emulators:full:export` when you want Auth, Firestore, and Storage emulator state imported/exported under `.codex-run/firebase-emulators`. Leave `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=false` when using the shared Firebase project.

For customer-flow testing against the shared Firebase project, a function-only local path is also supported:

```powershell
npm run firebase:emulators:functions
```

Set `NEXT_PUBLIC_USE_FIREBASE_FUNCTIONS_EMULATOR=true` for the web app when using that path. This keeps Auth, Firestore, and Storage pointed at the configured Firebase project while callable Functions run locally. On this machine, JDK 21+ is installed, new terminals resolve `java -version` to Java 21, and the full emulator suite preflight passes.

Source uploads are written by the browser to `uploads/{uid}/{jobId}/source.{jpg|png}`. The `createGenerationJob` callable Function now requires the same `jobId` and source path, verifies that they belong to the authenticated user, reads `adminConfig/figurineWorkflow` for proof/style settings, creates `jobs/{jobId}` with `status: "generating"`, and calls the server-side Vertex/Gemini provider adapter. Current style contracts live in `docs/Workflows/figurine-style-workflow-contracts.md`: some styles store Vertex/Gemini proof images directly, while Creative Lab concept-gate styles store one Meshy prototype concept for review. The `/admin` page edits workflow config through callable Functions and uploads per-style reference images under `admin/workflow-style-references/{styleId}/{imageId}.{jpg|png}`; admin/support access is gated by custom claims. The `approveGeneratedImage` callable records the selected figurine concept and unlocks normal checkout; Stripe payment then queues the post-payment `figurineBuild` provider path.

## Firebase Rules Deployment

`firebase.json` deploys Firestore rules from `infra/firebase/firestore.rules`, Firestore indexes from `infra/firebase/firestore.indexes.json`, and Storage rules from `infra/firebase/storage.rules`.

Use the root scripts for dev rules deployment:

```powershell
npm run firebase:deploy:firestore-rules:dry-run
npm run firebase:deploy:firestore-rules:dev
npm run firebase:deploy:storage-rules:dry-run
npm run firebase:deploy:storage-rules:dev
npm run firebase:deploy:rules:dry-run
npm run firebase:deploy:rules:dev
```

Storage rules control who can read and write objects. Admin reference-image access under `admin/workflow-style-references/` requires the admin custom claim and keeps JPG/PNG plus 5 MB limits. Browser-based media/GLB reads also need bucket CORS for every deployed web origin:

```powershell
npm run firebase:deploy:storage-cors:dev
```

The Firestore and Storage rules dry-run successfully for the `dev` project, and both rule sets have been deployed to `dev`.

As of 2026-07-13, the tracked CORS policy and live dev bucket include `https://3dprintposters-production.up.railway.app` alongside the local and existing branded origins.

The `:dev` scripts target the `.firebaserc` `dev` alias. For staging or production, create dedicated Firebase projects and aliases first, then run the equivalent `firebase deploy --only firestore:rules,storage --project staging` or `--project production` command intentionally.

## AI Provider Keys

Required local variables for current AI-provider experiments:

- `GOOGLE_API_KEY`
- `GEMINI_API_KEY`
- `VERTEX_API_KEY`
- `VERTEX_PROJECT`
- `VERTEX_LOCATION`
- `VERTEX_GCS_BUCKET`
- `VERTEX_IMAGE_MODEL` for generated proofs; defaults to `gemini-3-pro-image`
- `MESHY_API_KEY` for the figurine provider evaluation path. Keep it in local secrets or server-only runtime secrets; never expose it to the browser.
- `HI3D_ACCESS_KEY` / `HI3D_SECRET_KEY` for the Hi3D (Hitem3D v2.1) direct Multi-Image-to-3D provider. Stored in root `.env` locally, `apps/functions/.secret.local` for emulator runs, and Firebase Secret Manager (set 2026-07-08) for deployed Functions. The provider exchanges them for a Bearer token at `POST /open-api/v1/auth/token`; never expose them to the browser.
- `MESHY_WEBHOOK_URL` should point to the active Cloudflare receiver at `https://api.3dprintyou.com/webhooks/meshy`. `MESHY_WEBHOOK_SECRET` is stored locally in root `.env` and was uploaded as an encrypted Cloudflare Worker secret on 2026-05-23. A real Meshy delivery confirmed the secret arrives in `x-meshy-api-webhook-secret-key`, and the receiver now rejects webhook POSTs without the matching secret. Meshy webhook creation is currently configured in the Meshy web app API settings page, not through a documented REST endpoint.

Firebase CLI automatically loads `apps/functions/.env` during deploy as plain Cloud Run environment variables. Do not put deployed Functions runtime config there. Values declared with `defineSecret` belong in ignored `apps/functions/.secret.local` for local emulator runs; use `apps/functions/.secret.local.example` as the shape reference. For deployed Functions, configure the same names as Firebase Functions secrets / Secret Manager values. Without `.secret.local`, the emulator may try Google Secret Manager and log missing-secret warnings before local fallback behavior.

Meshy notes:

- The API key is sent as an `Authorization: Bearer ...` header from server code only.
- Meshy API tasks are asynchronous; a create call returns a task id, then the app either polls task status or receives webhook updates.
- Meshy webhook deliveries include `x-meshy-api-webhook-secret-key` and `x-meshy-api-webhook-user-id`; never log either value.
- Non-enterprise API-generated assets are retained by Meshy for a maximum of 3 days, so any accepted GLB/STL/3MF assets should be downloaded into Firebase Storage promptly.
- Webhooks require an HTTPS URL. The Cloudflare Worker endpoint is live at `https://api.3dprintyou.com/webhooks/meshy` and returns `202 Accepted` for valid JSON POSTs. The default `workers.dev` trigger is disabled so the branded custom domain is the intended public endpoint.

Verification status on 2026-04-26:

- `GOOGLE_API_KEY` and `GEMINI_API_KEY` are present in the root `.env`, currently match each other, and both completed a live Gemini Developer API `gemini-2.5-flash` request.
- `VERTEX_API_KEY` is present in the root `.env`, is separate from the Google/Gemini key, and completed a live Vertex AI Gemini API `gemini-2.5-flash` request.
- The Functions direct provider uses the Vertex AI express-mode `generateContent` endpoint with `responseModalities: ["TEXT", "IMAGE"]` and `VERTEX_IMAGE_MODEL=gemini-3-pro-image` unless overridden.
- `VERTEX_PROJECT`, `VERTEX_LOCATION`, and `VERTEX_GCS_BUCKET` are present locally.
- `gcloud auth application-default login --project=gen-lang-client-0675309660` completed successfully.
- Vertex AI, Gemini API, and Cloud Storage APIs are enabled for the configured project.
- The configured `VERTEX_GCS_BUCKET` was reachable with `gcloud storage buckets describe`.

## Web Hosting

Current public SEO launch, verified 2026-07-05:

- `https://3dprintyou.com` is live as a standalone static coming-soon site deployed from `E:\PROJECTS\3DPrintyou` / `KielRN/3dprintyou` to Railway.
- The standalone repo intentionally has no Firebase, Functions, upload flow, admin/operator/job routes, Stripe, Meshy calls, API routes, service worker, or print-file generation.
- Railway builds with `npm run build`, starts with `npm start -- -p $PORT`, and uses `/` as the healthcheck path.
- Cloudflare apex DNS is proxied to Railway with `3dprintyou.com` CNAME -> `nr47nw9p.up.railway.app`; Railway verification TXT is present.
- `https://3dprintyou.com/`, `/robots.txt`, and `/sitemap.xml` returned successful responses on 2026-07-05.
- `www.3dprintyou.com` has a proxied CNAME to `3dprintyou.com`, but `https://www.3dprintyou.com` returned `404` on 2026-07-05. Finish the Railway `www` custom domain or create a Cloudflare redirect to the apex before treating `www` as live.
- Keep `api.3dprintyou.com` unchanged; it remains the Cloudflare Worker custom domain for the Meshy webhook receiver.

Current full product-app candidate, verified 2026-07-13:

- URL: `https://3dprintposters-production.up.railway.app`.
- Railway placement: service `3dprintposters` in the same Railway project and `production` environment as the standalone `3dprintyou` coming-soon service. The services remain separate and deploy from separate GitHub repositories.
- Source: `KielRN/3dprintposters`, branch `main`, repository root.
- Delivery: pushes to `main` automatically trigger a Railway deployment for this service.
- Build: Railpack runs root `npm run build`; the web workspace runs `next build` plus `apps/web/scripts/prepare-standalone.mjs` to copy `public/` and `.next/static/` into the traced standalone bundle.
- Start: `HOSTNAME=0.0.0.0 npm start`; the root start script launches `apps/web/.next/standalone/apps/web/server.js` on Railway's injected `PORT`.
- Healthcheck: `/api/health`, 120-second timeout. The route is dynamic, returns `{ "status": "ok" }`, and disables caching.
- Indexing: `apps/web/next.config.ts` and app metadata send `noindex, nofollow, noarchive` for the temporary candidate.
- Runtime boundary: the browser app runs on Railway; Firebase Cloud Functions 2nd gen, Auth, Firestore, Storage, callable checkout, webhooks, provider orchestration, and their secrets remain in Firebase/GCP.
- Firebase integration: the Railway hostname is authorized in Firebase Auth and Storage CORS. Firebase Functions secret `PUBLIC_APP_URL` points checkout return navigation at the Railway origin; only `createCheckoutSession` needed redeployment for that change.

The Railway environment label is not a production-readiness claim. This candidate still uses the shared dev Firebase project and must remain unadvertised/noindexed until the release gates below are complete.

Release gates before branded public traffic:

- Run a full browser flow on the Railway origin: account creation/sign-in, upload, proof generation/approval, page-4 scene/claim, checkout creation and cancel/success return, order display, and admin/operator visibility. Do not treat a healthcheck alone as product validation.
- Create the dedicated production Firebase/GCP project and configure matching Auth, Firestore, Storage, rules, indexes, Functions, secrets, and public web values. Create a separate staging project only when the team needs a durable pre-production data/identity boundary.
- Add production monitoring, provider-spend/abuse controls, policy gates, and fulfillment readiness before sending public traffic.
- Choose whether the product app should use a branded subdomain such as `app.3dprintyou.com` or replace/redirect the apex after the coming-soon period. Preserve the noindex guard on a thin app subdomain until the SEO/canonical strategy intentionally changes.
- Keep `api.3dprintyou.com` on the existing Cloudflare Worker webhook surface and keep `3dprintposters.com` available for the parked poster-relief line or redirect strategy.

`apps/web/apphosting.yaml` remains historical Firebase App Hosting configuration and is not the active Railway deployment manifest. `railway.toml` at the repository root is the current web-hosting source of truth.

## Cloud Run 3D Conversion Service

Build and deploy `services/print-file-generator` with `gcloud` after the print file generation workflow is implemented. The older `services/stl-converter` scaffold should be treated as a temporary STL-only compatibility boundary.

The service should be private at first. Firebase Functions can call it with service-to-service auth.

## Stripe

Use Stripe test mode until the full order and fulfillment state machine is proven.

Required secrets:

- `VERTEX_API_KEY`
- `MESHY_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Webhook events to handle first:

- `checkout.session.completed`
- `payment_intent.payment_failed`
- `checkout.session.expired`

## Cloudflare

Keep DNS and WAF simple for the first launch:

- Preferred launch domain for the figurine pivot: `3dprintyou.com`.
- Current public apex launch: `3dprintyou.com` is proxied through Cloudflare to the Railway coming-soon site at `nr47nw9p.up.railway.app`.
- `www.3dprintyou.com` has DNS but still needs the Railway custom-domain or Cloudflare redirect follow-up because it returned `404` on 2026-07-05.
- `api.3dprintyou.com` must remain on the `3dprintyou-meshy-webhook` Worker/custom-domain surface.
- Existing poster-relief domain: `3dprintposters.com`.
- Cloudflare account API token access was verified again on 2026-05-23 for account token verification and zone lookup. The same token did not have DNS record or Worker route read access, so webhook receiver setup needs a broader least-privilege token or dashboard access.
- Store local Cloudflare credentials only in environment variables such as `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_ZONE_NAME`.
- AI Gateway is a planned foundation, but no project gateway or provider is configured yet.
- SSL/TLS mode set according to host recommendation.
- Add basic bot/rate limiting only after checkout/upload flows are stable.
