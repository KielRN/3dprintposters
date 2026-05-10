# Local E2E Smoke And Heightmap Review

Status: open
Owner: Human
Created: 2026-05-10
Source: `elliot_quick_dev_Startup.md`, `AGENTS.md`

## Why Human

This needs Elliot's local browser session, local environment files, live provider credentials, and visual judgment on proof, heightmap, and GLB quality.

## Steps

1. Start the print-file generator from `services/print-file-generator`:

   ```powershell
   python -m uvicorn app.main:app --reload --port 8089
   ```

2. Start the function-only Firebase emulator from the repo root:

   ```powershell
   npm run firebase:emulators:functions
   ```

3. Start the web app from the repo root:

   ```powershell
   npm run dev
   ```

4. Open `http://localhost:3000`.
5. Upload a JPG or PNG, create a generation job, approve the generated proof, and wait for print-file artifacts.
6. On the job page, inspect the approved proof, `heightmap.png`, generated `preview.glb`, printability status, and artifact download links.
7. For heightmap-provider review, run the canonical experiments from `services/print-file-generator` against both local inputs described in `elliot_quick_dev_Startup.md`.
8. Ask Codex to compare `.tmp/experiments` outputs when you want metadata, image, or artifact review.

## Done When

- The local app reaches a job page with an approved proof, generated heightmap, and rendered GLB preview.
- Checkout is available only after print-file artifacts are generated.
- For experiment review, both canonical local inputs produce output under `.tmp/experiments`.
- Any visual quality issue, app failure, provider failure, or confusing UX is captured in a new or updated human task.

## Evidence To Capture

- Job id and route checked, without user secrets.
- Whether proof generation, approval, print-file generation, and checkout gating worked.
- Which provider outputs looked best or worst, with local artifact paths if useful.
- Any console or terminal error text that does not contain secret values.

## Related Files

- `elliot_quick_dev_Startup.md`
- `AGENTS.md`
- `docs/PRINT_FILE_GENERATION_WORKFLOW.md`
- `research/HEIGHTMAP_FINAL_EVALUATION_REVIEW.md`

