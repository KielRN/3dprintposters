# 3DPrintPosters Agent Guide

This file is the first place Codex or another coding agent should read before working in this repository. `PROJECT_STATE.md` keeps compact current project state, `DECISIONS.md` keeps durable product and architecture decisions, and this file keeps the operating rules and current implementation shape.

## Working Rules

- Default Git integration target is `main`. Do not create, switch, or rename feature branches unless the user explicitly asks for that action.
- If the user asks to commit or push, first confirm the current branch and working-tree scope. If work is on a non-`main` branch, treat `main` as the intended push target by default: preserve the working tree, move the intended changes onto `main` with a non-destructive Git flow, and push `origin main`. Ask first only when the current branch contains unrelated work, the working-tree scope is ambiguous, or moving the changes could rewrite or discard work.
- Open PRs only when the user explicitly asks for a PR. This project normally lands work directly on `main`.
- Never commit or paste secrets. Local `.env` files are ignored and must stay local.
- Use `STL`, not `SLT`; treat `SLT` as a typo.
- Preserve the web-first PWA architecture with backend services that can support native apps later.
- Keep print-file generation server-side. Do not move geometry generation, texture packaging, or fulfillment logic into the browser.
- Do not recreate tracked `human-tasks/` files. If an agent needs a short-lived human handoff, put it under ignored `.tmp/human-tasks/` and summarize the action in the response. Durable product decisions belong in the normal docs, not in an accumulating task folder.
- Develop toward the intended final product behavior first. Do not leave a chosen direction as opt-in, experimental, or hidden behind a fallback plan after a decision has been made; wire it into the real workflow and let testing reveal the next fix.
- `CHECKLIST.md` is now an archive pointer, not the active tracker. Do not add new task lists there. Use `PROJECT_STATE.md` for compact current state, `DECISIONS.md` for durable decisions, `docs/DESIGN.md` for the front-end design system (brand, tokens, type, landing/hero spec), `research/MESHY_SERVICE_IMPLEMENTATION_PLAN.md` for Meshy implementation detail, and `docs/Workflows/figurine-and-operator-workflows.md` plus the style-specific docs under `docs/Workflows/` for current figurine/customer/operator workflow contracts. `docs/MESHY_FIGURINE_UI_WORKFLOW.md` is a PrintU-inspired planning reference, not the current workflow source of truth.
- `elliot_quick_dev_Startup.md` is a local, ignored runbook for Elliot's startup and experiment commands. Reference it from `.tmp` handoffs when useful, and keep personal or local-only details there instead of copying them into tracked docs.

## Project Manager Skill

- Use the repo-scoped `$project-manager-3dprintposters` skill for project status, roadmap, backlog, sprint/iteration planning, blocker/risk review, release readiness, docs drift, and handoff summaries.
- The skill lives at `.agents/skills/project-manager-3dprintposters/SKILL.md` and should synthesize project management outputs from the current repo artifacts instead of relying on generic PM templates.
- For PM, roadmap, architecture, docs-drift, ownership-boundary, or "what should we do next?" work, use Graphify before opening broad source docs. Start with `graphify query "<task-specific question>"`, then verify the result against the current files. This keeps new-chat context smaller and avoids reading all of `PROJECT_STATE.md`, `DECISIONS.md`, or `CHANGELOG.md` before knowing which sections matter.
- Keep `docs/ROADMAP.md` as the durable traffic-light status board. Do not put detailed implementation plans, active scratch checklists, or long decision threads there.
- For detailed temporary PM plans, create an ignored folder under `.tmp/pm-plans/YYYY-MM-DD-short-slug/` with `plan.md`, `implementation.md`, and optional `evidence.md` only when those files materially help the work. Delete the folder after implementation, and move durable outcomes to `CHANGELOG.md`, `DECISIONS.md`, `PROJECT_STATE.md`, the relevant `docs/` or `research/` file, or the roadmap only if status/priority changed.
- PM handoffs should summarize human-owned next actions in the response. Create a temporary `.tmp/human-tasks/` note only when it materially helps the current handoff.
- After an AI developer implements and verifies a meaningful PM/checklist task, note any needed full-product browser validation for Elliot in the response or a temporary `.tmp/human-tasks/` note. Human testing should exercise the app as a final product, not just isolated technical checks.

## Graphify Knowledge Graph

- Use Graphify first for architecture, ownership-boundary, dependency, "where is this implemented?", cross-file, PM, roadmap, and docs-drift questions. Prefer `graphify query "<question>"` against an existing graph before broad raw-file searching or opening large docs.
- If `graphify-out/graph.json` is present, query it first:

```powershell
graphify query "Where is the figurine preview workflow implemented?"
graphify query "What files explain the current figurine roadmap status and launch blockers?"
graphify explain "approveGeneratedImage"
graphify path "approveGeneratedImage" "meshyFigurineProvider"
```

