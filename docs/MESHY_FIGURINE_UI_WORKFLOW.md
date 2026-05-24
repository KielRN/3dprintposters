# Meshy Figurine UI Workflow

Status: product-planning reference for the PrintU-like Meshy figurine workflow.

Source screenshots: `human-tasks/printu-1.png` through `human-tasks/printu-15 - Base 2.png`. `printu-4.png` was not present in the captured set, so this document preserves the observed order and calls out the missing step rather than inventing it.

This document maps the desired customer-facing workflow for the new standalone figurine product. The UI reference is MakerWorld PrintU; the implementation target is 3DPrintPosters / 3DPrintYou with Meshy behind a server-side provider boundary. Meshy should remain an implementation detail in the customer UI except where we need honest warnings about provider status, printability, file formats, or manual fulfillment.

## Product Goal

The user should be able to start with one photo, choose a figurine style and posture, approve a 2D concept proof, generate a standalone 3D figurine, inspect it, optionally tune print-facing presentation settings, and then continue into preorder, checkout, or lead capture only after the output is honestly represented.

The first version should feel like a product creation flow, not an engineering console. The customer-facing labels can say "Generate 2D concept" and "Generate 3D figurine"; admin/debug surfaces can record Meshy task IDs, provider versions, credits, file URLs, and webhook state.

## Services To Build

The UI requires new backend services before it can be treated as a real product workflow. The existing poster-relief approval path should not be stretched to impersonate this flow.

Required services:

- Figurine job orchestration in Firebase Functions: create/validate figurine jobs, persist style/posture selections, track selected concept/model IDs, and expose status to the web app.
- Source-image validation: validate upload ownership, type, size, decode, minimum dimensions, and basic person/face suitability before concept or Meshy credits are spent.
- 2D concept generation: call the existing server-side AI provider adapter with figurine style/posture contracts, store concept images/history, and support selected-concept approval.
- 3D provider adapter: submit selected proof/source to a replaceable generated-3D provider interface, with Meshy as the first implementation after output quality and terms are accepted.
- Meshy task tracking: persist task IDs, model/version, requested formats, status/progress, webhook state, polling state, warnings, credits/cost, and failure reasons without storing secrets.
- Asset ingestion: download GLB, STL, optional 3MF, thumbnails, and metadata from Meshy into user/job-scoped Firebase Storage before provider retention expires.
- Webhook/async state bridge: connect Meshy polling and/or the Cloudflare webhook receiver to Firestore job/model history and readiness state.
- Artifact/readiness service: inspect available assets and report `preview_ready`, `needs_review`, `printability_warning`, `print_ready`, or `blocked`.
- Editor configuration persistence: save customer-facing color mode, base shape/texture/color, sign text/style, and supported posture/transform settings as structured metadata.
- Checkout/preorder/lead-capture gate: allow purchase intent only when the selected model and fulfillment path are represented honestly.

## Workflow Overview

1. Project gallery / entry point.
2. New figurine creation screen.
3. Style picker modal.
4. Missing screenshot in the source set.
5. Posture picker.
6. Uploaded-photo confirmation.
7. 2D concept generation progress.
8. 2D concept review and history.
9. 3D model generation progress.
10. 3D model review inside the three-step creation layout.
11. Full editor entry, default full-color preview.
12. Multi-color print mode.
13. Single-color print mode.
14. Posture / rigging editor state.
15. Base editor.
15b. Base editor with sign text enabled.

## 1. Project Gallery And Entry

Reference: `human-tasks/printu-1.png`

The first screen is a lightweight project dashboard. It includes a large branded hero area, a primary creation button, and a "My List" grid containing prior figurine projects.

For our implementation, this should become the customer landing point after sign-in or guest session start. The first viewport should make the figurine product obvious: show example figurines, not poster reliefs. The primary action should be something like "Create my figurine" and should open a new job in the figurine workflow.

Expected UI elements:

