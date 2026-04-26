# Changelog

All notable project changes will be documented in this file.

## [Unreleased] - 2026-04-26

### Added

- Verified Cloudflare account API token access for account-scoped API calls.
- Verified Cloudflare can resolve the `3dprintposters.com` zone through the API.
- Verified AI Gateway API access for the Cloudflare account; no gateway is configured yet.
- Added this documentation cleanup path for project progress, roadmap, and Cloudflare setup tracking.

### Planned

- Create the project AI Gateway after choosing the first provider and model strategy.
- Choose the first production hosting target before adding final Cloudflare DNS records.

## [Unreleased] - 2026-04-25

### Added

- Created initial monorepo architecture for web app, Firebase functions, Python STL service, and infrastructure docs.
- Added product implementation checklist and high-level architecture documentation.
- Added secret-safe `.gitignore` patterns for local env files and GCP/Firebase JSON keys.
- Added initial Next.js mobile-first PWA scaffold.
- Added initial Firebase Functions scaffold for job creation and Stripe checkout/webhook boundaries.
- Added initial Python Cloud Run service contract for image-to-STL conversion.
- Installed workspace dependencies and generated `package-lock.json`.
- Verified TypeScript checks for web and functions workspaces.
- Verified the Next.js production build.
- Created Stripe test product and $60 USD one-time price for the physical poster workflow.
- Updated checkout scaffolds to use `STRIPE_POSTER_PRICE_ID` when configured.
- Verified local checkout session creation returns a Stripe Checkout URL with a $60 USD total.

### Planned

- Connect Firebase Auth, Firestore, and Storage to the web UI.
- Wire the selected AI provider behind a server-side job pipeline.
- Implement the STL conversion pipeline and printability checks.
- Connect Stripe checkout and Sculpteo fulfillment in test mode.
