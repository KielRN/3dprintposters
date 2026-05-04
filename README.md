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

The code scaffold is intentionally light. Install dependencies before running the app:

```powershell
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Important Secret Rule

Do not commit Stripe keys, Firebase service account JSON files, fulfillment provider credentials, Cloudflare tokens, or model provider credentials. Use the `.env.example` files and Firebase/Google Secret Manager for deployed secrets.

## Current Status

This repository is now an architecture scaffold, not a finished product. Start with [CHECKLIST.md](./CHECKLIST.md) and [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).