- Top app bar with product name, navigation/back control, account/session affordance, and provider credit/status only for internal/admin views.
- Large visual banner showing example personalized figurines.
- New project tile with a plus icon.
- Existing project cards with thumbnail, project name, last updated date, and overflow menu.
- Empty/loading states when no previous projects exist.

Data and status:

- Create or reuse a job record when the user starts a new project.
- Store project cards from Firestore job metadata.
- Do not expose Storage paths or signed URLs directly in the card data model.

## 2. New Figurine Creation Screen

Reference: `human-tasks/printu-2.png`

The next screen is a centered creation card titled `1.Upload image`. It has one upload dropzone, a style row, a posture row, and a bottom CTA for 2D generation.

For our product, this is the first real funnel screen. It should be clean and very short: the customer should understand that the system needs one clear photo, a style, and a pose. The UI should not ask for technical Meshy settings here.

Expected UI elements:

- Header with back control, editable project name, saved state, and account/session state.
- Upload area accepting JPG, PNG, and WebP with a visible max-size note.
- Style selector row with thumbnail and current selection.
- Posture selector row with thumbnail and current selection.
- Primary CTA: `Generate 2D concept`.
- Disabled CTA until a valid image is uploaded.

Recommended defaults:

- Style: `Chibi` or `Bobblehead`, depending on the first commercial positioning.
- Posture: `Natural pose`.
- Project title: `My Figurine`, editable.

Validation:

- Validate type, size, image decode, minimum dimensions, and face/person detectability before consuming provider credits.
- If detection confidence is weak, explain the problem in plain customer language and let the user replace the image.
- Keep validation server-side authoritative even if the browser performs quick prechecks.

## 3. Style Picker

Reference: `human-tasks/printu-3.png`

PrintU opens a large modal with four style choices: Bobblehead, Chibi, Cartoon, and Emoji. The selected style is highlighted, and the right side shows examples for that style.

Our equivalent should use the same mental model but phrase the options around outcomes Meshy can plausibly support. The first MVP choices should be limited to the styles we can test and fulfill honestly.

Recommended MVP style options:

- Bobblehead: oversized head, toy-like proportions, strong likeness emphasis.
- Chibi: small body, cute stylized proportions, soft features.
- Cartoon: more natural body proportions with simplified facial features.
- Emoji / avatar: simplified full-body character with expressive face.

Expected UI elements:

- Modal or side sheet titled `Choose style`.
- Option tiles with thumbnail, name, and selected state.
- Preview/example panel showing multiple representative outputs.
- Primary action: `Apply style`.
- Close control that keeps the previous selection.

Implementation notes:

- Each style should map to a stable internal `figurineStyle` value.
- Prompt/policy metadata should be generated server-side from the selected style, not from arbitrary user prompt text.
- The user-visible style should be stored with the job so concept and model generation are auditable.

## 4. Missing Screenshot

Reference: no `human-tasks/printu-4.png` was present.

The missing step likely occurred between style selection and posture selection or between applying style and returning to the main upload card. Do not block implementation on this gap. The observed workflow already contains the necessary states: style modal, applied style row, posture picker, upload confirmation, and generation.

For our UI map, reserve this slot for either:

- a short style-application return state, if testing shows the transition needs confirmation, or
- an image-upload tips/help state, if the product needs stronger photo guidance before generation.

## 5. Posture Picker

Reference: `human-tasks/printu-5.png`

PrintU opens a compact popover beside the posture row with three choices: Natural pose, Image pose, and T-pose beta. Each option has a thumbnail, label, description, and selected checkmark.

Our Meshy flow should preserve this exact decision because posture is both a creative preference and a provider-quality constraint.

Recommended posture options:

- Natural pose: default standing pose, best for first-time users and predictable fulfillment.
- Image pose: attempts to mimic the uploaded photo pose, useful for expressive photos but more failure-prone.
- T-pose / riggable pose: useful when the provider or editor needs downstream pose adjustment; label as advanced or beta if quality is uncertain.

Expected UI elements:

