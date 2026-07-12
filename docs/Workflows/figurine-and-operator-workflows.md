# Figurine And Operator Workflows

Status: current implementation map as of 2026-07-12.

This document explains the current app workflows in plain language. It focuses on what the customer sees, where proof generation happens, how the style choices change the backend path, which Vertex/Gemini and generated-3D provider calls are used, and what the operator/admin consoles control.

Rendering note: these are live Mermaid diagrams. VS Code 1.121 and newer can render them with the built-in Markdown preview, without a Mermaid extension. Exact routes, Storage paths, callable names, and endpoint names are kept in the text around each diagram.

## Quick Answer

Proof generation is the 2D image/concept stage. It happens before any paid provider 3D build. In the funded-build flow, figurine 3D asset generation runs after Stripe payment unless the job is on the manual studio-review fallback path, where an operator must release a reviewed concept before the existing build queue starts.

In the generated-options figurine path:

1. Customer uses `/start`.
2. Customer creates or signs into an email/password account.
3. Customer uploads a JPG/PNG source photo.
4. Customer chooses a visible style from the workflow config.
5. The browser uploads the source photo to Firebase Storage under `uploads/{uid}/{jobId}/source.{jpg|png}`.
6. The browser calls the Firebase callable `createGenerationJob`.
7. `createGenerationJob` records `generationState`, reads the admin workflow config, builds the proof prompt, attaches the customer image and any enabled style reference images, and calls Vertex/Gemini through `apps/functions/src/aiProvider.ts`.
8. Vertex/Gemini writes one to four 2D proof images under `generated/{uid}/{jobId}/`.
9. Customer lands on `/jobs/{jobId}` and reviews proof cards.
10. Customer approves a proof/concept.
11. The browser calls `approveGeneratedImage`.
12. `approveGeneratedImage` records the approved concept for figurines; it does not call Meshy or Hi3D.
13. Customer continues to the page-4 claim/checkout surface.
14. Stripe `checkout.session.completed` stamps `figurineBuild: queued` for normal paid figurine jobs, and `onFigurineBuildQueued` runs the selected provider path behind the server-side adapter.
15. Operator/support surfaces handle the generated 3D package, print readiness, and fulfillment state.

The chibi styles are different — the customer reviews one Meshy concept image instead of multiple Vertex proofs. The heroic-fantasy chibi pair uses `template_face_swap` (Vertex creates one identity image from the style template), and the photo-driven chibi pair uses `generated_options` with `proofRendering: realistic_person` (Vertex creates one internal realistic person render from the customer photo). In both, Meshy creates the one reviewable concept image. Approval claims that concept, and the paid build later continues from the stored prototype task. See [Chibi Face Swap Creative Lab Workflow](./chibi-face-swap-creative-lab-workflow.md), [Chibi Female Face Swap Creative Lab Workflow](./chibi-female-face-swap-creative-lab-workflow.md), [Chibi Male Photo Creative Lab Workflow](./chibi-male-photo-creative-lab-workflow.md), and [Chibi Female Photo Creative Lab Workflow](./chibi-female-photo-creative-lab-workflow.md).

Current funded-build note: for chibi styles, approval claims the reviewed concept. The paid build later continues from the stored prototype task through the guarded post-payment build queue.

Generation recovery path:

- `createGenerationJob` updates `generationState.state`, `stage`, `startedAt`, `lastProgressAt`, `completedAt`, `failureCode`, and a customer-safe `publicMessage`.
- `reconcileStaleGenerationJobs` moves abandoned figurine generations into a terminal personal-studio-review state after the documented runtime plus grace period.
- `/jobs/{jobId}/manual-checkout` calls `createFallbackFigurineCheckoutSession` only for server-confirmed terminal figurine jobs owned by the signed-in customer.
- Fallback orders use `fulfillmentMode: "manual_proof_required"`. Stripe payment opens support/operator work and does not queue `figurineBuild`.
- Operators release a reviewed concept through `operatorUpdateFulfillment` action `release_manual_proof`; that stamps `approvedImagePath` and queues the existing guarded figurine build once.

The important split:

- Vertex/Gemini creates 2D customer-reviewable proof images or internal cleanup renders, depending on the selected workflow.
- Meshy Creative Lab or the selected direct generated-3D provider creates 3D model artifacts after payment, or after an operator releases a reviewed concept for manual studio-review orders.
- The print-file generator assembles deterministic product parts such as the reusable base and customer name sign.

## Workflow 1: Workflow Controls Configure The Public Flow

The `/admin` page is titled `Operator console`, but it has two tabs:

- `Support jobs`: admin/support triage.
- `Workflow controls`: public style and proof-generation settings.

Workflow controls save the config at `adminConfig/figurineWorkflow`. The public `/start` page reads that config through `getFigurineWorkflowConfig`.

```mermaid
%%{init: {"flowchart": {"htmlLabels": false}} }%%
graph LR
  A["Admin opens admin page"] --> B["Workflow controls tab"]
  B --> C["Set proof count and base prompt"]
  B --> D["Edit styles and reference images"]
  D --> E["Choose proof mode"]
  D --> F["Choose 3D workflow"]
  C --> G["Save workflow config"]
  E --> G
  F --> G
  G --> H["Customer start page uses visible styles"]
```

Plain meaning:

- `Proof options` controls how many 2D proof images Vertex/Gemini should try to make. Current max is 4.
- `Base proof prompt` is the common instruction for generated figurine proofs.
- Each style has its own prompt and can be public or hidden.
- Each style chooses a proof mode and a 3D workflow.
- Reference images are admin-owned style/template images. They are not customer uploads.

Important current limitation:

- Posture is not exposed as a public picker yet. Current figurine jobs are stored as `postureMode: "natural"`, and the Vertex figurine prompt asks for a natural standing pose.

## Workflow 2: Customer Upload And Proof Generation

This is where "proof generation" comes in.

```mermaid
%%{init: {"flowchart": {"htmlLabels": false}} }%%
graph LR
  A["Customer opens start page"] --> B["Uploads photo and chooses style"]
  B --> C["Browser uploads source image"]
  C --> D["Create generation function runs"]
  D --> E["Prompt plus images sent to Vertex Gemini"]
  E --> F["2D proof images are saved"]
  F --> G["Customer job page shows proof cards"]
```

Plain meaning:

- `/start` is the upload and style-selection page.
- The customer sees the selected source image, style selector, proof option count, and `Generate` button.
- `createGenerationJob` does not call Meshy for the normal generated-options path. It creates customer-reviewable 2D proof images first.
- The customer sees those proof images on `/jobs/{jobId}`.

Vertex/Gemini details:

- Provider route: `vertex-gemini-direct` by default.
- Default image model in code: `gemini-3-pro-image`.
- Runtime override: `VERTEX_IMAGE_MODEL`.
- Endpoint shape: Vertex Express `:generateContent` under `https://aiplatform.googleapis.com/v1`, unless `VERTEX_EXPRESS_BASE_URL` overrides it.
- Request parts: prompt text, the customer source image, then any enabled admin reference images.
- Response expected: image output plus optional text/model metadata.

Proof image storage:

- Single proof: `generated/{uid}/{jobId}/preview.{ext}`
- Multiple proofs: `generated/{uid}/{jobId}/preview-1.{ext}`, `preview-2.{ext}`, etc.

## Workflow 3: Chibi Face Swap Into Meshy Creative Lab

Detailed source of truth:

- [Chibi Face Swap Creative Lab Workflow](./chibi-face-swap-creative-lab-workflow.md)
- [Chibi Female Face Swap Creative Lab Workflow](./chibi-female-face-swap-creative-lab-workflow.md)

Use those documents for the full Chibi sequence and job-state examples. This overview only records the contract:

- Style ID: `chibi_figure`
- Female style ID: `chibi_female`
- Proof mode: `template_face_swap`
- 3D workflow: `creative_lab_figure`
- Customer sees one Meshy-generated concept image, not multiple Chibi proofs.
- Payment continues Meshy build from the stored Creative Lab prototype task.

```mermaid
%%{init: {"flowchart": {"htmlLabels": false}} }%%
graph LR
  A["Customer image plus Chibi template"] --> B["Vertex/Gemini face swap"]
  B --> C["Meshy prototype concept"]
  C --> D["Customer approves one concept"]
  D --> E["Payment continues Meshy build"]
  E --> F["Preview-only textured GLB"]
```