- Graphify outputs live in ignored `graphify-out/`. Treat them as generated local context, not source of truth to commit.
- The repo includes a Gemini-backed Graphify automation helper at `scripts/graphify/update-graph.ps1`. It loads only `GEMINI_API_KEY` or `GOOGLE_API_KEY` from the local root `.env` into the current process and must not print, copy, or move the secret value.
- Use these repo scripts from the repo root:

```powershell
npm run graphify:check          # no Gemini call; verifies local key + Graphify binary
npm run graphify:update         # rebuild graphify-out/ with Gemini semantic extraction
npm run graphify:update:deep    # richer semantic extraction; higher token/API cost
npm run graphify:update:global  # also merge this repo into the user-level global graph
```

- Do not run `graphify:update`, `graphify:update:deep`, or `graphify:update:global` casually in the middle of unrelated work; they can call Gemini and consume API quota. Run them when the user asks for a graph refresh, when architecture has changed materially, or before a broad onboarding/review pass.
- Graphify is a navigation and synthesis aid. After using it, open only the smallest relevant source sections with `rg`/targeted reads, then verify current files and tests directly before changing behavior.

## Cloudflare Skill

- Use the repo-scoped `$cloudflare-3dprintyou` skill for Cloudflare account, zone, DNS, Workers, routes, custom-domain, AI Gateway, and webhook work for `3dprintyou.com` or `3dprintposters.com`.
- The skill lives at `.agents/skills/cloudflare-3dprintyou/SKILL.md` and includes the account-scoped token verification pattern, known project zone IDs, and safe commands that do not print secrets.
- Prefer read-only Cloudflare inspection before mutating live DNS or Worker configuration. State the intended external change before applying it, and ask first if it could disrupt live traffic.

## Dev Seeding Skill

- Use the repo-scoped `$seed-dev-paid-order` skill when a dev/test job must appear in the Print Console by being seeded as a paid order.
- The skill lives at `.agents/skills/seed-dev-paid-order/SKILL.md` and wraps `npm run dev:seed-paid-order -- <jobId>`.
- The seeder mirrors the Stripe webhook's paid-order shape for dev data: `jobs/{jobId}.pipelineStage = "paid"` plus paid `orders/{jobId}` status, payment status, and fulfillment stage. Do not use it as proof of a real payment.

## Project Shape

- Web app: `apps/web`, Next.js PWA.
- Backend orchestration: `apps/functions`, Firebase Cloud Functions 2nd gen on Node.js 22.
- Print-file generator: `services/print-file-generator`, FastAPI service intended for Cloud Run.
- Dev Firebase/GCP project: `gen-lang-client-0675309660`.
- Product domains: `3dprintyou.com` is the preferred candidate for the figurine/customer-acquisition pivot; `3dprintposters.com` remains available for the parked poster-relief line.

## Current Business Priority

As of 2026-05-23, the active priority is customer acquisition and business-model proof, not more poster-relief tuning. Build toward a PrintU-like personalized figurine workflow first:

1. User uploads a photo.
2. User chooses figurine style, with MakerWorld PrintU as UX reference: Bobblehead, Chibi, Cartoon, Emoji, or provider-backed equivalents.
3. User chooses posture: Natural pose, Image pose, T-pose, or provider-backed equivalent.
4. Backend generates a 2D figurine proof.
5. User approves the proof.
6. Backend generates or imports a standalone 3D figurine through a server-side provider boundary.
7. Generated-3D providers stay behind server-side provider boundaries. Current workflow docs should decide the provider per style: Meshy Creative Lab powers the Creative Lab/Chibi paths, and Hi3D is the current direct Multi-Image-to-3D provider for Heroic fantasy and Super Hero direct-3D styles.
8. Job page shows the standalone figurine GLB and readiness/warning state.
9. Checkout, preorder, or lead capture is allowed only after the provider output and fulfillment path are honestly represented.

The old image-to-3D rejection applies only to poster relief. Full 3D reconstruction was wrong for image-plane depth, but may be right for standalone figurines.

## Standard Figurine Experiment Protocol

Use one runner for future Meshy figurine experiments:

```powershell
npm run meshy:experiment -- -- --experiment-slug exp-00N-short-name
```

The runner is `scripts/meshy/run-standard-figurine-experiment.mjs`. It owns the full experiment path in one file:

1. Source photo.
2. Vertex/Gemini body-only 2D concept.
3. Meshy Image-to-Image multi-view references.
4. Meshy Multi-Image-to-3D.
5. Meshy printability analysis.
6. Local scale/orientation normalization through `services/print-file-generator/scripts/normalize_meshy_artifact.py`.