- Popover or modal titled `Choose posture`.
- Option rows with thumbnail, name, description, and selected state.
- Immediate selection update, then close on selection.
- Descriptions that set expectations without technical jargon.

Implementation notes:

- Store posture as structured metadata before any provider call.
- If Meshy or another provider exposes pose-control parameters, map from this product-level posture value inside the server adapter.
- If a selected posture increases failure risk, warn before generation rather than after credits are consumed.

## 6. Uploaded Photo Confirmation

Reference: `human-tasks/printu-6.png`

After upload, the dropzone becomes a photo preview. The current style and posture remain visible, and the generate button becomes active.

Our version should use this state as a final pre-generation check. The customer should see the selected source photo, style, and posture together before generating the 2D concept.

Expected UI elements:

- Uploaded image preview inside the same upload frame.
- Replace/re-upload control over the image.
- Optional crop/reframe control if face/body framing is poor.
- Style row and posture row remain editable.
- Primary CTA: `Generate 2D concept`.

Pre-generation checks:

- Image meets file and decode requirements.
- Job owner/session is valid.
- Selected style and posture are supported.
- User has accepted any required likeness/content terms.
- Backend can create an idempotent concept-generation request.

## 7. 2D Concept Generation Progress

Reference: `human-tasks/printu-7.png`

PrintU displays a modal overlay with a circular percentage progress indicator and the text `Image Generation in Progress`. The background remains visible but dimmed, and the main generate button shows a loading state.

For our implementation, use a similar blocking progress state while the concept proof is generated. If progress is not truly known, use stage-based status instead of fake precision.

Expected UI elements:

- Dimmed page overlay.
- Progress modal with spinner or real progress.
- Plain label: `Generating 2D concept`.
- Cancel/close control only if cancellation is actually supported.
- Underlying CTA shows loading state.

Status model:

- `conceptGenerationStatus`: `queued`, `running`, `succeeded`, `failed`, `canceled`.
- Record provider route, style contract, posture value, request timestamp, completion timestamp, and user-visible failure reason.
- If the provider task is asynchronous, poll or listen to Firestore updates rather than holding a browser request open.

## 8. 2D Concept Review And History

Reference: `human-tasks/printu-8.png`

After generation, the layout expands to two columns: the original upload/settings card and a `2.Generate 2D Concept` card. The concept card shows a large proof image, a concept generation history strip, and a `Generate 3D model` CTA.

This is the most important approval gate before Meshy model generation. The user should not move to 3D until they have seen and accepted the 2D concept direction.

Expected UI elements:

- Left card: source image, style, posture, and `Generate 2D concept` again.
- Middle card: generated proof image.
- Concept history with thumbnails and selected state.
- Primary CTA: `Generate 3D figurine`.
- Optional secondary action: regenerate concept.

Decision behavior:

- Selecting a concept thumbnail changes the active concept.
- Generating a new concept adds to history without deleting previous proofs.
- The `Generate 3D figurine` CTA uses the selected concept, not necessarily the most recent one.

MVP limit:

- PrintU shows history as `1/10`. Our MVP can use a lower cap if provider cost requires it, but the cap should be visible and enforced.

Backend notes:

- Store concept images under `generated/{uid}/{jobId}/concepts/{conceptId}`.
- Store concept metadata: source image path, style, posture, prompt contract version, provider, moderation status, and chosen/approved state.
- Do not send direct browser-generated prompts to Meshy. Server-side contracts should produce provider requests.

## 9. 3D Model Generation Progress

Reference: `human-tasks/printu-9.png`

PrintU adds a third card titled `3.Generate 3D model`, shows an empty waiting state, and displays a blocking modal titled `Model Generation in Progress`.

For Meshy, this stage is asynchronous and can fail in ways customers need to understand: provider queue, moderation, no usable model, missing formats, texture failure, or printability concerns. The UI should make progress feel calm without overpromising.

Expected UI elements:

