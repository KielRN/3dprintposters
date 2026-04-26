# Deployment Notes

## Local Tools

Already detected locally:

- Node.js 22
- npm
- Firebase CLI

Not detected on PATH:

- `gcloud`

Install or repair Google Cloud CLI before deploying Cloud Run services or managing GCP resources from this machine.

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

## Web Hosting

Recommended first deployment target:

- Firebase App Hosting or Cloud Run for `apps/web`.

Cloudflare should point `3dprintposters.com` to the selected hosting target.

## Cloud Run STL Service

Build and deploy `services/stl-converter` only after `gcloud` is available.

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
