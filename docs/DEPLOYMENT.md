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

Use the shared project carefully:

```powershell
firebase use gen-lang-client-0675309660
```

Recommended before production:

- Create staging and production project aliases.
- Enable Firestore.
- Enable Firebase Auth.
- Enable Cloud Storage.
- Configure Firebase Functions 2nd gen.
- Add secrets with Firebase Functions secrets or Google Secret Manager.

## AI Provider Keys

Required local variables for current AI-provider experiments:

- `GOOGLE_API_KEY`
- `GEMINI_API_KEY`
- `VERTEX_API_KEY`
- `VERTEX_PROJECT`
- `VERTEX_LOCATION`
- `VERTEX_GCS_BUCKET`

Verification status on 2026-04-26:

- `GOOGLE_API_KEY` and `GEMINI_API_KEY` are present in the root `.env`, currently match each other, and both completed a live Gemini Developer API `gemini-2.5-flash` request.
- `VERTEX_API_KEY` is present in the root `.env`, is separate from the Google/Gemini key, and completed a live Vertex AI Gemini API `gemini-2.5-flash` request.
- `VERTEX_PROJECT`, `VERTEX_LOCATION`, and `VERTEX_GCS_BUCKET` are present locally.
- `gcloud auth application-default login --project=gen-lang-client-0675309660` completed successfully.
- Vertex AI, Gemini API, and Cloud Storage APIs are enabled for the configured project.
- The configured `VERTEX_GCS_BUCKET` was reachable with `gcloud storage buckets describe`.

## Web Hosting

Recommended first deployment target:

- Firebase App Hosting or Cloud Run for `apps/web`.

Cloudflare should point `3dprintposters.com` to the selected hosting target.

## Cloud Run 3D Conversion Service

Build and deploy `services/print-file-generator` with `gcloud` after the print file generation workflow is implemented. The older `services/stl-converter` scaffold should be treated as a temporary STL-only compatibility boundary.

The service should be private at first. Firebase Functions can call it with service-to-service auth.

## Stripe

Use Stripe test mode until the full order and fulfillment state machine is proven.

Required secrets:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Webhook events to handle first:

- `checkout.session.completed`
- `payment_intent.payment_failed`
- `checkout.session.expired`

## Cloudflare

Keep DNS and WAF simple for the first launch:

- Domain: `3dprintposters.com`.
- Cloudflare account API token access was verified on 2026-04-26 for account token verification, AI Gateway list access, and zone lookup.
- Store local Cloudflare credentials only in environment variables such as `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_ZONE_NAME`.
- AI Gateway is a planned foundation, but no project gateway or provider is configured yet.
- `www` CNAME to hosting target.
- Apex domain redirect or CNAME flattening, depending on selected host.
- SSL/TLS mode set according to host recommendation.
- Add basic bot/rate limiting only after checkout/upload flows are stable.