- Three-column desktop layout when space allows.
- Third card has an empty/waiting state before the model is ready.
- Progress overlay with stage label: `Generating 3D figurine`.
- Model history area initialized as empty.
- Disabled export/checkout/edit controls while generating.

Status model:

- `modelGenerationStatus`: `queued`, `submitted_to_provider`, `provider_running`, `asset_downloading`, `packaging`, `printability_checking`, `succeeded`, `failed`.
- Store Meshy task ID and webhook events server-side.
- Download returned provider assets into our Storage quickly.
- Record available formats, provider warnings, credits/cost, model dimensions, and version metadata.

Failure behavior:

- If provider generation fails before consuming credits, say generation failed and allow retry.
- If it fails after consuming credits, preserve the failed attempt and expose a support/admin review path.
- If the model renders but is not print-ready, let the user inspect it but gate checkout with clear warnings.

## 10. 3D Model Review In Creation Layout

Reference: `human-tasks/printu-10.png`

PrintU shows the generated 3D model in the third card, with simple color preview toggles, model generation history, an `Export` button, and an `Edit your figurine` button.

Our equivalent should be the first honest model review screen. It should prioritize the GLB preview, readiness state, and next action.

Expected UI elements:

- Interactive 3D preview with orbit, zoom, reset, and loading/error states.
- Color/preview toggles only if they correspond to real available outputs.
- Model history with selected model thumbnail and status badge.
- Primary CTA: `Edit figurine` or `Continue`.
- Secondary CTA: `Export` only for admin/internal or post-purchase flows unless public downloads are part of the offer.
- Readiness panel or badge: `Preview ready`, `Needs review`, `Printability warning`, or `Ready for preorder`.

Decision behavior:

- Selecting a model history thumbnail changes the active 3D model.
- Edit opens the full-screen editor.
- Checkout/preorder should remain gated until provider output and fulfillment path are represented truthfully.

Backend notes:

- Store model assets under `print-files/{uid}/{jobId}/figurine/{modelId}/` or a similarly scoped path.
- Expected assets: `model.glb`, optional `model.stl`, optional `model.3mf`, thumbnails, metadata, warnings.
- The job page should never depend on Meshy-hosted URLs for durable customer review.

## 11. Full Editor Entry And Full-Color Preview

Reference: `human-tasks/printu-11.png`

The editor has a top bar, a vertical tool rail, a left settings panel, and a large 3D viewport. The default selected tool is Color, and the color type selector offers Single, Multi, and Full. Full color includes a warning that the full-color model is for preview only and points users to multi-color mode for printing exploration.

For our product, this editor can become a focused print-readiness and presentation screen. It should not imply the customer can fully repair geometry in the browser unless we actually support that. Keep customer controls constrained to meaningful choices.

Expected UI elements:

- Top bar: `Exit edit`, saved state, account/session, and primary next action.
- Left vertical rail: Color, Posture, Base, Transform.
- Left settings panel for the selected tool.
- Large 3D viewport with model dimensions displayed.
- View cube or orientation control.
- Undo and redo controls if edits are persisted as operations.

Full-color behavior:

- Full color can be the default visual preview if Meshy returns texture/material data.
- If full-color printing is not yet a real fulfillment option, label it as preview or "visual color".
- Do not let a customer buy a full-color print unless a validated full-color fulfillment path exists.

## 12. Multi-Color Print Mode

Reference: `human-tasks/printu-12- Multi Color.png`

PrintU's multi-color mode quantizes the model into color/filament regions. It exposes automatic color count, a list of color swatches/hex values, refresh/adjust controls, and an onboarding tooltip.

For Meshy MVP, multi-color should be treated carefully. It is valuable for Bambu/AMS-style fulfillment or 3MF color workflows, but it may require validation outside the browser.

Expected UI elements:

- Color type segmented control: Single, Multi, Full.
- Automatic/manual color count control.
- Color and filament list with swatches.
- Regenerate/recalculate color regions if supported.
- Tooltip or lightweight guidance for first use.
- Warning state if multi-color output is not yet validated for fulfillment.