Label note (2026-07-09): the public labels for this pair are now `Chibi heroic fantasy male` (`chibi_figure`) and `Chibi heroic fantasy female` (`chibi_female`). The `Chibi male` / `Chibi female` labels belong to the photo-driven styles in Workflow 3b.

## Workflow 3b: Photo-Driven Chibi (Realistic Person) Into Meshy Creative Lab

Detailed source of truth:

- [Chibi Male Photo Creative Lab Workflow](./chibi-male-photo-creative-lab-workflow.md)
- [Chibi Female Photo Creative Lab Workflow](./chibi-female-photo-creative-lab-workflow.md)

Use those documents for the full sequence and job-state examples. This overview only records the contract:

- Style IDs: `chibi_photo_male`, `chibi_photo_female`
- Public labels: `Chibi male`, `Chibi female`
- Proof mode: `generated_options` with `proofRendering: realistic_person`
- 3D workflow: `creative_lab_figure`
- No admin reference/template image.
- Vertex/Gemini renders one realistic full-body person (identity, own clothing completed, gray studio background) as an internal cleanup — the customer never reviews it.
- Meshy's prototype phase does all chibi stylization; the customer sees one Meshy-generated concept image.
- Payment continues Meshy build from the stored Creative Lab prototype task.

```mermaid
%%{init: {"flowchart": {"htmlLabels": false}} }%%
graph LR
  A["Customer photo"] --> B["Vertex/Gemini realistic person render"]
  B --> C["Meshy prototype concept (chibi stylization)"]
  C --> D["Customer approves one concept"]
  D --> E["Payment continues Meshy build"]
  E --> F["Preview-only textured GLB"]
```

## Workflow 4: Template Face Swap Style Paths

This is the faithful/detail style family. The default public direct examples are `Heroic fantasy male` and `Heroic fantasy female`, which use direct Multi-Image-to-3D on Hi3D by default. Admin-created Super Hero direct styles follow the same direct-provider contract. The code also supports either 3D workflow if an admin pairs `template_face_swap` with the matching style reference image.

It is used by:

- `Chibi heroic fantasy male` (`chibi_figure`) and `Chibi heroic fantasy female` (`chibi_female`), which route to Meshy Creative Lab
- `Heroic fantasy male` (`heroic_fantasy_male`) and `Heroic fantasy female` (`heroic_fantasy_female`), which route to direct Multi-Image-to-3D on Hi3D by default; see [Heroic Fantasy Male Face Swap Direct 3D Workflow](./heroic-fantasy-male-face-swap-direct-3d-workflow.md) and [Heroic Fantasy Female Face Swap Direct 3D Workflow](./heroic-fantasy-female-face-swap-direct-3d-workflow.md)
- Admin-created styles such as `Super Hero Figure - Male` (`creative_lab_figure`) and `Super Hero Figure - Female` (`super_hero_figure_female`), which also route to direct Multi-Image-to-3D on Hi3D; see [Super Hero Male Face Swap Direct 3D Workflow](./superhero-male-face-swap-direct-3d-workflow.md) and [Super Hero Female Face Swap Direct 3D Workflow](./superhero-female-face-swap-direct-3d-workflow.md)
- Any admin-created style with `proofMode: template_face_swap`

```mermaid
%%{init: {"flowchart": {"htmlLabels": false}} }%%
graph LR
  A["Admin style uses template face swap"] --> B["Customer uploads photo"]
  B --> C["Vertex edits template with customer identity"]
  C --> D["Job page shows swapped concept"]
  D --> E["Customer approves concept"]
  E --> F["Direct provider 3D path"]
  E --> G["Creative Lab build path"]
  F --> H["Save GLB STL and 3MF if returned"]
  G --> I["Save Creative Lab GLB"]
  H --> J["Job page shows GLB preview"]
  I --> J
  J --> K["Checkout stays locked"]
```

Plain meaning:

- The first enabled style reference image is the fixed style template.
- Vertex edits that template so the face/head identity comes from the customer photo.
- The prompt in Workflow controls is the whole Vertex instruction for this mode.
- Direct Multi-Image-to-3D styles let the customer review the swapped image before spending direct 3D credits.
- Creative Lab styles can use Meshy's prototype concept gate before the customer approves the final build.

