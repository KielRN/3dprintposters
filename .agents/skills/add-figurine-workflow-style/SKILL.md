---
name: add-figurine-workflow-style
description: Use when adding, mirroring, seeding, or exposing a 3DPrintPosters figurine workflow style such as Chibi, Heroic fantasy, Super Hero, Creative Lab, direct Multi-Image-to-3D, or another public/admin style. This skill keeps Functions/Web workflow config parity, reference-image seeding, admin visibility, docs, tests, and provider routing aligned.
---

# Add Figurine Workflow Style

## Overview

Use this skill when the user wants a new style or "the same workflow" cloned to another style, gender, provider, or reference image. Mirror the proven workflow first; redesign only when the user asks for a different workflow.

## Required Inputs

Identify or infer these before editing:

- Style id and label, for example `heroic_fantasy_female` and `Heroic fantasy female`.
- Source workflow to mirror, if any.
- Reference image path, if `template_face_swap` is used.
- Proof mode: `generated_options` or `template_face_swap`.
- 3D workflow: `creative_lab_figure` or `direct_multi_image_to_3d`.
- Direct provider/model when using direct Multi-Image-to-3D: current default is Hi3D `hitem3dv2.1`, with Meshy `meshy-6` as rollback.
- Public visibility and whether the style should appear on the customer style picker now.

## Implementation Checklist

1. Read current workflow docs and configs:
   - `docs/Workflows/figurine-and-operator-workflows.md`
   - `docs/Workflows/figurine-style-workflow-contracts.md`
   - `apps/functions/src/figurineWorkflowConfig.ts`
   - `apps/web/lib/figurineWorkflowConfig.ts`
   - `apps/web/components/AdminWorkflowConfig.tsx`
2. Mirror the existing style path before changing behavior:
   - `template_face_swap + creative_lab_figure`: Vertex swaps a template image, then Meshy Creative Lab creates the reviewable concept/build.
   - `template_face_swap + direct_multi_image_to_3d`: Vertex swaps a template image, then the paid build sends that image to Hi3D/Meshy direct.
   - `generated_options + creative_lab_figure`: Vertex creates one or more proof/person images, then Meshy Creative Lab handles the figurine path.
3. Patch both workflow config mirrors in the same pass. Keep ids, labels, prompt constants, proof mode, generation workflow, provider fields, enabled state, and default ordering aligned.
4. Add or update an explicit seed script when the style needs an admin reference image uploaded to Storage or Firestore `adminConfig/figurineWorkflow` updated. Include a real dry-run path or a dedicated dry-run npm script if package scripts are touched.
5. Update display and operator surfaces only when needed, such as `JobDetail.tsx`, support/admin labels, job cost accounting, or customer style cards.
6. Add or update `docs/Workflows/figurine-style-workflow-contracts.md` when this creates a public or durable workflow contract. Update the overview only if the overall customer/operator flow changes.
7. Update `CHANGELOG.md`, `PROJECT_STATE.md`, `DECISIONS.md`, or `docs/ROADMAP.md` only when the behavior/status actually changes.

## Helper

After edits, verify the style appears in both mirrored config surfaces:

```powershell
node .agents/skills/add-figurine-workflow-style/scripts/check-workflow-style-surfaces.mjs --style-id heroic_fantasy_female --label "Heroic fantasy female"
```

This is a fast tripwire. It does not replace tests or live seed verification.

## Verification

Use the risk-appropriate subset:

```powershell
npm --workspace apps/functions run test:workflow-config
npm --workspace apps/functions run build
npm --workspace apps/web run typecheck
git diff --check
```

If a seed script is added or changed, run its dry-run command. If live dev seeding is requested, confirm the target project/emulator and verify Storage plus Firestore state after seeding.

## Gotchas

- The Functions and Web workflow config files drift easily. Re-read both edited regions before validation.
- If the user says "the same workflow," clone proof mode, generation workflow, provider selection, approval path, and seeding behavior before introducing new abstractions.
- Public style visibility comes from `enabled` and `visibleWorkflowStyles(config)`, not from a separate visible-count UI.
- `template_face_swap` requires at least one enabled reference image. Missing templates fail proof generation before the 3D provider can help.
- Keep generated provider body outputs body-only. Base, name text, and final assembly stay in deterministic print-file services.