Outputs land under `.tmp/experiments/meshy/standard/{experimentSlug}-{timestamp}` with stable `input/`, `vertex/`, `meshy/`, and `normalized/` subfolders. The latest run summary is also written to `.tmp/experiments/meshy/standard/latest.sanitized.json`.

Build future experiments by adding or removing stages, flags, or prompt policy inside this standard runner. Do not create another parallel Meshy runner unless the user explicitly asks for a one-off external prototype. Historical runners live under `scripts/meshy/archive/2026-05-26-legacy-runners/` for reproducing old results only; they are not the active experiment protocol.

The provider-generated body should be body-only. Do not ask Vertex/Gemini, Meshy, Hi3D, or another generated-3D provider to create the reusable product base, star details, customer name text, pedestal, platform, or nameplate. The base, text, and final body/base assembly belong in a separate deterministic service inside `services/print-file-generator`.

## Existing Relief Flow

1. User signs in or continues as guest.
2. User uploads one JPG/PNG source image to `uploads/{uid}/{jobId}/source.{jpg|png}`.
3. Web calls `createGenerationJob`.
4. Functions call Vertex/Gemini through the internal provider adapter and store proof output under `generated/{uid}/{jobId}/preview.{png|jpg|webp}`.
5. User approves a proof on `/jobs/{jobId}`.
6. `approveGeneratedImage` calls `PRINT_FILE_GENERATOR_URL` with `masked_depth_detail_blend`, `lithophane_baseline` detail source at `detail_weight: 0.38`, 400px mesh output width, 768px geometry-analysis width, the 5in x 7in image-window / 5.5in x 7.5in physical dimensions, and the production relief settings.
7. The print-file generator writes artifacts under `print-files/{uid}/{jobId}`:
   - `model.stl`
   - `preview.glb`
   - `heightmap.png`
   - `metadata.json`
8. The job page renders the generated `preview.glb`.
9. Checkout is allowed only after the proof is approved and print-file artifacts are generated.

This relief flow is implemented R&D and may remain useful later, but it is not the current customer-acquisition blocker.

## Local End-To-End Testing

Use live Vertex/Gemini generation by default. Do not switch to stubbed AI unless the user asks.

Run three terminals:

```powershell
cd services/print-file-generator
python -m uvicorn app.main:app --reload --port 8089
```

```powershell
npm run firebase:emulators:functions
```

```powershell
npm run dev
```

Firebase Functions runtime config is declared with `defineSecret`, even for deploy-time non-secret values, so deploys do not push local `.env` keys as plain Cloud Run environment variables. Mirror these values in ignored `apps/functions/.secret.local` for local emulator runs and configure the same names as Firebase Functions secrets for deployed runtimes:

```text
AI_PROVIDER_ROUTE=vertex-gemini-direct
APP_STORAGE_BUCKET=gen-lang-client-0675309660.firebasestorage.app
PRINT_FILE_GENERATOR_URL=http://127.0.0.1:8089
PUBLIC_APP_URL=http://localhost:3000
VERTEX_PROJECT=gen-lang-client-0675309660
VERTEX_LOCATION=us-central1
VERTEX_GCS_BUCKET=...
VERTEX_IMAGE_MODEL=gemini-3-pro-image
VERTEX_MAX_SOURCE_IMAGE_BYTES=8388608
STRIPE_POSTER_PRICE_ID=...
ADMIN_SUPPORT_ALLOWLIST=...
```

Provider credentials also live in ignored `apps/functions/.secret.local` for emulator runs and Firebase Functions secrets for deployed runtimes:

```text
VERTEX_API_KEY=...
MESHY_API_KEY=...
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
```

Required print-file generator values belong in the print-file generator process environment or local root `.env`:

```text
HUGGINGFACE_API_KEY=...
```

Required Meshy experiment values belong in the local root `.env` or process environment:

```text
MESHY_API_KEY=...
```

Graphify automation can also use the local root `.env`:

```text
GEMINI_API_KEY=...
GOOGLE_API_KEY=...
```

These values are for local graph refreshes only. Never print or commit them.

The hybrid relief path uses the print-file generator's normal Python dependencies for local Depth Anything V2.

Required web values belong in `apps/web/.env.local`. Keep `NEXT_PUBLIC_USE_FIREBASE_FUNCTIONS_EMULATOR=true` for the hybrid local flow.

The standard Meshy figurine experiment uses live Vertex/Gemini and Meshy by default and can consume paid provider credits. Do not switch it to stubbed generation unless the user asks.

JDK 21+ is installed on this machine, so the full Firebase emulator suite can run locally. Function-only emulator testing remains available for the hybrid shared-Firebase flow.

## Implementation Notes