Important gotcha:

- `template_face_swap` requires at least one enabled admin reference image. If a style has no enabled template image, proof generation fails before Meshy is called.

Provider details for this workflow:

- Direct Multi-Image-to-3D sends the approved swapped image as the single 3D input.
- Current default direct provider: Hi3D (`provider: "hi3d"`, `providerModel: "hitem3dv2.1"`).
- Hi3D output is the canonical original textured GLB stored under the provider-specific figurine preview path.
- Meshy `meshy-6` remains selectable as a no-deploy rollback provider for direct styles.
- Creative Lab styles still use Meshy prototype/build endpoints instead of the direct-provider route.
- After a direct model is ingested, print analysis or operator review may run, but checkout remains locked until an explicit print-readiness decision.

## Workflow 5: Named Base And Body/Base Assembly

This is the deterministic product-package path. It starts after the customer has a 3D figurine preview.

```mermaid
%%{init: {"flowchart": {"htmlLabels": false}} }%%
graph LR
  A["Customer sees 3D preview"] --> B["Customer enters base text"]
  B --> C["Print-file generator creates named base"]
  C --> D["Generator assembles body and base"]
  D --> E["Assembled preview and print files are saved"]
  E --> F["Print readiness link appears"]
```

Plain meaning:

- Meshy is responsible for the body/figurine preview.
- The reusable base, customer name, and body/base placement are deterministic print-file-generator work.
- Assembly does not make checkout ready by itself.

Current print-file generator endpoints:

- `/v1/figurine/named-base`
- `/v1/figurine/assemble`

Assembly output path:

`print-files/{uid}/{jobId}/figurine/assembled/{assemblyId}/`

## Workflow 6: Print-Readiness Tooling Review

This is the operator/review surface for generated print-tooling artifacts.

The page is `/jobs/{jobId}/print-readiness`. Operators usually reach it from `/operator` with `?operator=1`.

```mermaid
%%{init: {"flowchart": {"htmlLabels": false}} }%%
graph LR
  A["Operator opens print readiness page"] --> B["Operator reviews assembly"]
  B --> C["Run print tooling"]
  C --> D["Meshy analyze repair remesh analyze"]
  D --> E["Tooling results are saved"]
  E --> F["Human review remains required"]
```

Plain meaning:

- Print tooling is not the same as the customer preview.
- The customer preview remains the original textured GLB.
- Repair/remesh outputs are for operator review, Blender/slicer checks, and future fulfillment decisions.
- The current UI shows assembled original, repaired GLB, remeshed GLB, remeshed STL status, warnings, and approximate provider cost.

Meshy print-tooling endpoints:

- `/print/analyze`
- `/print/repair`
- `/remesh`

Current review rule:

- These fields do not unlock checkout by themselves. `figurinePreview.printReadiness` remains `needs_review` until a later explicit product decision changes the gate.

## Workflow 7: Operator Fulfillment Console

The `/operator` page is the print console for paid jobs and production movement.

```mermaid
%%{init: {"flowchart": {"htmlLabels": false}} }%%
graph LR
  A["Operator opens operator page"] --> B["Job list loads"]
  B --> C["Operator selects job"]
  C --> D["Accept paid job"]
  D --> E["Download bundle and start production"]
  E --> F["Print paint or ship"]
  C --> G["Reject for printing"]
  G --> H["Support note opens"]
```

Plain meaning:

- `/operator` is not where proof prompts are edited.
- It is where paid/production jobs move through fulfillment.
- It also links to the customer-style preview page and the print-readiness review page.
- Opening the console authorizes through `listOperatorJobs` and returns the first 50 server-ordered rows in the same request. Tabs retain their loaded rows while refreshing, and additional rows use a cursor-backed `Load more` request.

Current operator actions:

- Accept job.
- Download or inspect print bundle/files.
- Start production.
- Toggle painted jobs between printing and painting.
- Mark shipped with carrier and tracking number.
- Reject for printing, which also opens a support note.

## Current Style Matrix

