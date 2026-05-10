# 3DPrintPosters Agent Guide

This file is the first place Codex or another coding agent should read before working in this repository. `AI_DEVELOPER_NOTES.md` keeps the longer project memory; this file keeps the operating rules and current implementation shape.

## Working Rules

- Do not create, switch, or rename Git branches unless the user explicitly asks for that action. Continue on the current branch by default.
- If the user asks to push, commit, or open a PR, first confirm the current branch and working-tree scope. If the current branch is inappropriate, ask before creating a new branch.
- Never commit or paste secrets. Local `.env` files are ignored and must stay local.
- Use `STL`, not `SLT`; treat `SLT` as a typo.
- Preserve the web-first PWA architecture with backend services that can support native apps later.
- Keep print-file generation server-side. Do not move geometry generation, texture packaging, or fulfillment logic into the browser.
- Use `human-tasks/` for human follow-ups. When AI work leaves a human validation, local testing, external account, partner outreach, or product decision step, create or update a Markdown task under `human-tasks/open/` using `human-tasks/TASK_TEMPLATE.md`.
- `elliot_quick_dev_Startup.md` is a local, ignored runbook for Elliot's startup and experiment commands. Reference it from human tasks when useful, and keep personal or local-only details there instead of copying them into tracked docs.

## Project Manager Skill

- Use the repo-scoped `$project-manager-3dprintposters` skill for project status, roadmap, backlog, sprint/iteration planning, blocker/risk review, release readiness, docs drift, and handoff summaries.
- The skill lives at `.agents/skills/project-manager-3dprintposters/SKILL.md` and should synthesize project management outputs from the current repo artifacts instead of relying on generic PM templates.
- PM handoffs should summarize open human tasks and create or update them when the next action belongs to the human.

## Project Shape

- Web app: `apps/web`, Next.js PWA.
- Backend orchestration: `apps/functions`, Firebase Cloud Functions 2nd gen on Node.js 22.
- Print-file generator: `services/print-file-generator`, FastAPI service intended for Cloud Run.
- Dev Firebase/GCP project: `gen-lang-client-0675309660`.
- Product domain: `3dprintposters.com`.

## Current Flow

1. User signs in or continues as guest.
2. User uploads one JPG/PNG source image to `uploads/{uid}/{jobId}/source.{jpg|png}`.
3. Web calls `createGenerationJob`.
4. Functions call Vertex/Gemini through the internal provider adapter and store proof output under `generated/{uid}/{jobId}/preview.{png|jpg|webp}`.
5. User approves a proof on `/jobs/{jobId}`.
6. `approveGeneratedImage` calls `PRINT_FILE_GENERATOR_URL`.
7. The print-file generator writes baseline artifacts under `print-files/{uid}/{jobId}`:
   - `model.stl`
   - `preview.glb`
   - `heightmap.png`
   - `metadata.json`
8. The job page renders the generated `preview.glb`.
9. Checkout is allowed only after the proof is approved and print-file artifacts are generated.

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

Required local Functions values belong in `apps/functions/.env`:

```text
AI_PROVIDER_ROUTE=vertex-gemini-direct
APP_STORAGE_BUCKET=gen-lang-client-0675309660.firebasestorage.app
PRINT_FILE_GENERATOR_URL=http://127.0.0.1:8089
VERTEX_API_KEY=...
```

Required web values belong in `apps/web/.env.local`. Keep `NEXT_PUBLIC_USE_FIREBASE_FUNCTIONS_EMULATOR=true` for the hybrid local flow.

The full Firebase emulator suite remains blocked on this machine until JDK 21+ is installed; function-only emulator testing is the normal local path.

## Implementation Notes

- Keep AI provider calls behind the adapter in `apps/functions/src/aiProvider.ts`.
- Keep the direct Vertex/Gemini route as the MVP default.
- Keep Cloudflare AI Gateway deferred until provider comparison, centralized AI observability, rate limits, retries, or fallback become important.
- Keep `services/print-file-generator` as the production print-file boundary. Do not vendor the standalone `E:\PROJECTS\print-file-generator` Flask routes, SQLite project database, browser session state, local CLI flow, TD1 hardware code, or old open-surface mesh topology.
- Current print-file path is deterministic luminance relief generation: validated image input, 5:7 normalization, closed watertight 127mm x 177.8mm mesh, binary STL, neutral GLB preview, heightmap PNG, metadata JSON, and printability checks.
- Add AI depth providers only after deterministic relief generation stays stable. Depth Anything V2 Small is the first planned experimental provider.
- Firestore stores metadata and Storage paths, not binary payloads or signed URLs.
- Use idempotency for job creation, checkout, file handoff, and fulfillment actions.

## Current Heightmap Experiment Plan

- Current experiment branch: `codex/heightmap-experiments`.
- Current research note: `research/HEIGHTMAP_AND_3D_WORKFLOW_RESEARCH.md`.
- The old `AI_3D_MODEL_GENERATION_RESEARCH.md` was intentionally removed; use the new heightmap research document instead.
- The immediate issue is that `posterized_luminance` treats image brightness as depth, which creates blocky height bands and muddy portrait reliefs. Keep it as a deterministic fallback, not the target production quality path.
- Experiment 1 deterministic provider scaffolding exists in `services/print-file-generator`: `posterized_luminance` remains the default, while `continuous_luminance` and `lithophane_baseline` are opt-in relief providers.
- Future heightmap experiments should run both canonical local inputs from `.tmp/input_image`: `Gemini_Generated_Image_lzneejlzneejlzne.png` and `Profile-Pic-HIMSS.jpg`.
- Use `python scripts/run_heightmap_experiment.py <source-image>` from `services/print-file-generator` for each input to write local comparison outputs under `.tmp/experiments/experiment_1`.
- Run experiments as opt-in providers or sidecar scripts inside `services/print-file-generator`; do not replace the default checkout path until output quality, printability, cost, and licensing are understood.
- Prefer one shared experiment branch with provider/config isolation over one Git branch per idea. Create separate branches only if a dependency stack becomes large or disruptive.
- Keep experiment outputs under ignored local paths such as `.tmp/experiments/{provider}/{jobId}`.
- First experiments to compare:
  - `lithophane_baseline`: use the PyPI lithophane approach only as a reference baseline for brightness-to-thickness behavior, not as the main poster-relief solution.
  - `depth_anything_v2_small`: first semantic depth provider candidate.
  - `bas_relief_transform`: depth compression/gradient compression between semantic depth and printable heightmap.
  - `segformer_masked_depth`: subject or portrait-aware masking layered over depth (SegFormer/ADE20K via HF Inference API). Originally registered as `sam_masked_depth` and renamed to reflect the actual implementation.
  - `triposr_sidecar`: full image-to-3D benchmark — **evaluated 2026-05-09, rejected** (reconstructs standalone 3D objects, not image-plane depth; not viable for poster relief). Remaining candidates (`stable_fast_3d_sidecar`, `trellis_sidecar`) likely share the same problem and are deprioritized.
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

- `CHECKLIST.md`
- `CHANGELOG.md`
- `README.md`
- `AI_DEVELOPER_NOTES.md`
- `docs/PRINT_FILE_GENERATION_WORKFLOW.md`
