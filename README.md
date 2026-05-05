# 3D Print Posters

3D Print Posters is a mobile-first web app for turning user photos into stylized, 3D-printable poster reliefs. The first build is structured as a PWA so users can open it from a link, while the backend boundaries keep room for later iOS and Android packaging.

## Architecture

- `apps/web` - Next.js customer app with upload, style selection, 3D preview, checkout, and order tracking screens.
- `apps/functions` - Firebase Cloud Functions for authenticated orchestration, Stripe webhooks, Firestore status updates, and fulfillment callbacks.
- `services/print-file-generator` - Python Cloud Run service boundary for heightmaps, relief geometry, full-color print packages, and filament painting support files.
- `services/stl-converter` - Earlier STL-only service scaffold retained until the broader print file generator fully replaces it.
- `infra/firebase` - Firestore, Storage, and emulator configuration.
- `infra/cloudflare` - Domain and DNS deployment notes.
- `docs` - Product architecture, deployment notes, and 3D conversion workflow.

## Local Start

Install dependencies before running the app:

```powershell
npm install
npm run dev
```

Then open `http://localhost:3000`.

For the current customer-flow test, also run the local Functions emulator so the new callable Functions are available:

```powershell
npm --workspace apps/functions run build
firebase emulators:start --only functions --project gen-lang-client-0675309660
```

Set `NEXT_PUBLIC_USE_FIREBASE_FUNCTIONS_EMULATOR=true` for the web app when using that function-only local path. Auth, Firestore, and Storage can still point at the configured Firebase project. The full Firebase emulator suite currently needs JDK 21+ locally.

Deploy Firebase security rules to the dev project with:

```powershell
npm run firebase:deploy:firestore-rules:dry-run
npm run firebase:deploy:storage-rules:dry-run
npm run firebase:deploy:rules:dry-run
npm run firebase:deploy:rules:dev
```

Firestore and Storage rules dry-run successfully against the current dev project. The dev Firebase Storage bucket is `gen-lang-client-0675309660.firebasestorage.app`; Firestore and Storage rules have been deployed to the dev project.

## Online Access

The app is not deployed to a public URL yet. Firebase App Hosting is the selected first public web host for `apps/web`; the first public test should use `staging.3dprintposters.com` once the staging App Hosting backend exists.

## Important Secret Rule

Do not commit Stripe keys, Firebase service account JSON files, fulfillment provider credentials, Cloudflare tokens, or model provider credentials. Use the `.env.example` files and Firebase/Google Secret Manager for deployed secrets.

## Current Status

This repository is still an MVP-in-progress, not a finished product. The web app now has the first Firebase-backed path for sign-in, source-photo upload, style selection, authenticated job creation through the server-side AI adapter, source-photo proof approval, checkout handoff, and single-order status. Real AI-generated proofs, real print artifact preview, account-level order history, fulfillment automation, and production deployment are still pending.

Start with [CHECKLIST.md](./CHECKLIST.md), [CHANGELOG.md](./CHANGELOG.md), and [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).
