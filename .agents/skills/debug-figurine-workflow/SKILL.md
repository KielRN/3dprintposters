---
name: debug-figurine-workflow
description: Use when a 3DPrintPosters figurine workflow fails or stalls, including upload errors, "Upload did not finish", missing or rejected Vertex proofs, Meshy Creative Lab prototype/build failures, Hi3D direct Multi-Image-to-3D failures, stuck generationState or pipelineStage, missing GLB/STL/3MF artifacts, print-readiness warnings, provider task IDs, or job/order state mismatches. This skill traces the real failure boundary before changing code.
---

# Debug Figurine Workflow

## Overview

Use this skill to debug a concrete figurine job or workflow path from customer upload through Vertex/Gemini proofing, generated-3D provider handoff, paid build, and operator review.

## Diagnostic Order

1. Identify the exact surface: URL, style id, job id, user-visible message, provider task id, screenshot, or log line.
2. Map the style before blaming the provider:
   - `proofMode: generated_options` means Vertex/Gemini creates proof image options.
   - `proofMode: template_face_swap` means Vertex edits the first enabled style template image with customer identity.
   - `generationWorkflow: creative_lab_figure` means Meshy Creative Lab prototype/build.
   - `generationWorkflow: direct_multi_image_to_3d` means direct Hi3D or Meshy Multi-Image-to-3D.
3. Inspect job state and logs before editing UI copy. `UploadPanel.tsx` can surface post-upload callable failures as `Upload did not finish.`
4. Separate the boundary:
   - Upload/auth/storage issue: source image missing or callable never starts.
   - Vertex issue: no proof image, safety/block response, model/API/config error.
   - Creative Lab issue: Vertex output exists, Meshy prototype/build rejects input or returns no concept/model.
   - Direct provider issue: swapped proof/direct input exists, Hi3D/Meshy direct task fails or returns incomplete assets.
   - Checkout/order issue: proof/model exists but `pipelineStage`, `orders/{jobId}`, or `figurineBuild` state is wrong.
   - Print-readiness issue: GLB exists but assembly/tooling/review state blocks fulfillment.
5. Patch only after the failing boundary is known. Keep fixes narrow unless the evidence shows a shared contract is broken.

## Source Map

Start with these files when the failing boundary is unclear:

- Customer upload/callable surface: `apps/web/components/UploadPanel.tsx`
- Job detail and checkout gates: `apps/web/components/JobDetail.tsx`, `apps/web/components/ManualFigurineCheckout.tsx`
- Job creation/proof orchestration: `apps/functions/src/index.ts`, callable `createGenerationJob`
- Vertex/Gemini proof provider: `apps/functions/src/aiProvider.ts`
- Workflow config: `apps/functions/src/figurineWorkflowConfig.ts`, `apps/web/lib/figurineWorkflowConfig.ts`
- Provider handoff/build: `apps/functions/src/figurineBuild.ts`, `apps/functions/src/meshyFigurineProvider.ts`, `apps/functions/src/hi3dFigurineProvider.ts`
- Admin/operator summaries: `apps/functions/src/adminSupport.ts`, `apps/web/components/AdminSupportJobs.tsx`
- Recovery/stale jobs: `apps/functions/src/generationRecovery.ts`, `apps/functions/scripts/repair-stale-generation-jobs.mjs`
- Current workflow docs: `docs/Workflows/figurine-and-operator-workflows.md` and `docs/Workflows/figurine-style-workflow-contracts.md`

## Helper

Summarize a job without dumping the full Firestore document:

```powershell
node .agents/skills/debug-figurine-workflow/scripts/summarize-job-diagnostics.mjs <jobId>
```

Use `--project <projectId>` when needed. If you have an exported JSON artifact instead of live Firestore access, use:

```powershell
node .agents/skills/debug-figurine-workflow/scripts/summarize-job-diagnostics.mjs --from-json .tmp/job.json
```

The helper prints curated, non-secret fields only. It strips URL query strings and does not print credentials.

## Common Checks

```powershell
git status --short
npm --workspace apps/functions run test:workflow-config
npm --workspace apps/functions run build
npm --workspace apps/web run typecheck
```

For emulator/local reproduction, use the repo runbook in `AGENTS.md`: print-file generator on `8089`, Functions emulator, then `npm run dev`.

## Gotchas

- Do not treat a customer-facing upload error as proof that Storage upload failed. Check job state and logs.
- Do not use the paid-order seeder as proof of real payment; use `$seed-dev-paid-order` only for dev/test Print Console inclusion.
- Do not ask Vertex/Gemini, Meshy, or Hi3D to generate reusable bases, nameplates, or customer-name geometry. That belongs in deterministic print-file services.
- Never print API keys, tokens, signed URL query parameters, or raw secret-bearing env contents.
