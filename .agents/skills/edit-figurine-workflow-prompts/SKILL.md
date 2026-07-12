---
name: edit-figurine-workflow-prompts
description: Use when changing 3DPrintPosters figurine workflow prompts, Vertex/Gemini proof templates, image-generation mode presets, template_face_swap wording, generated_options prompts, proofRendering behavior, or admin-visible prompt options. This skill keeps Functions/Web workflow config parity, exposes reusable prompt presets in Workflow Controls, and verifies prompt changes with workflow-config tests.
---

# Edit Figurine Workflow Prompts

## Overview

Use this skill for prompt/template changes in the figurine workflow. The default bias is reusable admin-selectable presets, not one-off style tweaks hidden in backend constants.

## First Moves

1. Confirm the request target: prompt text only, a new reusable prompt preset, proof mode, proof rendering, or provider routing.
2. Use Graphify or targeted `rg` only to find the relevant current path; do not broadly rewrite workflow docs before locating the prompt surface.
3. Read these files together before editing:
   - `apps/functions/src/aiProvider.ts`
   - `apps/functions/src/figurineWorkflowConfig.ts`
   - `apps/web/lib/figurineWorkflowConfig.ts`
   - `apps/web/components/AdminWorkflowConfig.tsx`
   - `apps/functions/test/figurineWorkflowConfig.test.mjs`
   - `docs/Workflows/figurine-and-operator-workflows.md`

## Editing Rules

- Keep backend and web config mirrors aligned. Any prompt constant, proof-mode enum, provider catalog, default style, normalization rule, or public config behavior in `apps/functions/src/figurineWorkflowConfig.ts` usually needs the matching change in `apps/web/lib/figurineWorkflowConfig.ts`.
- If the user asks for a prompt variation that can be reused on other workflows, add an admin-visible preset in `AdminWorkflowConfig.tsx`. Do not bury it in one style's seed script or default style only.
- For `template_face_swap`, remember that the style prompt is sent to Vertex/Gemini as the entire edit instruction. Do not assume `buildFigurineProofPrompt` adds the normal generated-options scaffold.
- For `generated_options`, edit the base/style prompt path in `buildFigurineProofPrompt` and respect `proofRendering`; `realistic_person` is an internal person cleanup path for Creative Lab, not a customer-reviewed style card.
- Preserve provider boundaries. Meshy and Hi3D receive image inputs from the workflow; current app workflows do not send provider text prompts for 3D generation.
- Update or add tests when a preset, enum, default style, normalizer, or admin-visible option changes.
- Update workflow docs only when behavior or operator/customer contract changes. Do not duplicate long prompt prose across docs; point to the source file when possible.

## Helper

Run the prompt-surface checker after edits:

```powershell
node .agents/skills/edit-figurine-workflow-prompts/scripts/check-workflow-prompt-surfaces.mjs
```

It checks the mirrored config unions, known prompt constants, admin preset visibility, and test coverage hints. It is a tripwire, not a replacement for tests.

## Verification

Use the smallest useful set for the change:

```powershell
npm --workspace apps/functions run test:workflow-config
npm --workspace apps/web run typecheck
git diff --check
```

If the change affects a live/customer workflow, also run or request a browser/emulator validation path and note any full-product browser test Elliot still needs to perform.

## Gotchas

- `Upload did not finish.` can appear after upload succeeds; use `$debug-figurine-workflow` for runtime failures instead of changing prompt code from that message alone.
- `visibleWorkflowStyles(config)` is the customer-visible selector source. Admin wording should match public visibility semantics.
- Direct styles such as Heroic fantasy male/female use `template_face_swap` plus `direct_multi_image_to_3d`; Chibi face-swap styles use `template_face_swap` plus `creative_lab_figure`.
- Never print or move secret values from `.env` or local runtime files.
