# Figurine Style Workflow Contracts

Status: current runtime/admin contract as of 2026-07-12.

This document is the compact source of truth for public/admin figurine style behavior. It replaces the former per-style workflow pages, which duplicated fast-moving state and had drifted from the funded-build and storyfront flows.

## Evidence Anchors

- Runtime admin config checked on 2026-07-12: `adminConfig/figurineWorkflow` in Firebase project `gen-lang-client-0675309660`.
- Backend config/defaults/normalizers: `apps/functions/src/figurineWorkflowConfig.ts`.
- Web config/defaults/normalizers: `apps/web/lib/figurineWorkflowConfig.ts`.
- Job creation and approval: `apps/functions/src/index.ts`, callables `createGenerationJob` and `approveGeneratedImage`.
- Paid provider build trigger: `apps/functions/src/figurineBuild.ts`, exported Firestore trigger `onFigurineBuildQueued`.
- Provider adapters: `apps/functions/src/meshyFigurineProvider.ts` and `apps/functions/src/hi3dFigurineProvider.ts`.
- Storyfront customer surfaces: `apps/web/app/start/page.tsx`, `apps/web/app/start/[styleId]/page.tsx`, `apps/web/app/jobs/[jobId]/page.tsx`, `apps/web/app/jobs/[jobId]/home/page.tsx`, and `apps/web/components/storyfront/`.

## Current Runtime Style Matrix

The saved admin config currently has `proofGenerationCount: 4` and `visibleStyleCount: 8`. The first eight enabled styles are the public storyfront set.

| Style ID | Public label | Enabled | Proof mode | Proof rendering | 3D workflow | Runtime provider/model | Enabled references | Customer-reviewed concept |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `creative_lab_figure` | Super Hero Figure - Male | Yes | `template_face_swap` | None | `direct_multi_image_to_3d` | `hi3d` / `hitem3dv2.1` | 1 | Vertex swapped template image |
| `super_hero_figure_female` | Super Hero Figure - Female | Yes | `template_face_swap` | None | `direct_multi_image_to_3d` | `hi3d` / `hitem3dv2.1` | 1 | Vertex swapped template image |
| `chibi_figure` | Chibi heroic fantasy male | Yes | `template_face_swap` | None | `creative_lab_figure` | Meshy Creative Lab | 1 | Meshy prototype concept |
| `chibi_female` | Chibi heroic fantasy female | Yes | `template_face_swap` | None | `creative_lab_figure` | Meshy Creative Lab | 1 | Meshy prototype concept |
| `chibi_photo_male` | Chibi male | Yes | `generated_options` | `realistic_person` | `creative_lab_figure` | Meshy Creative Lab | 0 | Meshy prototype concept |
| `chibi_photo_female` | Chibi female | Yes | `generated_options` | `realistic_person` | `creative_lab_figure` | Meshy Creative Lab | 0 | Meshy prototype concept |
| `heroic_fantasy_male` | Heroic fantasy male | Yes | `template_face_swap` | None | `direct_multi_image_to_3d` | `hi3d` / `hitem3dv2.1` | 1 | Vertex swapped template image |
| `heroic_fantasy_female` | Heroic fantasy female | Yes | `template_face_swap` | None | `direct_multi_image_to_3d` | `hi3d` / `scene-portraitv2.1` | 1 | Vertex swapped template image |
| `emoji_avatar` | Emoji Avatar | No | `generated_options` | None | `creative_lab_figure` | Meshy Creative Lab if enabled | 0 | Vertex proof options unless changed |

Checked-in defaults may differ from the saved admin config for load-bearing historical IDs. Treat the runtime admin config as the current public style set, then update checked-in defaults/seeds when a style contract should survive config resets.

## Common Customer Contract

1. `/start` shows the style gallery from the visible workflow config.
2. `/start/[styleId]` collects sign-in/account creation, name/sign text, source photo, and style-specific copy through `ProjectPageView`, `AuthPanel`, and `UploadPanel`.
3. `createGenerationJob` creates the job, stamps workflow/provider metadata, records `generationState`, and runs the pre-payment concept path.
4. `/jobs/[jobId]` shows the customer-reviewable concept only.
5. `approveGeneratedImage` is approval-only for figurines. It records `approvedImagePath` and sets `checkoutEligibility: { eligible: true, reason: "concept_approved" }`.
6. `/jobs/[jobId]/home` is the scene/claim/checkout page. Scene renders are presentation garnish and never gate checkout.
7. Stripe payment stamps `figurineBuild: queued` for normal paid figurine jobs.
8. `onFigurineBuildQueued` claims `queued -> running` and runs the selected Meshy/Hi3D provider build server-side.
9. Provider GLBs, print-readiness, build failures, and fulfillment state are operator/support surfaces. Customers do not see figurine GLBs or `figurineBuild` internals.

Manual studio review is the exception path: server-confirmed terminal generation can use `/jobs/{jobId}/manual-checkout`, and paid manual-review orders do not queue provider generation until an operator supplies a reviewed concept and releases it.

## Family Contracts

### Template Face Swap + Creative Lab

Styles: `chibi_figure`, `chibi_female`.

- The first enabled admin reference image is the fixed style template.
- Vertex/Gemini edits that template with the customer's face/head identity.
- Meshy Creative Lab prototype turns the swapped image into the single customer-reviewed concept.
- Approval records the Meshy concept.
- The paid build continues from the stored Creative Lab prototype task.

### Realistic Person Cleanup + Creative Lab

Styles: `chibi_photo_male`, `chibi_photo_female`.

- There is no admin template/reference image.
- Vertex/Gemini creates one internal realistic full-body cleanup render from the customer photo.
- The customer does not review the internal cleanup render.
- Meshy Creative Lab prototype performs the Chibi stylization and creates the single customer-reviewed concept.
- Approval records the Meshy concept.
- The paid build continues from the stored Creative Lab prototype task.

### Template Face Swap + Direct Multi-Image-to-3D

Styles: `creative_lab_figure` as Super Hero Figure - Male, `super_hero_figure_female`, `heroic_fantasy_male`, `heroic_fantasy_female`.

- The first enabled admin reference image is the fixed style template.
- Vertex/Gemini edits that template with the customer's face/head identity.
- The swapped image is both the customer-reviewed concept and the later direct-3D input.
- Approval records the swapped concept.
- The paid build calls the job-stamped direct provider/model. Hi3D is the current runtime provider for the public direct styles, and Meshy `meshy-6` remains the admin-selectable rollback provider.

## Change Rules

- Do not add another long per-style workflow page for routine style additions.
- Update this matrix when a style becomes public, changes proof mode, changes provider/model, or changes customer-visible concept behavior.
- Update `docs/Workflows/figurine-and-operator-workflows.md` only when the overall customer/operator flow changes.
- Update `DECISIONS.md` for durable product or architecture decisions, not for every seed-data refresh.
- Use `.agents/skills/add-figurine-workflow-style`, `.agents/skills/edit-figurine-workflow-prompts`, or `.agents/skills/debug-figurine-workflow` for repeated workflow work.
