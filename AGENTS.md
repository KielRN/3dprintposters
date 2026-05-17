# 3DPrintPosters Agent Guide

This file is the first place Codex or another coding agent should read before working in this repository. `AI_DEVELOPER_NOTES.md` keeps compact project memory; this file keeps the operating rules and current implementation shape.

## Working Rules

- Do not create, switch, or rename Git branches unless the user explicitly asks for that action. Continue on the current branch by default.
- If the user asks to push, commit, or open a PR, first confirm the current branch and working-tree scope. If the current branch is inappropriate, ask before creating a new branch.
- Never commit or paste secrets. Local `.env` files are ignored and must stay local.
- Use `STL`, not `SLT`; treat `SLT` as a typo.
- Preserve the web-first PWA architecture with backend services that can support native apps later.
- Keep print-file generation server-side. Do not move geometry generation, texture packaging, or fulfillment logic into the browser.
- Use `human-tasks/` for human follow-ups. When AI work leaves a human validation, local testing, external account, partner outreach, or product decision step, create or update a Markdown task under `human-tasks/open/` using `human-tasks/TASK_TEMPLATE.md`.
- Develop toward the intended final product behavior first. Do not leave a chosen direction as opt-in, experimental, or hidden behind a fallback plan after a decision has been made; wire it into the real workflow and let testing reveal the next fix.
- `elliot_quick_dev_Startup.md` is a local, ignored runbook for Elliot's startup and experiment commands. Reference it from human tasks when useful, and keep personal or local-only details there instead of copying them into tracked docs.

## Project Manager Skill

- Use the repo-scoped `$project-manager-3dprintposters` skill for project status, roadmap, backlog, sprint/iteration planning, blocker/risk review, release readiness, docs drift, and handoff summaries.
- The skill lives at `.agents/skills/project-manager-3dprintposters/SKILL.md` and should synthesize project management outputs from the current repo artifacts instead of relying on generic PM templates.
- PM handoffs should summarize open human tasks and create or update them when the next action belongs to the human.
- After an AI developer implements and verifies a meaningful PM/checklist task, create or update a human-test task for Elliot when the next useful validation is the whole product workflow in the browser. Human testing should exercise the app as a final product, not just isolated technical checks.

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
6. `approveGeneratedImage` calls `PRINT_FILE_GENERATOR_URL` with `masked_depth_detail_blend`, `lithophane_baseline` detail source at `detail_weight: 0.12`, 400px mesh output width, 768px geometry-analysis width, the 5in x 7in image-window / 5.5in x 7.5in physical dimensions, and the production relief settings.
7. The print-file generator writes artifacts under `print-files/{uid}/{jobId}`:
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

Required print-file generator values belong in the print-file generator process environment or local root `.env`:

```text
HUGGINGFACE_API_KEY=...
```

The hybrid relief path uses the print-file generator's normal Python dependencies for local Depth Anything V2.

Required web values belong in `apps/web/.env.local`. Keep `NEXT_PUBLIC_USE_FIREBASE_FUNCTIONS_EMULATOR=true` for the hybrid local flow.

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

- The chosen production relief provider is `masked_depth_detail_blend` with `lithophane_baseline` detail source at `detail_weight: 0.12`.
- The Super Dad generated proof is the MVP north star for the HueForge-like product direction: controlled printable art, smooth stylized human surfaces, clean body volumes, crisp raised text/logos, simple backgrounds, and intentional texture only.
- The customer photo is identity/reference input. The approved generated proof plus style/surface policy should be the manufacturing input.
- Current Phase 3 focus is product geometry and quality tuning: 5in x 7in image relief window, 1/4in border on all sides, intentional frame geometry, edge fade, geometry-analysis cleanup, contour-smoothed subject edges, face smoothing/pit guarding without a nose-specific boost, higher mesh resolution, better GLB preview lighting/material, and surface-intent-aware smoothing/detail gating.
- Default surface policy should be smooth unless explicitly called: skin, scalp/top-of-head, neck, ears, hands, simple clothing, and backgrounds should not inherit rough source/proof texture. Text, logos, graphic edges, panel lines, hair, fabric, and other material textures should keep detail only when intentionally marked.
- Run future experiments as sidecar scripts until reviewed, then promote the chosen path into the real checkout workflow instead of leaving it opt-in.
- Use canonical local inputs from `.tmp/input_image` for future relief comparisons when relevant: `Gemini_Generated_Image_lzneejlzneejlzne.png` and `Profile-Pic-HIMSS.jpg`.
- Keep experiment outputs under ignored local paths such as `.tmp/experiments/{provider}/{jobId}`.
- Full image-to-3D reconstruction providers such as TripoSR, Stable Fast 3D, TRELLIS, SAM 3D Objects, and TriplaneGaussian are rejected for poster relief because they reconstruct standalone objects rather than image-plane depth.
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