Implementation notes:

- Store selected color mode separately from the original textured GLB.
- Multi-color choices should map to exported model metadata only when the backend can produce a corresponding package.
- If Meshy returns 3MF or color-separated assets, preserve them and show exactly what is available.
- Avoid letting the user edit arbitrary mesh material assignments client-side unless the server can reproduce/export those changes.

## 13. Single-Color Print Mode

Reference: `human-tasks/printu-13- Single Color.png`

Single-color mode shows the entire model as gray clay. It is the simplest and most honest print mode because it corresponds to ordinary single-material printing.

For our first purchasable product, single-color may be the safest fulfillment path if full-color or multi-color partner validation is not complete.

Expected UI elements:

- Single color selected in the segmented control.
- Model preview rendered in one neutral material.
- Optional material/color swatch for customer preference.
- Print-readiness copy outside the viewport or in a compact status panel.

Product behavior:

- If only single-color fulfillment is validated, make this the purchasable mode.
- If full-color is only a visual preview, show a clear distinction between "what your character looks like" and "what we can print now."
- Use this mode for slicer/manual fulfillment review because geometry is easier to inspect without texture distraction.

## 14. Posture / Rigging Editor

Reference: `human-tasks/printu-14- Posture 1.png`

The posture tab shows a `Rigging in progress...` state while the model is being prepared for pose changes. The model in the viewport is gray and includes a base.

For our MVP, posture editing after 3D generation should only exist if the provider output supports rigging or if we have a server-side pose/regeneration step. Otherwise, posture should remain a pre-generation choice from step 5.

Expected UI elements if supported:

- Posture tab in the editor rail.
- Rigging/progress state with stage label.
- Pose preset list once rigging completes.
- Clear disabled state if the active model cannot be rigged.
- Regenerate/apply action that records a new model revision.

Implementation notes:

- Do not claim live pose editing if we are actually regenerating the model.
- If posture edits create a new provider task, treat them as model-generation revisions with history and cost tracking.
- If base geometry is automatically added for stability, show it as part of the active print configuration.

## 15. Base Editor

Reference: `human-tasks/printu-15 - Base.png`

The base tab allows selection of base shape, base texture, base color, sign toggle, and print-separately toggle. Shape options include none, round, square, and hexagon. Texture options include none, stone, tile patterns, petal, honeycomb, industrial, star, and decorative patterns.

For our product, the base editor is commercially important: it makes the figurine feel giftable and helps with print stability.

Expected UI elements:

- Base shape tiles: None, Round, Square, Hexagon.
- Texture tiles with concise labels and visual thumbnails.
- Base color swatch/input.
- Sign toggle.
- Print separately toggle.
- Viewport updates immediately after base changes.
- Dimensions update when base changes.

Recommended MVP options:

- None: for digital preview only or advanced users; may be disallowed for checkout if stability needs a base.
- Round: default.
- Square: useful for desk/display products.
- Hexagon: optional visual variant.
- Textures: start with None, Stone, Tile, Star; add more after fulfillment validation.

Backend notes:

- Base geometry should be generated or composed server-side for the final printable package.
- Store base config as structured job metadata.
- Printability checks should account for base dimensions, contact area, model balance, and minimum thickness.

## 15b. Base Sign Text

Reference: `human-tasks/printu-15 - Base 2.png`

When Sign is enabled, PrintU reveals style choices, a text input, font dropdown, and print-separately toggle. The sample shows the name `Elliott` embossed or engraved on the base front.

This should be part of our gift/personalization surface, but it must have strict validation.

Expected UI elements:

- Sign toggle.
- Sign style: Simple or Frame.
- Text input for name/message.
- Font selector.
- Print separately toggle.
- Live 3D preview of text placement.

Validation:

- Enforce max length.
- Reject unsupported characters if the selected font/export pipeline cannot handle them.
- Prevent tiny text that cannot print.
- Moderate abusive, copyrighted, or prohibited text if public checkout is enabled.
- Preserve exact submitted text in job metadata for fulfillment review.

