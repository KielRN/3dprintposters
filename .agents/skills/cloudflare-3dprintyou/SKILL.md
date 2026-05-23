---
name: cloudflare-3dprintyou
description: Cloudflare operations for the 3DPrintPosters / 3DPrintYou project. Use when Codex needs to verify Cloudflare API token access, inspect or update zones, DNS records, Workers, routes, custom domains, AI Gateway, or webhook endpoints for 3dprintyou.com or 3dprintposters.com, especially Meshy webhook receiver setup.
---

# Cloudflare 3DPrintYou

## Overview

Use this skill for project-specific Cloudflare work around `3dprintyou.com`, `3dprintposters.com`, and the Meshy webhook receiver. Pair it with the bundled Cloudflare plugin skill or official Cloudflare docs whenever current API syntax, limits, or product behavior matters.

## Guardrails

- Never print, copy, summarize, or commit secret values from `.env`, Cloudflare, Meshy, Stripe, Firebase, or any dashboard.
- Read local `.env` only to confirm variable names, presence, token shape, and non-secret identifiers. Do not echo full values.
- Prefer read-only checks first: verify token, list matching zones, inspect DNS records, inspect Worker scripts/routes/custom domains.
- Before mutating Cloudflare DNS, Workers, routes, secrets, or account settings, state the exact intended change in a short update. Ask the user first when the change could disrupt live traffic.
- Use `3dprintyou.com` as the preferred figurine/customer-acquisition domain. Keep `3dprintposters.com` available for parked poster-relief work or later redirects.
- Update project docs and human tasks after changing Cloudflare behavior or discovering a durable setup fact.

## Current Project Facts

- Cloudflare account id: `778c1ab69c11e349c591073496bcb4a9`.
- `3dprintyou.com` zone id: `2ee750c1c76f7e569184cbeacaa6787d`; status was active on 2026-05-23.
- `3dprintposters.com` zone id: `b4f2622ab29b7ea445ecca0ba554ff63`; status was active on 2026-05-23.
- The local token in `.env` may be an account-scoped `cfat_` token. Verify it with the account token endpoint, not the user token endpoint:

```text
GET https://api.cloudflare.com/client/v4/accounts/{account_id}/tokens/verify
```

Do not treat a `401` from `/user/tokens/verify` as proof that an account-scoped token is invalid.

## Workflow

1. Read the repo operating rules first: `AGENTS.md`, `.env.example`, and any current deployment docs relevant to the request.
2. Load `references/project-cloudflare.md` when commands, endpoint patterns, or known zone ids are needed.
3. Verify token access with the account-scoped endpoint and report only success/status/id-present, never the token.
4. Inspect the live target before mutating:
   - Matching zones for `3dprintyou.com` and `3dprintposters.com`.
   - DNS records for `api`, `www`, apex, and staging hostnames.
   - Existing Worker scripts, routes, custom domains, and secrets relevant to the task.
5. For Meshy webhook work, prefer a Cloudflare-backed HTTPS endpoint:

```text
https://api.3dprintyou.com/webhooks/meshy
```

Create or route a Worker only after checking whether `api.3dprintyou.com` already exists and whether an existing Worker should be reused. Store webhook signing material as a Cloudflare Worker secret or a backend secret, never in source.

6. If the request requires Meshy dashboard configuration, create the Cloudflare receiver first, then hand the exact webhook URL to Elliot. Meshy webhook creation is currently documented as a dashboard action rather than a documented public REST endpoint.
7. After changes, verify with a low-risk request:
   - DNS resolves through Cloudflare if DNS changed.
   - The Worker route returns an expected status for `GET` health checks.
   - The webhook path accepts only the expected method/signature shape.
8. Update `CHECKLIST.md`, `docs/DEPLOYMENT.md`, `docs/ARCHITECTURE.md`, `research/FIGURINE_PROVIDER_RESEARCH.md`, and the open Meshy human task when the setup state changes.

## References

- `references/project-cloudflare.md`: project-specific Cloudflare command patterns, known ids, and Meshy webhook receiver notes.