| Style | Public by default | Proof mode | 3D workflow | What Vertex/Gemini does | What 3D provider does | What customer sees |
| --- | --- | --- | --- | --- | --- | --- |
| Chibi heroic fantasy male | Yes | `template_face_swap` | `creative_lab_figure` | Edits the enabled Chibi reference/template image with the customer's face/head identity. Prompt is sent exactly as written. | Meshy Creative Lab prototype creates the reviewable 2D concept, then the paid build creates the original textured GLB. | One Meshy concept image, then GLB preview after payment. |
| Chibi heroic fantasy female | Yes | `template_face_swap` | `creative_lab_figure` | Edits the enabled SheRa/Christina-style female template image with the customer's face/head identity. Prompt is sent exactly as written. | Meshy Creative Lab prototype creates the reviewable 2D concept, then the paid build creates the original textured GLB. | One Meshy concept image, then GLB preview after payment. |
| Chibi male | Yes | `generated_options` + `proofRendering: realistic_person` | `creative_lab_figure` | Creates one internal realistic full-body person cleanup render from the customer photo; the customer does not review this render. | Meshy Creative Lab prototype performs the chibi stylization and creates the reviewable 2D concept, then the paid build creates the original textured GLB. | One Meshy concept image, then GLB preview after payment. |
| Chibi female | Yes | `generated_options` + `proofRendering: realistic_person` | `creative_lab_figure` | Creates one internal realistic full-body person cleanup render from the customer photo; the customer does not review this render. | Meshy Creative Lab prototype performs the chibi stylization and creates the reviewable 2D concept, then the paid build creates the original textured GLB. | One Meshy concept image, then GLB preview after payment. |
| Heroic fantasy male | Yes | `template_face_swap` | `direct_multi_image_to_3d` | Edits the enabled Heroic Male template image with the customer's face/head identity. Prompt is sent exactly as written. | The paid build asks Hi3D for the direct textured GLB candidate by default; Meshy `meshy-6` remains the rollback provider. | One swapped direct-3D input, then GLB preview after payment. |
| Heroic fantasy female | Yes | `template_face_swap` | `direct_multi_image_to_3d` | Edits the enabled Heroic Female template image with the customer's face/head identity. Prompt is sent exactly as written. | The paid build asks Hi3D for the direct textured GLB candidate by default; Meshy `meshy-6` remains the rollback provider. | One swapped direct-3D input, then GLB preview after payment. |
| Super Hero Figure - Male | Yes | `template_face_swap` | `direct_multi_image_to_3d` | Edits the enabled superhero template image with the customer's face/head identity. Prompt is sent exactly as written. | The paid build asks Hi3D for the direct textured GLB candidate, then print analysis or operator review may run. | One swapped direct-3D input, then GLB preview after payment. |
| Super Hero Figure - Female | Yes | `template_face_swap` | `direct_multi_image_to_3d` | Edits the enabled Super Hero Female template image with the customer's face/head identity. Prompt is sent exactly as written. | The paid build asks Hi3D for the direct textured GLB candidate, then print analysis or operator review may run. | One swapped direct-3D input, then GLB preview after payment. |
| Emoji Avatar | No | `generated_options` | `creative_lab_figure` | Creates emoji/avatar proof options if enabled. | Creative Lab prototype/build. | Same as Creative Lab flow if made public. |
| Bobblehead | No | `generated_options` | `creative_lab_figure` | Creates bobblehead proof options if enabled. | Creative Lab prototype/build. | Same as Creative Lab flow if made public. |
| Cartoon Figure | No | `generated_options` | `creative_lab_figure` | Creates cartoon proof options if enabled. | Creative Lab prototype/build. | Same as Creative Lab flow if made public. |

## Prompt And Endpoint Summary

### Vertex/Gemini

Where: `apps/functions/src/aiProvider.ts`

Used for:

- 2D proof generation.
- Template face-swap proof generation.

Current model behavior:

- Code default: `gemini-3-pro-image`.
- Runtime override: `VERTEX_IMAGE_MODEL`.
- Route metadata: `direct-gcp-vertex-gemini-express`.

Generated-options prompt ingredients:

- Base proof prompt from Workflow controls.
- Selected style label.
- Selected style prompt.
- Customer source image.
- Enabled admin style reference images, if any.
- Natural standing pose and body-only/no-base constraints for figurines.