Recommended MVP:

- One safe font.
- One-line name text.
- Round base with front-facing raised or engraved text.
- Server-side geometry generation for final output.

## End-To-End Customer Path

The public MVP flow should be:

1. User starts a new figurine project.
2. User uploads one clear image.
3. User chooses style.
4. User chooses posture.
5. App validates the image and selections.
6. Backend generates a 2D concept proof.
7. User reviews concept history and selects the best concept.
8. User approves the selected concept for 3D generation.
9. Backend submits a Meshy provider task through a server-side adapter.
10. Webhook/polling updates job state.
11. Backend downloads provider assets into job-scoped Storage.
12. Backend runs basic model/package/readiness checks.
13. User reviews the GLB preview and readiness status.
14. User optionally edits print-facing options: color mode, base, sign, supported posture/transform settings.
15. User reaches preorder, checkout, or lead capture only after the active model's fulfillment status is clear.

## Recommended App Structure

Desktop creation layout:

- Left card: Upload and selections.
- Middle card: 2D concept proof and concept history.
- Right card: 3D model preview, model history, readiness, and next actions.

Mobile creation layout:

- Use one step at a time with a sticky bottom action.
- Stepper labels: Upload, Concept, Model.
- Keep history strips horizontally scrollable.
- Move style/posture pickers into full-screen sheets.

Editor layout:

- Full-screen editor after a model exists.
- Left rail for tools on desktop.
- Bottom tab bar or sheet controls on mobile.
- Large viewport remains the primary surface.
- Top bar always provides Exit, save state, and next action.

## Required Job State

The workflow needs job metadata beyond the existing poster-relief flow:

- `productType`: `figurine`.
- `sourceImagePath`.
- `figurineStyle`.
- `postureMode`.
- `concepts[]`: concept ID, Storage path, thumbnail, provider, prompt contract, created time, status.
- `selectedConceptId`.
- `models[]`: model ID, provider, provider task ID, Storage paths, thumbnails, formats, dimensions, status, warnings.
- `selectedModelId`.
- `printMode`: `single`, `multi`, or `full_preview`.
- `baseConfig`: shape, texture, color, sign text, sign style, print separately.
- `readinessStatus`: `not_started`, `generating`, `preview_ready`, `needs_review`, `print_ready`, `blocked`.
- `checkoutEligibility`: boolean plus reason.

## Checkout And Lead Capture Rules

Checkout, preorder, or lead capture may happen only when the user is not misled about what exists.

Allow:

- Lead capture after concept generation if the copy says the 3D figurine is not ready yet.
- Preorder after a generated 3D model exists and fulfillment is manual or pending review.
- Checkout only when the active output mode has a validated fulfillment path.

Do not allow:

- Checkout from a 2D concept alone unless the product is explicitly sold as "we will manually create this."
- Full-color checkout if full-color is only a preview mode.
- Export/download buttons that imply ownership or printability before policy and business rules are decided.

## Analytics Events

Track the funnel at these points:

- Project created.
- Image uploaded.
- Image validation failed.
- Style selected.
- Posture selected.
- 2D concept generation started.
- 2D concept generation completed or failed.
- Concept selected.
- 3D generation started.
- Meshy/provider task completed or failed.
- 3D preview viewed.
- Editor opened.
- Color mode selected.
- Base/sign edited.
- Readiness warning viewed.
- Checkout/preorder/lead capture clicked.
- Abandonment by step.

## Open Product Decisions

- Which style should be the default: Bobblehead, Chibi, Cartoon, or Emoji/avatar.
- Whether public MVP sells single-color only, multi-color preorder, full-color partner fulfillment, or manual review first.
- Whether customers should be allowed to export model files.
- Whether post-generation posture editing is in MVP or deferred.
- Which base/sign options are safe enough for first launch.
- Whether the first domain/brand expression should be `3dprintyou.com` while the repo remains `3DPrintPosters`.