- Keep AI provider calls behind the adapter in `apps/functions/src/aiProvider.ts`.
- Keep the direct Vertex/Gemini route as the MVP default.
- Keep Cloudflare AI Gateway deferred until provider comparison, centralized AI observability, rate limits, or retries become important.
- Keep `services/print-file-generator` as the production print-file boundary. Do not vendor the standalone `E:\PROJECTS\print-file-generator` Flask routes, SQLite project database, browser session state, local CLI flow, TD1 hardware code, or old open-surface mesh topology.
- Current print-file path is the hybrid relief provider: validated image input, separate 5:7 image-window normalizations for a 768px geometry-analysis image and 400px mesh/color output image, geometry-only proof cleanup, Depth Anything V2 semantic depth, SegFormer subject masking with contour smoothing, reduced `lithophane_baseline` in-mask detail, guided-filter bas-relief compression, broader face smoothing, face/forehead pit guarding, closed watertight 139.7mm x 190.5mm mesh with a 127mm x 177.8mm relief window and 6.35mm border, binary STL, image-colored GLB preview, heightmap PNG, metadata JSON, debug PNGs, and printability checks.
- Firestore stores metadata and Storage paths, not binary payloads or signed URLs.
- Use idempotency for job creation, checkout, file handoff, and fulfillment actions.

## Relief Quality Direction

Current status: parked R&D while the PrintU-like figurine path is validated.

- The chosen production relief provider is `masked_depth_detail_blend` with `lithophane_baseline` detail source at `detail_weight: 0.38`.
- The Super Dad generated proof is the MVP north star for the HueForge-like product direction: controlled printable art, smooth stylized human surfaces, clean body volumes, crisp raised text/logos, simple backgrounds, and intentional texture only.
- The customer photo is identity/reference input. The approved generated proof plus style/surface policy should be the manufacturing input.
- Current Phase 3 focus is product geometry and quality tuning: 5in x 7in image relief window, 1/4in border on all sides, intentional frame geometry, edge fade, geometry-analysis cleanup, contour-smoothed subject edges, face smoothing/pit guarding without a nose-specific boost, higher mesh resolution, better GLB preview lighting/material, and surface-intent-aware smoothing/detail gating.
- Default surface policy should be smooth unless explicitly called: skin, scalp/top-of-head, neck, ears, hands, simple clothing, and backgrounds should not inherit rough source/proof texture. Text, logos, graphic edges, panel lines, hair, fabric, and other material textures should keep detail only when intentionally marked.
- Run future experiments as sidecar scripts until reviewed, then promote the chosen path into the real checkout workflow instead of leaving it opt-in.
- Use canonical local inputs from `.tmp/input_image` for future relief comparisons when relevant: `Gemini_Generated_Image_lzneejlzneejlzne.png` and `Profile-Pic-HIMSS.jpg`.
- Keep experiment outputs under ignored local paths such as `.tmp/experiments/{provider}/{jobId}`.
- Full image-to-3D reconstruction providers such as TripoSR, Stable Fast 3D, TRELLIS, SAM 3D Objects, TriplaneGaussian, and Meshy-style providers are rejected for poster relief because they reconstruct standalone objects rather than image-plane depth. They are now valid candidates for the standalone figurine product.
- Nano Banana / Gemini 2.5 Flash Image belongs in proof cleanup and depth-friendly preprocessing, not final STL/GLB geometry generation.

## Security And Secrets

- Keep API keys, Stripe keys, webhook secrets, Cloudflare tokens, and provider credentials out of source and chat.
- Secret-bearing configuration and API surfaces are in scope for analysis: agents may inspect variable names, example env files, config readers, provider adapters, Firebase callable functions, API routes, and service contracts, but must never print, copy, summarize, or move secret values.
- A Hugging Face API key may exist in the local root `.env`; do not print it, commit it, copy it into docs, or move it into tracked files.
- Use Firebase Functions secrets or Secret Manager for deployed runtimes.
- Storage rules should restrict reads/writes by authenticated user path ownership.
- Users cannot directly mark jobs complete, set print artifact paths, create fulfillment orders, or mutate order state.

## Verification

Common checks:

```powershell
npm --workspace apps/functions run build
npm --workspace apps/web run typecheck
python -m pytest tests
npm run firebase:deploy:storage-rules:dry-run
```

Run Python tests from `services/print-file-generator`.

## Documentation

When behavior changes, update the relevant docs:

- `CHANGELOG.md`
- `README.md`
- `DECISIONS.md`
- `PROJECT_STATE.md`
- `CHECKLIST.md` only if the archive/source-of-truth pointer changes
- `docs/DESIGN.md` when the brand, design tokens, type system, or landing/hero experience changes
- `docs/PRINT_FILE_GENERATION_WORKFLOW.md`
