# Cloudflare Notes

Cloudflare owns `3dprintposters.com`. The exact DNS records depend on the selected web host.

## Current Status

- Cloudflare account ID: `778c1ab69c11e349c591073496bcb4a9`.
- Cloudflare account API token access was verified on 2026-04-26.
- API checks confirmed account token verification, AI Gateway list access, and zone lookup for `3dprintposters.com`.
- AI Gateway is planned as the AI routing and observability layer, but no project gateway or provider is configured yet.
- Keep token values out of repo files. Use local environment variables such as `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_ZONE_NAME`.

## First Decisions

- Choose hosting target: Firebase App Hosting, Cloud Run, or Vercel.
- Decide apex behavior: serve app at apex or redirect apex to `www`.
- Decide environment subdomains:
  - `staging.3dprintposters.com`
  - `app.3dprintposters.com`
  - `www.3dprintposters.com`

## AI Gateway Checklist

- [ ] Create project gateway after provider/model choice.
- [ ] Choose first provider and model strategy.
- [ ] Decide whether gateway authentication stays on for all app calls.
- [ ] Wire server-side AI calls through the gateway only after provider credentials are stored securely.

## DNS Checklist

- [ ] Add production host record.
- [ ] Add staging host record.
- [ ] Confirm SSL/TLS mode.
- [ ] Confirm redirect rules.
- [ ] Confirm webhook endpoints are reachable.
- [ ] Add rate limits for upload and checkout paths after MVP testing.
