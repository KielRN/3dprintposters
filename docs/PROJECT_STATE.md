# Project State

## Public brand: 3DPrintU (2026-06-19)

The public-facing brand is now **3DPrintU** (canonical domain `3dprintu.com`). The
former working name "3D Print Posters" / "3D Posters" has been retired from all
user-visible surfaces: page titles, the PWA manifest, the marketing landing page,
and in-app wordmarks. This was a brand-surface change only. Repo name, Firebase
project id (`gen-lang-client-0675309660`), env keys, the Cloud Storage bucket, and
all source-code identifiers were intentionally left unchanged.

Routing also shifted: `/` is now the marketing landing page, and the upload flow
moved to `/start` (the PWA `start_url` points there). Production DNS for
`3dprintu.com` (Cloudflare zone, App Hosting custom domain, certificate) and new
brand icons/OG images remain open follow-ups.
