# Style Addition Map

Use this reference when adding or mirroring a figurine style.

## Code Surfaces

- `apps/functions/src/figurineWorkflowConfig.ts`: backend schema/defaults/normalizers.
- `apps/web/lib/figurineWorkflowConfig.ts`: browser mirror of config/defaults/normalizers.
- `apps/functions/scripts/seed-*-workflow.mjs`: seed reference images and upsert admin workflow config.
- `apps/web/components/AdminWorkflowConfig.tsx`: admin prompt mode, 3D workflow, provider selectors, visibility, and reference images.
- `apps/web/components/JobDetail.tsx`: customer job display and workflow labels when needed.
- `apps/functions/src/jobCost.ts`: provider cost classification when the workflow/provider affects operator spend.
- `docs/Workflows/figurine-and-operator-workflows.md`: overall customer/operator flow.
- `docs/Workflows/figurine-style-workflow-contracts.md`: compact runtime style matrix and family contracts.

## Style Families

- Chibi face-swap Creative Lab: `template_face_swap` plus `creative_lab_figure`.
- Chibi photo Creative Lab: `generated_options` with `proofRendering: realistic_person` plus `creative_lab_figure`.
- Heroic/Super Hero direct: `template_face_swap` plus `direct_multi_image_to_3d`, default Hi3D provider/model unless the task explicitly selects Meshy rollback.

## Done Means

The style is not done until code mirrors, admin visibility, seed behavior, docs, and tests all agree. If live dev seeding is part of the request, verify Storage and Firestore, not just the script exit code.
