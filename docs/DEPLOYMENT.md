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

- `dev` and `default`: `gen-lang-client-0675309660` for local development and current MVP testing.
- `staging`: create a dedicated Firebase/GCP project before the first public staging deploy.
- `production`: create a separate dedicated Firebase/GCP project before launch.

Dev project Firebase Storage:

- Default bucket: `gen-lang-client-0675309660.firebasestorage.app`
- Location: `US-CENTRAL1`
- Storage class: `STANDARD`

Do not use the shared `gen-lang-client-0675309660` project for public staging or production traffic.

Recommended before public staging:

- Create the dedicated staging and production Firebase/GCP projects.
- Add `staging` and `production` aliases to `.firebaserc`.
- Enable Firestore.
- Enable Firebase Auth.
- Enable Email/Password sign-in for named test accounts.
- Enable Anonymous sign-in if the guest-session MVP path should be available.
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

Source uploads are written by the browser to `uploads/{uid}/{jobId}/source.{jpg|png}`. The `createGenerationJob` callable Function now requires the same `jobId` and source path, verifies that they belong to the authenticated user, creates `jobs/{jobId}` with `status: "generating"`, calls the server-side Vertex/Gemini provider adapter, stores the generated proof under `generated/{uid}/{jobId}/preview.{png|jpg|webp}`, and marks the job `preview_ready` or `failed`. The `approveGeneratedImage` callable records `approvedImagePath`, and `createCheckoutSession` requires that approval before creating the deterministic `orders/{jobId}` checkout record.

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

Storage rules control who can read and write objects. Browser-based GLB previews also need bucket CORS so Three.js can fetch `preview.glb` from the web app origin:

```powershell
npm run firebase:deploy:storage-cors:dev
```

The Firestore and Storage rules dry-run successfully for the `dev` project, and both rule sets have been deployed to `dev`.

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
- `MESHY_WEBHOOK_URL` should point to the active Cloudflare receiver at `https://api.3dprintyou.com/webhooks/meshy`. `MESHY_WEBHOOK_SECRET` is stored locally in root `.env` and was uploaded as an encrypted Cloudflare Worker secret on 2026-05-23. A real Meshy delivery confirmed the secret arrives in `x-meshy-api-webhook-secret-key`, and the receiver now rejects webhook POSTs without the matching secret. Meshy webhook creation is currently configured in the Meshy web app API settings page, not through a documented REST endpoint.

For local Functions emulator runs, place non-secret runtime config in `apps/functions/.env`. Values declared with `defineSecret` belong in ignored `apps/functions/.secret.local`; use `apps/functions/.secret.local.example` as the shape reference. Without `.secret.local`, the emulator may try Google Secret Manager and log missing-secret warnings before local fallback behavior. For deployed Functions, configure declared secrets as Firebase Functions secrets.

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

Chosen first deployment target: Firebase App Hosting for the Next.js customer app in `apps/web`.

App Hosting setup plan:

- Create a dedicated staging Firebase/GCP project, then create a staging App Hosting backend.
- Use `apps/web` as the App Hosting app root directory.
- Use `us-central1` unless a closer customer or fulfillment reason appears.
- Suggested staging backend name: `3dprintposters-web-staging`.
- Suggested production backend name: `3dprintposters-web-production`.
- Keep automatic rollouts enabled for staging and disabled or manually controlled for production until launch.
- Keep `apps/web/apphosting.yaml` checked in for Cloud Run runtime sizing and non-secret environment defaults.

Official setup references:

- [Firebase App Hosting monorepo setup](https://firebase.google.com/docs/app-hosting/monorepos): choose the app root directory inside the repository, here `apps/web`.
- [Firebase App Hosting configuration](https://firebase.google.com/docs/app-hosting/configure): `apphosting.yaml` belongs in the app root and can define runtime settings and non-secret environment defaults.

App Hosting environment values to set on each backend:

- Public Firebase web config values from the matching staging or production Firebase project.
- `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=false`.
- `NEXT_PUBLIC_USE_FIREBASE_FUNCTIONS_EMULATOR=false`.
- Server-only values and secrets through Firebase App Hosting environment settings or Secret Manager.

Cloudflare DNS plan:

- Preferred figurine pivot domain: `3dprintyou.com`.
- Current local Cloudflare credentials are only partially sufficient: on 2026-05-23 the account-scoped token verified successfully and both project zones were visible, but zone DNS record reads and Worker route reads returned `403`.
- First public test: point a staging hostname such as `staging.3dprintyou.com` to the staging App Hosting backend domain generated by Firebase.
- Launch: point `www.3dprintyou.com` to the production App Hosting backend domain generated by Firebase.
- Apex `3dprintyou.com`: redirect to `www` or use Cloudflare flattening according to the final App Hosting custom-domain instructions.
- Keep `3dprintposters.com` available for the parked poster-relief line or redirect strategy.

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
- Existing poster-relief domain: `3dprintposters.com`.
- Cloudflare account API token access was verified again on 2026-05-23 for account token verification and zone lookup. The same token did not have DNS record or Worker route read access, so webhook receiver setup needs a broader least-privilege token or dashboard access.
- Store local Cloudflare credentials only in environment variables such as `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_ZONE_NAME`.
- AI Gateway is a planned foundation, but no project gateway or provider is configured yet.
- `www` CNAME to hosting target.
- Apex domain redirect or CNAME flattening, depending on selected host.
- SSL/TLS mode set according to host recommendation.
- Add basic bot/rate limiting only after checkout/upload flows are stable.