Template-face-swap prompt ingredients:

- The selected style prompt only, sent as the full Vertex instruction.
- First enabled reference image is the style template.
- Customer photo is attached as the reference identity image.

### Meshy

Where: `apps/functions/src/meshyFigurineProvider.ts` and `apps/functions/src/meshyPrintTooling.ts`

Used for:

- 3D preview generation after proof approval.
- Provider printability analysis, repair, and remesh.

Current app Meshy behavior:

- Creative Lab Figure is image-driven: `image_url` plus `name`; no text prompt field is sent by the app.
- Direct Multi-Image-to-3D is image-driven: `image_urls` plus model/settings fields; no text prompt field is sent by the app.
- Older experiment runners may contain Meshy text-prompt experiments, but the current app workflow controls style through Vertex proof/template images first.

Generation endpoints:

- `/creative-lab/figure/v1/prototype`
- `/creative-lab/figure/v1/build`
- `/multi-image-to-3d`

Print-tooling endpoints:

- `/print/analyze`
- `/print/repair`
- `/remesh`

## What Each Page Is For

| Page | Human purpose | Main component | Main backend calls |
| --- | --- | --- | --- |
| `/start` | Customer uploads a photo, picks style, starts generation. | `UploadFlow` | `getFigurineWorkflowConfig`, `createGenerationJob` |
| `/jobs/{jobId}` | Customer reviews 2D proofs and later the 3D preview. | `JobDetail` | Firestore snapshot, `approveGeneratedImage`, `updateFigurineBaseConfig`, `createCheckoutSession` |
| `/jobs/{jobId}?operator=1` | Operator-safe view of the same job page with signed asset URLs. | `JobDetail` | `getAdminJobPreview` |
| `/jobs/{jobId}/print-readiness` | Review assembled and print-tooling artifacts. | `FigurinePrintReadinessReview` | Firestore snapshot, `runFigurinePrintTooling` |
| `/jobs/{jobId}/print-readiness?operator=1` | Operator-safe print-readiness page with signed asset URLs. | `FigurinePrintReadinessReview` | `getAdminJobPreview`, `runFigurinePrintTooling` |
| `/admin` | Admin/support console and workflow controls. | `AdminDashboard`, `AdminWorkflowConfig` | `getAdminFigurineWorkflowConfig`, `saveFigurineWorkflowConfig`, support callables |
| `/operator` | Production/fulfillment print console. | `OperatorConsole` | `listOperatorJobs`, `getOperatorJob`, `operatorAcceptJob`, `operatorUpdateFulfillment` |

## Source Map

| Area | Files |
| --- | --- |
| Customer upload and style selection | `apps/web/app/start/page.tsx`, `apps/web/components/UploadFlow.tsx` |
| Customer proof and 3D preview page | `apps/web/app/jobs/[jobId]/page.tsx`, `apps/web/components/JobDetail.tsx` |
| Workflow controls UI | `apps/web/components/AdminWorkflowConfig.tsx`, `apps/web/lib/figurineWorkflowConfig.ts` |
| Workflow config backend | `apps/functions/src/figurineWorkflowConfig.ts`, `apps/functions/src/index.ts` |
| Vertex/Gemini proof generation | `apps/functions/src/aiProvider.ts` |
| Meshy 3D preview provider | `apps/functions/src/meshyFigurineProvider.ts` |
| Figurine preview warnings and style detection | `apps/functions/src/figurineWorkflow.ts` |
| Named base and assembly orchestration | `apps/functions/src/index.ts`, `services/print-file-generator/app/main.py` |
| Print-readiness page and Meshy tooling | `apps/web/components/FigurinePrintReadinessReview.tsx`, `apps/functions/src/meshyPrintTooling.ts` |
| Operator fulfillment console | `apps/web/components/OperatorConsole.tsx`, `apps/functions/src/index.ts`, `apps/web/lib/pipeline.ts` |
| Durable workflow docs | `docs/Workflows/figurine-and-operator-workflows.md`, style-specific docs under `docs/Workflows/`, `docs/PRINT_FILE_GENERATION_WORKFLOW.md`, `research/MESHY_SERVICE_IMPLEMENTATION_PLAN.md` |
