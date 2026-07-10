# Changelog

All notable project changes will be documented in this file.

## [Unreleased] - 2026-07-10

### Added

- Added the Storyfront third scene plate and pre-generation contract: `scene-unboxing-plate` now seeds `admin/scene-plates/unboxing.png`, `onJobConceptReadyRenderScenes` starts bookshelf, desk, and unboxing renders when a figurine job's concept first becomes definitive, and `SCENE_PREVIEW_MODE=fixture` still keeps local scene renders off Vertex.
- Added the storyfront funnel pages (storyfront chat 3b, pages 1–4). `/start` is now a comic-story style gallery: a CSS-composed hero banner (tilted ink-border panels over a halftone field, art from committed WebP under `apps/web/public/storyfront/` with dimensions/alt consumed verbatim from `manifest.json`) above MakerLab-style cards rendered from `visibleWorkflowStyles()` with live config labels, per-style descriptions from `styleCardContent.ts` (unknown ids get the designed `DEFAULT_CARD`), and "New" chips on the two Super Hero styles. `/start/[styleId]` is the per-style project page: compact story banner, extracted `AuthPanel` + `UploadPanel` (drag-and-drop added; style locked to the route; unknown/disabled ids redirect to `/start`), a style context rail, and "Your heroes (N)" — the customer's previous generations via an owner-scoped `uid + updatedAt desc` snapshot query with thumbnail resolution (approved image → first non-placeholder generation → source photo) and status chips from the new unit-tested `jobPresentation.ts`. `/jobs/[jobId]/home` is the new page-4 claim surface: `SceneStage` (bookshelf/desk chips, fixture-verified pending/ready/failed states over the epilogue backdrop, always-visible honesty caption) plus `OfferBlock` (Painted & finished anchored first with "Most loved", no prices — "Final price at checkout.", exactly two true trust claims, 150mm scale SVG, checkout CTA live from the moment the approval guard passes — scene status never gates checkout). Direct `/home` visits without an approved concept bounce to the job page; the page-3 CTA fires the bookshelf render eagerly with a session marker so the deep-link kick never double-spends the capped renders.
- Added a minimal vitest rig to `apps/web` (`npm --workspace apps/web run test`) with 16 unit tests covering the `jobPresentation.ts` chip/thumbnail/name mapping and the `styleCardContent.ts` art/manifest/fallback contract.

### Changed

- `/jobs/[jobId]/home` now shows every Storyfront scene at once: bookshelf and desk side by side, with unboxing below and no scene chips. Legacy jobs still use the callable fallback for any missing scene, but new jobs rely on the server-side concept-ready trigger; the customer name collected at upload is the name baked into the base prompt.
- `/jobs/[jobId]` is restaged as the concept reveal for figurine customers: `ConceptStage` presents the concept as a staged object (clay mat, ink frame, warm vignette, directional shadow) with the kicker "You made this." and a once-per-job win moment (sessionStorage-gated, reduced-motion safe); multi-concept styles get a "Choose your hero." picker whose approval is the fast post-§4b path (60s client timeout; re-picking allowed until payment), and single-concept styles claim their concept from the page-3 CTA before navigating to `/home`. The journey strip, text-only base-sign confirmation ("Your base will read: ELLIE" — no customer GLB), saved-to-your-heroes reassurance, and the post-payment "Order received" panel complete the page. Customer figurine views render no `FigurineModelPreview`, named-base GLB, print-readiness link, or checkout UI (checkout moved to page 4); operator mode and the poster branch render the original layout unchanged. `UploadFlow.tsx` is retired (auth/upload logic lives in `AuthPanel`/`UploadPanel`).
- `updateFigurineBaseConfig` now skips the body/base assembly step when the job has no built figurine preview (the funded-build flow pre-payment) and returns `status: "saved"` with the persisted sign + named base, instead of failing the callable with the assembly precondition. Jobs with a built body (post-payment/legacy) still assemble exactly as before; the skip decision is the unit-tested `figurinePreviewReadyForAssembly` in `figurineBuild.ts`. Approved by Elliot 2026-07-10 as a follow-up to the §4b inversion.
- The 3a deploy hold is lifted: chat 3b's pages are on `main`, so functions + hosting should deploy together (3a backend semantics + 3b funnel UI).

### Fixed

- Fixed Chibi female Creative Lab prototype failures caused by oversized 2K face-swap outputs by resizing Creative Lab inputs to a provider-safe envelope before embedding them as Meshy data URIs. The `/start/[styleId]` upload panel now distinguishes completed uploads from later generation failures, and figurine callable failures now say "figurine concept" instead of "poster" when the concept step fails.

### Removed

- Removed `apps/web/components/UploadFlow.tsx` (superseded by the storyfront project page; git history preserves it).

## [Unreleased] - 2026-07-09

### Added

- Added the funded-build inversion backend (storyfront chat 3a, plan §4b). Figurine 3D asset generation now runs after payment: the Stripe `checkout.session.completed` webhook additionally stamps figurine jobs with `figurineBuild: { status: "queued", queuedAt, attempts: 0 }` (guarded — the stamp applies only when no `figurineBuild` record exists, so Stripe redelivery can never reset a running/finished build), and the new Firestore trigger `onFigurineBuildQueued` (`apps/functions/src/figurineBuild.ts`, 1800s timeout) transactionally claims `queued -> running` and runs `runFigurineBuild()` — the Meshy/Hi3D provider path extracted unchanged from the approval flow. Funded build failures stamp `figurineBuild: "failed"` with a sanitized error, open an admin-support note + `supportSummary` flag, and set order `fulfillment.productionSubState: "build_failed"`; they never surface as customer-facing job errors. The new admin callable `requeueFigurineBuild` (`ADMIN_SUPPORT_ALLOWLIST`-gated) recovers a failed build (`failed -> queued`, `attempts + 1`). `seed-dev-paid-order.mjs` mirrors the guarded queued stamp for dev/emulator payment simulation.
- Added the page-4 scene-preview backend: `generateScenePreview` callable (`apps/functions/src/scenePreview.ts`) places the customer's approved concept image into a home scene plate (`admin/scene-plates/{bookshelf|desk}.png`, seeded by the storyfront asset pipeline) via a Vertex `gemini-3-pro-image` edit call, stores the render at `generated/{uid}/{jobId}/scene-{sceneId}.png` (owner-readable under existing rules), records `scenePreviews[sceneId]` (`status`/`attempts`/`mode`) on the job doc, enforces owner access, returns cached renders, and hard-caps 2 Vertex renders per scene per job (`force` re-renders but never bypasses the cap). `SCENE_PREVIEW_MODE=fixture` copies the plate instead of calling Vertex so emulator/test flows stay off paid providers. `jobCost` now includes `scene_preview` phase rows per live render attempt (fixture renders cost nothing).
- Added unit tests for the new idempotency policies (`test/figurineBuild.test.mjs`: trigger gate, claim, requeue, webhook stamp) and scene decisions (`test/scenePreview.test.mjs`: cache/cap, concept-path resolution), plus a `jobCost` scene-row test. Verified end-to-end in fixture mode against the full emulator suite (37-check pass A): instant approval with `checkoutEligibility: concept_approved` and no build, webhook → queued → fixture build → `print-files/...` artifacts, the same webhook event delivered three times producing exactly one build (single `figurine build claimed` log line), forced failure → support surfacing → `requeueFigurineBuild` recovery, and scene fixture renders with the per-scene cap enforced.

### Changed

- `approveGeneratedImage` is now approval-only for figurine jobs: it validates exactly as before, stamps `approvedImagePath` + `status: "approved"` + `checkoutEligibility: { eligible: true, reason: "concept_approved" }`, and returns in seconds — no provider calls, no GLB build, no existing-preview mirror. Checkout unlocks at concept approval (the existing `canCheckout` client gate reads `checkoutEligibility.eligible`, so no web change was needed). The callable's timeout drops from 1200s back to the shared 540s print-file budget and its secrets shrink to `APP_STORAGE_BUCKET` + `PRINT_FILE_GENERATOR_URL`; poster approval behavior (in-call print-file generation) is unchanged.
- Extracted the figurine build provider path and shared job helpers (`runFigurineBuild`, local-mirror stack, `refreshJobCostFromFirestore`, `jobDataIsFigurine`, `firestoreSafeValue`, `buildLocalMirrorError`, `resolveRequiredEnv`) from `index.ts` into `apps/functions/src/figurineBuild.ts` (pure move; secret reads switch from `defineSecret().value()` to the equivalent runtime `process.env` reads). Exported `generateVertexImage`/`extractGeneratedImage`/`extensionForMimeType` from `aiProvider.ts` for the scene callable (additive).
- ⚠️ Deploy hold: do not deploy functions to production until chat 3b lands the new pages. Deployed, the new backend semantics run under the old UI — functional (checkout unlocks at approval; paid figurine jobs build via the trigger) but page 3 shows stale "preview pending" copy after approval instead of the new concept-reveal flow.

## [Unreleased] - 2026-07-08

### Added

- Added dedicated Heroic fantasy workflow docs for `heroic_fantasy_male` and `heroic_fantasy_female` under `docs/Workflows/`, covering the template-face-swap proof stage, Hi3D default direct provider path, Meshy rollback option, seed scripts, job-state shape, and checkout/readiness gating. Updated the workflow overview and source-of-truth docs to link those Heroic docs explicitly.
- Added Hi3D (Hitem3D) as the production 3D provider for direct Multi-Image-to-3D figurine styles. New `apps/functions/src/hi3dFigurineProvider.ts` implements the existing figurine provider contract against `api.hitem3d.ai` (Basic-auth token exchange, multipart `submit-task`, `query-task` polling, immediate GLB/cover download into Storage because result URLs expire after 1 hour). Live-validated 2026-07-08: `hitem3dv2.1` @ `1536fast` and `scene-portraitv2.1` @ `1536profast` both cost 25 Hi3D credits (~$0.50) and take ~7 minutes. Requires the new `HI3D_ACCESS_KEY`/`HI3D_SECRET_KEY` Functions secrets (set in Secret Manager and `apps/functions/.secret.local`).
- Added per-style 3D provider and model selection for direct Multi-Image-to-3D styles. Workflow styles now carry optional `provider` (`meshy` | `hi3d`) and `providerModel` fields validated against a shared `directMultiImageProviderCatalog` (Meshy: `meshy-6`; Hi3D: `hitem3dv2.1` general, `scene-portraitv2.1` portrait). The `/admin` Workflow controls show a `3D provider` dropdown, a `Provider model` dropdown, and a read-only config summary (resolution, texture mode, output format, credit cost, generation time) whenever a style uses `Multi-Image-to-3D direct`. Legacy saved styles without provider fields normalize to Hi3D `hitem3dv2.1`, making Hi3D the default path for `heroic_fantasy_male` and `heroic_fantasy_female`; selecting Meshy in the dropdown is the no-deploy rollback lever.
- Jobs now stamp `generated3dProvider` and `generated3dProviderModel` from the style config at creation, and `approveGeneratedImage` routes the 3D generation to the stamped provider. `figurineGeneration` and provider `metadata.json` record the provider and model; Hi3D outputs report `availableFormats: ["glb"]` with `printabilityTask: null` (Meshy printability analysis is Meshy-specific; the assembled-package Meshy print tooling still works on Hi3D GLBs because it takes a signed `model_url`).

### Changed

- Raised the `approveGeneratedImage` timeout from the shared 540s print-file budget to 1200s (server and matching web callable timeout) because Hi3D v2.1 generations run ~7-8 minutes plus asset transfer.
- Hi3D requests now send `pbr: 0` explicitly (Hi3D defaults PBR on; baked-texture-only matches the Meshy-era `enable_pbr: false` decision and shrinks GLBs), and the portrait model `scene-portraitv2.1` runs at its `1536pro` quality tier (30-45 credits) instead of `1536profast`.
- Ran the Hi3D face-quality experiment (6 paid runs, 240 credits): general vs portrait model × 2K template vs 4K Gemini re-render input, all `1536pro`/2M faces/PBR off, judged against Elliot's MakerWorld Hitem3D reference. Verdict: **`scene-portrait v2.1` @ `1536³ Pro Fast` wins; the 2K input is sufficient** (no 4K pipeline change). The portrait model option now runs `1536profast` (25 credits, reverting the brief `1536pro` bump), admin dropdown labels mirror the Hi3D console naming (`hitem3d v2.1` / `scene-portrait v2.1`, `1536³ Fast` / `1536³ Pro Fast`), and `hitem3dv2.1` remains the code default until the admin selects portrait per style. Experiment lesson recorded: Gemini re-render prompts focused on detail silently crop full-body compositions to 3/4 framing — any future 4K/upscale prompt needs an explicit "entire figure head to feet, do not crop/zoom" clause.
- `seed:heroic-workflow` and `seed:heroic-female-workflow` now seed `provider: "hi3d"` / `providerModel: "hitem3dv2.1"` on their styles.

## [Unreleased] - 2026-07-06

### Added

- Added the default public `Chibi female` style (`chibi_female`) as the female Creative Lab template-face-swap counterpart to Chibi. It uses `proofMode: "template_face_swap"` plus `generationWorkflow: "creative_lab_figure"`, stores one Meshy Creative Lab prototype concept for customer review, and continues Meshy build from the stored prototype task after approval. Added `npm --workspace apps/functions run seed:chibi-female-workflow` and the no-write `npm --workspace apps/functions run seed:chibi-female-workflow:dry-run` to upload `C:\Users\Eliud\Desktop\Styles\SheRa-ChatGPTv4 Christina.png` to `admin/workflow-style-references/chibi_female/shera-christina-template.png` and upsert the workflow config without committing the image. Added `docs/Workflows/chibi-female-face-swap-creative-lab-workflow.md` as the durable workflow doc.
- Added the default public `Heroic fantasy female` style (`heroic_fantasy_female`) as the female direct Multi-Image-to-3D counterpart to Heroic fantasy male. It uses `proofMode: "template_face_swap"` plus `generationWorkflow: "direct_multi_image_to_3d"`, shares the validated 2K Gemini Interactions proof route, and feeds the approved swapped image directly to Meshy Multi-Image-to-3D. Added `npm --workspace apps/functions run seed:heroic-female-workflow` to upload `C:\Users\Eliud\Desktop\Styles\Heroic Female.png` to `admin/workflow-style-references/heroic_fantasy_female/heroic-female-template.png` and upsert the workflow config without committing the image.
- Added an explicit per-style 3D workflow selector to `/admin` Workflow controls. Styles now choose either `Creative Lab API` or `Multi-Image-to-3D direct`; legacy saved styles default to Creative Lab. Added the default public `Heroic fantasy male` style (`heroic_fantasy_male`) after Chibi, wired to `template_face_swap` plus direct Meshy Multi-Image-to-3D using the exp 014/018 request shape (`meshy-6`, texture on, PBR off, remesh on, image enhancement on, lighting removal on, moderation on, GLB/STL/3MF, target polycount `100000`, pre-remeshed GLB saved). The direct workflow skips the Creative Lab concept gate: the Vertex face-swapped image is the customer-reviewed proof and the single direct-3D input. Added `npm --workspace apps/functions run seed:heroic-workflow` with `--dry-run` to upload the local-only `Heroic Male.png` template and upsert the workflow config without committing the image.
- Added an operator console at `/operator`, gated by a new `OPERATOR_ALLOWLIST` secret (admins on `ADMIN_SUPPORT_ALLOWLIST` are implicitly operators too, so the owner can exercise the operator view without a second allowlist entry). The console has three work-queue tabs (Available, My jobs, Shipped & Done) backed by read-only `listOperatorJobs`/`getOperatorJob` callables that return sanitized job summaries and signed preview/bundle/file URLs, plus a detail pane with stage-gated action buttons. Ship-to name/address and customer email stay hidden in both the list and detail views until a job reaches "accepted" or later, so operators cannot see customer PII on jobs they have not claimed.
- Added the fulfillment pipeline: a Paid -> Accepted -> In Production -> Shipped -> Completed lifecycle with reject/refund side paths, implemented as a shared stage/transition module (mirrored between `apps/functions/src/pipeline.ts` and `apps/web/lib/pipeline.ts`) exposing the full pipeline stage vocabulary, the narrower fulfillment sub-stage vocabulary, legal-transition rules, and a `derivePipelineStage` helper that prefers a stamped `jobs/{jobId}.pipelineStage`, then falls back to `orders/{jobId}.fulfillment.stage`, then legacy paid-order detection, then job status/product-type fields for pre-payment stages. `operatorAcceptJob` claims a paid job and builds a curated downloadable print-bundle zip (via `archiver`) of the approved proof, generated model, and print files. `operatorUpdateFulfillment` is a single discriminated-union callable covering start_production, set_production_substate, reject, and ship; rejecting a job also posts a note into the existing admin-support notes system so support has visibility. `adminRefundJob` issues a real, idempotency-key-protected Stripe refund (admin-only), and `adminSetFulfillment` is an admin escape hatch to force-complete, re-queue, or cancel a job outside the normal operator flow.
- Added the figurine paint option to figurine checkout: customers now choose painted or unpainted before paying, which selects between the `STRIPE_FIGURINE_PAINTED_PRICE_ID` and `STRIPE_FIGURINE_UNPAINTED_PRICE_ID` Stripe prices (falling back to hardcoded prices if the secrets are unset). Figurine checkout itself is unlocked for the first time behind `checkoutEligibility`; it was previously hard-blocked regardless of readiness.
- Added shipping-address and customer name/email persistence on payment. The Stripe `checkout.session.completed` webhook now reads customer/shipping details off the completed session and writes them onto `orders/{jobId}` alongside a freshly initialized `fulfillment` object (`stage: "paid"`, with `productionSubState`/`acceptedAt`/`acceptedBy`/`rejection`/`tracking`/`refund` all null and a `history` array seeded with the paid event); it also stamps `pipelineStage: "paid"` onto `jobs/{jobId}` so job-list queries can filter/sort on a single denormalized field instead of joining the order doc. None of this was captured before this change.
- Added a friendly pipeline-stage label and filter to the `/admin` Support jobs tab, plus a Fulfillment panel with Refund, Re-queue, and Mark-completed buttons wired to the new admin-only callables.
- Added temporary operator-console navigation for dev testing: `/start` now shows an `Operator` shortcut next to `Admin`, and `/operator` now has `Home` and `Admin` buttons in the Print Console header.

### Changed

- Documented the live standalone `3DPrintYou` coming-soon deployment: `https://3dprintyou.com` is now the canonical public SEO apex on Railway/Cloudflare from `KielRN/3dprintyou`, while `api.3dprintyou.com` remains the Meshy webhook Worker and `www.3dprintyou.com` still needs the Railway custom-domain or Cloudflare redirect follow-up.
- Changed the figurine base-name action so "Save name and generate base" always keeps the front name enabled and automatically generates the body/base assembly package after the named base is created. The print-readiness page no longer exposes a separate "Assemble package" action.
- Changed the job preview page's print-readiness CTA from "Open review" to a larger primary "Print Readiness" button.
- Changed the template-face-swap prompt contract on 2026-07-04 so the admin is never guessing what reaches the model: in face-swap mode the style prompt is sent to Vertex verbatim as the entire edit instruction (the built-in default is only a blank-prompt safety net), the `/admin` style card prefills the full default swap prompt when the mode is selected and relabels the field "Vertex face-swap prompt (sent exactly as written)", and the mode selector is now labeled "Image generation mode" with clearer option names.
- Rebranded the user-facing surface from "3D Print Posters" / "3D Posters" to **3DPrintU** (page titles, PWA `manifest.webmanifest`, `appleWebApp.title`, header/footer wordmarks, theme color). This is a brand-surface change only: the repo name, Firebase project id `gen-lang-client-0675309660`, env keys, the Cloud Storage bucket, and all source-code identifiers are unchanged.
- Moved the upload flow from `/` to `/start`. `/` is now the marketing landing page; the PWA `start_url` points to `/start`, and in-app "home" / "new order" links (admin, job, and order pages) follow. The `3dprintu.com` canonical domain is documented; production DNS/App Hosting custom-domain wiring and new brand icons/OG images remain follow-ups.

### Fixed

- Fixed Heroic fantasy template-face-swap proofs to use the Gemini Interactions image route when requesting 2K output, with `response_format.image_size: "2K"` and `aspect_ratio: "4:5"` validated once against the live API at 1856x2304 before the image goes to Meshy.
- Fixed the Heroic fantasy direct preview path to call Meshy Multi-Image-to-3D and direct printability through the versioned OpenAPI root (`/openapi/v1`) while keeping Creative Lab prototype/build on its base route, avoiding the immediate `404 NoMatchingRoute` failure after proof approval.
- Fixed first-open `/admin` transient callable failures by retrying warm-up style Firebase Functions errors (`internal`, `unavailable`, and `deadline-exceeded`) with backoff for Support jobs, Workflow controls, and operator preview pages instead of requiring a manual browser refresh.
- Fixed Workflow controls style visibility so the per-style `Show publicly` checkbox is the customer-facing visibility flag. Legacy configs with `visibleStyleCount` windows now normalize into real per-style public flags, defaults expose Creative Lab Figure, Chibi, Chibi female, Heroic fantasy male, and Heroic fantasy female while keeping future styles hidden/editable, and saves reject configs with no public styles.
- Fixed `/operator` calling `getConsoleRole` before Firebase Auth finished restoring the signed-in user, which could show a false "not on the operator allowlist" message even though the guest/dev account was valid. The print console now waits for `onAuthStateChanged` before checking console role.
- Fixed `/admin` Support jobs filtered lists showing a generic `INTERNAL` error when Firestore composite indexes were missing or still building. The support callable now detects missing-index failures, falls back to a recent-job scan for dev usability, and returns an actionable index message for unrecoverable cases.
- Fixed the admin workflow-config clobber path found on 2026-07-04: when `getAdminFigurineWorkflowConfig` failed (emulator restart, transient error), the `/admin` Workflow controls page silently showed built-in defaults with Save enabled, and saving overwrote the real `adminConfig/figurineWorkflow` doc with defaults — wiping saved prompts, reference images, and proof modes. The page now flags the fallback state, disables Save until a real config loads, and the save callable rejects invalid payloads with `invalid-argument` instead of normalizing them to defaults.
- Fixed the Chibi style being rejected with `Selected style is not available in the current workflow configuration` when the saved `adminConfig/figurineWorkflow` Firestore doc predates the chibi approval but already lists `chibi_figure` among its styles (the old defaults did) with `visibleStyleCount: 1`. The migration rule previously only reinserted a _missing_ chibi style; it now also moves an enabled-but-buried chibi style into the visible window right after the lead style and raises the visible count to 2. An admin-set `enabled: false` still hides it.
- Seated assembled figurine provider meshes slightly into the deterministic square base using a robust support-footprint plane, so provider outputs that include their own plinth no longer hover above the square base because of low outlier geometry or exact butt-joint placement.
- Allowed signed-in dev users to access `/admin` support/workflow callables in the local Functions emulator and documented dev Firebase project while keeping non-dev deployments on `ADMIN_SUPPORT_ALLOWLIST`.
- Moved deployed Firebase Functions runtime config values such as `APP_STORAGE_BUCKET`, `PRINT_FILE_GENERATOR_URL`, Vertex settings, and checkout URL/price config behind `defineSecret` / Secret Manager bindings so deploys no longer push local `.env` keys as plain Cloud Run environment variables.
- Fixed `runFigurinePrintTooling` Meshy print-tooling calls to use the current versioned OpenAPI root (`/openapi/v1`), so Analyze Printability no longer fails immediately with `404 NoMatchingRoute` from the stale `/openapi/print/analyze` path.
- Fixed the local Functions emulator fallback for `runFigurinePrintTooling` to send Meshy a `data:model/gltf-binary` URL when ADC cannot sign Cloud Storage URLs, avoiding provider-side `failed to download model file` and invalid data-URL MIME errors from Firebase token URLs.
- Made `runFigurinePrintTooling` non-blocking in local Functions emulator runs when user ADC cannot sign Cloud Storage URLs because no service-account `client_email` is available. The callable still uses signed URLs by default, but emulator-only print tooling now falls back to a data-URI `model_url` for the assembled GLB and records that URL source in `figurinePrintTooling`.
- Fixed multi-proof Vertex/Gemini generation so one failed proof option no longer fails the whole job when at least one proof image succeeds; the job records omitted proof failures in provider metadata.
- Fixed the reference-image prompt hierarchy so admin references control overall visual style, render style, character design language, outfit/costume, materials, and accessories while the customer photo controls face identity only.

### Added

- Added Support jobs actions for opening available job assets in the preview page and figurine print-readiness page. Operator-opened pages use the support-gated `getAdminJobPreview` callable to load the job and Firebase Storage media URLs without changing the regular customer owner-read path.
- Added the template-face-swap figurine flow on 2026-07-04. Workflow styles can now set `proofMode: "template_face_swap"` in the `/admin` workflow config: the style's first enabled reference image becomes a fixed template, `createGenerationJob` runs a single Vertex/Gemini face swap (the customer photo supplies identity only; template pose/costume/detail are preserved; output requested at 2K with the template's nearest supported aspect ratio) and submits the swapped image to a Meshy Creative Lab prototype task, storing Meshy's own figure concept as the job's single reviewable image (`conceptSource: "meshy_prototype_concept"`, `figurineConcept.prototypeTaskId`). The customer's "Generate 3D figurine" action then runs only the Creative Lab build phase from the stored prototype task, so build credits are spent only after concept review. The Meshy provider is split into reusable prototype/build phases with fixture-mode support, the legacy four-proof flow is unchanged for `generated_options` styles, and the job page and upload flow show concept-aware copy with a 9-minute client callable timeout.
- Wired the approved Chibi style into the customer workflow on 2026-07-03. The default figurine workflow config now exposes a "Chibi" style (`chibi_figure`) as the second visible style (`visibleStyleCount: 2`), with a proof prompt that forces a fully stylized chibi illustration per the Experiment 011 finding that Creative Lab builds its best chibi from a decisively stylized 2D input. Saved admin configs that predate the approval get the missing chibi style reinserted and made visible on read, while an admin-set `enabled: false` still hides it. Approving a Chibi proof flows through the existing Creative Lab Figure preview pipeline unchanged, and the job document now keeps the selected style id instead of overwriting `figurineStyle` with `creative_lab_figure` during preview generation.
- Approved the Chibi figurine style on 2026-07-03 from Experiment 011: a Creative Lab Figure prototype/build run fed a stylized 2D test image produced a chibi figure the user judged "way better than what we were doing before for chibi," with no generated base and the series-best raw printability (`warning`, watertight). Run artifacts live under `.tmp/experiments/meshy/standard/20260703-0853-exp-011-style-heman-creative-lab`.
- Ran the 2026-07-03 Meshy style experiment cycle (Experiments 011-019) and resolved the identity-vs-detail tradeoff for the faithful style: Experiment 014 set the direct-3d detail benchmark, Experiments 018a/b proved direct-3d output quality is stable run-to-run (poly counts within `0.2%`), and the Experiment 019 view-strategy bake-off showed a single Nano Banana Pro 2K identity-locked front image into direct Multi-Image-to-3D matches the benchmark detail with full subject likeness (exp-015's earlier detail loss was its ~1K input resolution). Extra side views and single-canvas turnaround sheets were rejected for the faithful style. Detailed findings live in `research/MESHY_SERVICE_IMPLEMENTATION_PLAN.md`.
- Added direct-3d (`--skip-multiview`) and faithful multi-view (`--direct-images`) modes to the standard Meshy experiment runner `scripts/meshy/run-standard-figurine-experiment.mjs`, submitting the source image or caller-provided view images straight to Meshy Multi-Image-to-3D without the Vertex/Gemini concept and Meshy multi-view steps, and fixed the runner to archive all `--direct-images` views under the run input folder.
- Added `docs/DESIGN.md` as the durable front-end design system: brand, color/type tokens, the landing-page architecture, the hero scroll-scrub spec, and the taste-skill design rationale. Referenced it from `README.md`, `AGENTS.md`, `CHECKLIST.md`, `AI_DEVELOPER_NOTES.md`, `PROJECT_STATE.md`, `DECISIONS.md`, and `docs/ROADMAP.md`.
- Added the 3DPrintU marketing landing page at `/`. A pinned, scroll-scrubbed `<canvas>` hero plays a 241-frame WebP sequence extracted from `3dprint-hero-seedance20.mp4` (desktop 241 frames at 1600px / ~7.2 MB, mobile 121 frames at 960px / ~2.4 MB, committed under `apps/web/public/landing/hero/`), driven by `apps/web/lib/useFrameScrub.ts` via `requestAnimationFrame` with no per-frame React state. The page composes `LandingHero`, `LandingSections` (how-it-works steps, a scroll-drifting gallery strip with placeholder tiles, a why block, and an ember CTA band), and a shared `LandingFooter`. `prefers-reduced-motion` and low-power devices (`deviceMemory`/`saveData`) get a static-frame hero that scrolls normally; copy and headings live in static DOM for SEO and screen readers.
- Added a warm 3DPrintU design-token system in `apps/web/app/globals.css` (`--ember #E8552E`, `--cream #F5F1EA`, `--ink #1A1714`, `--terracotta`, `--clay`, `--moss`, `--muted`) plus a Fraunces + Inter type pair via `next/font/google` and a `.display` utility for serif headings. Existing pages inherit through remapped legacy aliases without a redesign; top-level headings across `/start`, `/jobs/[jobId]`, `/admin`, and `/orders` adopt Fraunces and primary buttons read `--ember`.
- Added the first admin/support job view inside `/admin`. Firebase Functions now expose allowlist-gated support callables for listing sanitized job summaries, inspecting job/order/cost/error/audit state, and appending support notes with `open`, `watching`, `blocked`, or `resolved` status markers.
- Added per-style admin reference images for 2D proof generation. The `/admin` Style cards can upload up to four JPG/PNG references per style, saved workflow config stores normalized reference metadata under `admin/workflow-style-references/...`, and `createGenerationJob` passes the selected style's enabled references to Vertex/Gemini after the customer source photo while recording only reference counts/IDs on the job.
- Added a dev workflow admin page at `/admin` for proof-generation controls. It can edit the base proof prompt, the default four proof options per upload, how many Style options are shown, and each style's customer-facing prompt; role-based permission is recorded as a placeholder but not enforced yet.
- Added Firestore-backed figurine workflow configuration callables. `createGenerationJob` now reads the saved config, generates up to four proof images through the server-side Vertex/Gemini adapter, stores each proof as a separate `generatedImages` option, and persists the selected style label/prompt metadata on the job.
- Added per-job provider cost snapshots for figurine jobs. Firebase Functions now calculate `jobCost` after proof generation, Creative Lab preview generation, deterministic assembly refreshes, and Meshy print-tooling runs, separating exact Meshy credits from estimated USD assumptions and approximate Gemini proof-generation cost.
- Added `docs/BUSINESS.md` and `docs/figurine-job-cost-estimate-dc7f29eb.csv` as the first provider-cost baseline for the successful Meshy/Gemini figurine job, separating exact Meshy credits from approximate Gemini image-generation cost.
- Added `DECISIONS.md` as the durable product and architecture decision log, split current implementation state into `PROJECT_STATE.md`, and kept `AI_DEVELOPER_NOTES.md` as a compatibility pointer for older agent instructions.
- Updated agent Git guidance so commits and pushes default to landing directly on `main` instead of staying on feature branches or opening PRs.
- Added the 2026-05-23 customer-acquisition pivot: PrintU-like personalized figurines now outrank further poster-relief tuning until the business model is proven.
- Added Meshy/PrintU provider research in `research/FIGURINE_PROVIDER_RESEARCH.md`, including Meshy API output formats, Meshy-6/MakerWorld fit, pricing/retention notes, and webhook setup constraints.
- Added the Cloudflare Worker Meshy webhook receiver at `https://api.3dprintyou.com/webhooks/meshy`, with the default `workers.dev` trigger disabled and health/JSON POST smoke tests passing.
- Added `MESHY_WEBHOOK_SECRET` to the deployed Meshy webhook Worker as an encrypted Cloudflare secret, with live health verification that the binding is configured.
- Enforced Meshy webhook authentication using the real delivery header `x-meshy-api-webhook-secret-key`; unauthenticated POSTs now return `401`.
- Replaced the broad historical `CHECKLIST.md` with a short active Meshy-service checklist and archived the previous implementation checklist under `docs/archive/`.
- Moved the remaining active `CHECKLIST.md` task list into a local ignored archive and replaced the root file with a lean source-of-truth pointer so current status stays in `AI_DEVELOPER_NOTES.md`, `docs/`, and `research/`.
- Archived the tracked `human-tasks/` folder under `docs/archive/human-tasks-archived-2026-06-11/`; future agent-only handoffs should be response-first or short-lived notes under ignored `.tmp/human-tasks/`.
- Added `docs/MESHY_FIGURINE_UI_WORKFLOW.md`, mapping the PrintU screenshot sequence into the target Meshy-backed figurine UI and required backend services.
- Added a local Meshy Image to 3D runner and a living Meshy service implementation plan for API findings, run results, and backend backlog.
- Added repeatable Meshy experiment scripts for the Emoji/avatar Natural pose workflow: `scripts/meshy/run-emoji-natural-experiment.mjs` generates a Vertex/Gemini 2D concept and submits it to Meshy, and `scripts/meshy/analyze-printability-task.mjs` records Meshy printability results for a completed task.
- Added Experiment 002 setup with `scripts/meshy/run-emoji-natural-multiview-experiment.mjs` and `npm run meshy:exp-002-multiview`, preparing the next Meshy Image-to-Image multi-view -> Multi-Image-to-3D -> printability-analysis run.
- Ran Experiment 002 on 2026-05-25: Meshy Image-to-Image multi-view task `019e5ef8-cc6c-7540-9b86-f8d0f519bc9d` and Multi-Image-to-3D task `019e5ef9-cc0d-758e-b1c2-f0a61932e3b6` succeeded and downloaded GLB/STL/3MF assets; Meshy printability task `019e5efc-09fc-7db6-a22a-a4eb50f9b338` returned `error` because the model is not watertight.
- Added and ran Experiment 002 B with `npm run meshy:exp-002b-base`, using the PrintU-style base reference and `Elliott` front base label. Meshy generated strong multi-view base references, but the final 3D thumbnail appears to garble the lettering and printability still returned `error`.
- Closed Experiment 002/002 B as the Meshy-generated-base/text cycle and prepared Experiment 003 with `npm run meshy:exp-003-deterministic-base`, adding local post-Meshy deterministic PrintU-style round base and raised star geometry through `scripts/meshy/add_printu_star_base.py`.
- Ran Experiment 003 on 2026-05-25: Meshy Image-to-Image multi-view task `019e5fe6-81d9-7f24-9add-bbd37e6ff6f4` and Multi-Image-to-3D task `019e5fe7-81fc-742c-ab8a-8516bd549134` succeeded, downloaded assets, and exported deterministic postprocessed STL/GLB/3MF files with a PrintU-style star base; Meshy printability task `019e5fe9-c09e-7093-a81d-847899b14db9` still returned `error` because the original body is not watertight.
- Clarified the target deterministic figurine base architecture: use Vertex/Gemini and Meshy for the figurine/body object only, then use a saved base STL asset plus server-side deterministic Python services for customer name geometry and body/base assembly.
- Added Experiment 004 normalization support to the existing Meshy runner with `--normalize-artifact glb` and `npm run meshy:exp-004-normalize-glb`, plus `services/print-file-generator/scripts/normalize_meshy_artifact.py` for 3MF-height-based STL/3MF/GLB normalization.
- Smoke-tested Experiment 004 normalization against existing Experiment 002 artifacts without paid Meshy calls. Blender verified normalized GLB-source and STL-source outputs at about `32.86mm x 19.50mm x 75mm`; the STL-source output preserved the lower non-manifold edge count while GLB-source conversion remained seam-heavy.
- Ran paid Experiment 004 on 2026-05-25 local time: Meshy Image-to-Image task `019e619e-53d7-7c77-b65b-1aa28c788d97` and Multi-Image-to-3D task `019e619f-2529-7cb4-8d0c-1aaf57442e5e` succeeded, downloaded assets under `.tmp/experiments/meshy/exp-004-normalize-glb-2026-05-26T00-10-26-648Z`, and exported normalized GLB-source STL/3MF/GLB outputs; Meshy printability task `019e61a1-3a10-7302-8c37-b75b33732da6` still returned `error`.
- Fixed the local Vertex/Gemini concept prompt and Meshy multi-view prompt so body-generation runs explicitly request no base, pedestal, platform, plaque, or support prop; Meshy now also ignores/removes any base that appears in an upstream reference image unless `--base-label` is deliberately provided for a historical/base experiment.
- Added `scripts/meshy/run-standard-figurine-experiment.mjs` as the active end-to-end experiment runner: source photo -> Vertex/Gemini body-only concept -> Meshy multi-view -> Meshy 3D -> printability -> normalized STL/3MF/GLB outputs under `.tmp/experiments/meshy/standard`.
- Archived the legacy Meshy experiment runners under `scripts/meshy/archive/2026-05-26-legacy-runners/` and removed their npm aliases so future experiments use the standard runner.
- Clarified that the immediate Meshy implementation target is the UI workflow from `docs/MESHY_FIGURINE_UI_WORKFLOW.md`, starting with Image to Emoji/avatar-style figurine using Natural pose.
- Ran paid Experiment 005 on 2026-06-03 with `npm run meshy:exp-005-standard`: the standard body-only runner produced body-only concept/multi-view/model artifacts under `.tmp/experiments/meshy/standard/exp-005-standard-body-only-normalized-2026-06-03T22-59-59-472Z`, but Meshy printability still returned `error`.
- Ran Meshy Repair Printability on Experiment 005; the repaired GLB moved Meshy's follow-up printability result from `error` to `warning` and was imported into Blender as `exp005-repaired-body-scaled-review` for visual comparison.
- Ran Meshy Remesh on Experiment 005's original GLB with quad topology and `100000` target polycount; it produced GLB/STL/3MF comparison outputs but Meshy's follow-up printability analysis still returned `error`.
- Added Experiment 006 Creative Lab Figure support to the standard Meshy runner with short dated output folders and `npm run meshy:exp-006-creative-lab`. The 2026-06-04 run succeeded through prototype/build/analyze under `.tmp/experiments/meshy/20260604-exp006-creative-lab-raw` with local normalization skipped for Blender review; Meshy's prototype/build included a base and printability returned `error`.
- Ran Experiment 007 as another raw Creative Lab Figure pass with no prompt and no local normalization under `.tmp/experiments/meshy/20260604-1358-exp007-creative-lab-raw`. Meshy again generated a base, but this run did not add the mustache seen in 006; printability still returned `error`.
- Temporarily closed the Creative Lab Figure experiment track after Experiments 006/007 because the API provided low prompt/control surface and repeatedly generated a base. At that point, Multi-Image-to-3D became the next diagnostic path to inspect raw outputs before local normalization.
- Prepared Experiment 008 as a raw Multi-Image-to-3D provider-diagnostics run with `npm run meshy:exp-008-raw-provider-diagnostics`. The command skips local normalization, deterministic base composition, and Meshy's generation-time remesh, downloads the raw Multi-Image-to-3D artifacts first, then runs Meshy Analyze Printability, Repair Printability, and Remesh diagnostics with follow-up analysis of provider-modified outputs.
- Ran paid Experiment 008 on 2026-06-04 with raw Multi-Image-to-3D output and provider diagnostics. The raw body-only output landed under `.tmp/experiments/meshy/standard/exp-008-raw-multiview-provider-diagnostics-2026-06-04T23-06-01-301Z`; raw printability returned `error`, Repair Printability improved follow-up analysis to `warning`, and Remesh still returned `error`.
- Added and ran Experiment 009 as three raw Creative Lab Figure API passes with no local normalization under `.tmp/experiments/meshy/standard/exp-009-creative-lab-raw-pass-{1,2,3}`. All three prototype/build tasks succeeded, thumbnails look smooth and do not show an obvious generated pedestal from the preview angle, but Meshy printability analysis still returned `error` for each build.
- Approved Experiment 009's Creative Lab Figure API GLB generation as the current upstream figurine workflow milestone after Blender inspection confirmed smooth no-base figures. Experiment 010 should continue from the three existing Exp 009 GLBs, avoid new figure-generation spend, and test Meshy Analyze Printability, Repair Printability, and Remesh/format-export outputs as downstream print tooling.
- Added and ran Experiment 010 with `npm run meshy:exp-010-print-tools`, a downstream-only standard-runner workflow for existing Creative Lab GLBs. It used live build `model_url` inputs, created no new figure-generation tasks, exported Exp 010 comparison artifacts under `.tmp/experiments/meshy/standard/exp-010-creative-lab-print-tools`, and found the core tradeoff: Meshy Repair makes all three GLBs watertight but textureless, while Meshy Remesh keeps/returns texture-capable GLB/STL/3MF outputs but still fails Meshy printability analysis.
- Added preview-only figurine UI support for Storage-backed original textured Creative Lab GLBs. Jobs with `productType: "figurine"` and `figurinePreview.previewGlb` now render a color 3D model preview marked as not print-ready, and checkout remains locked for figurine jobs until a future print-ready fulfillment path is implemented.
- Added the first server-side Creative Lab figurine preview workflow in Firebase Functions. Creative Lab Figure jobs now branch from proof approval into a Meshy provider adapter, download the original textured Creative Lab `model.glb` into job-owned Firebase Storage, update `figurinePreview` with `preview_ready` / `needs_review`, and support fixture-mode local verification without paid Meshy calls.
- Validated and approved the official preview pipeline v1 on 2026-06-07. The normal browser workflow generated job `cfc9039a-d83c-48d7-9ed5-39f214fce6c6`, rendered the Storage-backed original textured Creative Lab GLB as a color figurine preview, showed `preview_ready` / `needs_review`, and kept checkout locked.
- Added local Functions emulator mirroring for Creative Lab figurine preview assets. When local mirroring is enabled, the Storage-backed `model.glb`, `metadata.json`, and optional `thumbnail.png` are copied under `.tmp/print-files/{uid}/{jobId}/figurine/creative-lab-original/` and recorded on `figurinePreviewLocalMirror`.
- Validated the first Meshy Creative Lab figurine plus square-base scale contract from job `f604d393-bfa2-4779-b05b-f6a2082604c9`. The raw Meshy `model.glb` and `.tmp/gold-standard/Figurine Standard Square Base/full_color/base.glb` now import together in a clean Blender scene without resizing; the target printable scale is `150mm` figurine height, using scale factor `78.978034802`, yielding an expected square base of about `105.24mm x 105.24mm x 24.00mm`.
- Added the first candidate reusable figurine base asset under `services/print-file-generator/assets/figurine-bases/printu-round-v1/`, including `base.stl`, `base.blend`, `base-review.png`, and `base.manifest.json`. The STL is a single-body sliced-round beveled pedestal with a flat front name face, locally verified watertight with consistent winding; product/slicer approval is still pending.
- Approved `printu-round-v1` as the reusable figurine base after Blender review of the centered `Elliott` raised-text preview. The clean base remains unpersonalized, and `previews/elliott/preview.metadata.json` now captures the accepted default text placement and sizing for deterministic name geometry.
- Added `MESHY_API_KEY`, `MESHY_WEBHOOK_URL`, and `MESHY_WEBHOOK_SECRET` placeholders to env examples without exposing local secret values.
- Added a now-archived human follow-up task for Meshy figurine evaluation, slicer/printability review, and dashboard-based webhook setup.
- Added AI 3D model generation research for the poster-relief pipeline.
- Added a print-file generator architecture roadmap evaluation recommending selective core-module extraction from `E:\PROJECTS\print-file-generator`.
- Added the first deterministic print-file generator pipeline with image normalization, luminance heightmaps, closed relief STL export, local/GCS storage adapters, artifact metadata, and regression tests.
- Added printability checks for relief bounds, base thickness, relief depth, triangle count, binary STL size, and watertight mesh edges.
- Added known-image metadata regression coverage and invalid-image endpoint error coverage for the print-file generator.
- Added GLB preview mesh generation for browser previews.
- Added proof-approval orchestration that calls the print-file generator, stores STL/GLB artifact paths on the job, and gates checkout on generated print files.
- Added a job-page GLB relief viewer backed by generated `preview.glb` artifacts.
- Added a job-page artifact inspection view with side-by-side approved proof, generated `heightmap.png`, `preview.glb`, warning details, and download buttons for baseline print artifacts.
- Added opt-in experiment 1 heightmap providers: `continuous_luminance` and `lithophane_baseline`.
- Added request-level relief tuning for height provider, contrast, gamma, post-heightmap smoothing, and 8-bit/16-bit heightmap PNG export.
- Added a local heightmap experiment runner that writes provider comparison bundles under `.tmp/experiments/experiment_1`.
- Added the opt-in experiment 2 `depth_anything_v2_small` semantic depth provider and wired it into local heightmap experiment runs.
- Added the opt-in `masked_depth_detail_blend` provider, combining semantic depth, subject masking, subject-only deterministic detail, guided-filter bas-relief compression, and the existing STL/GLB generator.
- Added request/experiment-runner controls for the hybrid provider's deterministic detail source and detail blend weight.
- Added hybrid output discovery to the quality-gate harness so `masked_depth_detail_blend` variants are reported alongside prior experiment providers.
- Added `composition_gradient_correlation` as the replacement composition-preservation quality gate for source image versus heightmap edge placement.
- Declared provider dependencies explicitly in the print-file generator package, including `requests`, `python-dotenv`, and experiment-only `trimesh`.
- Added the now-archived `human-tasks/` folder for human-owned validation, testing, decision, and external-action follow-ups after AI developer work.
- Added per-job print-file audit capture: provider-chain audit and segmentation status now flow into `metadata.json`, `jobs/{jobId}.printFileAudit`, and `jobs/{jobId}/audit/printFileGeneration`.
- Added a documented print-file generator test layout with `contract/`, `unit/`, `integration/`, and shared test support helpers for future color-package coverage.
- Added the PM/human-test handoff rule for full-product browser validation after AI implementation; this later became response-first with optional ignored `.tmp/human-tasks/` notes.
- Added explicit 5in x 7in image-window metadata and a 1/4in product border to print-file generator artifacts, making the default physical object 5.5in x 7.5in.
- Added deterministic full-color package outputs (`3MF`, `OBJ`/`MTL`/texture, `VRML`, `PLY`) plus filament painting palette, layer-swap guide, print settings, and quantized preview artifacts.
- Added shaped border/frame mesh geometry with an outer bevel, raised shoulder, and inner lip for the 5.5in x 7.5in relief object.
- Added local Functions emulator mirroring for generated print-file artifacts under `.tmp/print-files/{uid}/{jobId}` after proof approval.
- Added job-page GLB inspection controls for zooming, orbiting, and resetting the 3D relief preview.
- Added a 280px production relief resolution default with updated printability caps for 500,000 triangles and 25 MB binary STL output.
- Added image-window edge fade before mesh construction so generated relief settles into the shaped frame instead of carrying hard crop artifacts to the physical edge.
- Added server-side portrait region analysis for the print-file generator, including soft face oval, central face, eye, and mouth masks plus `face_analysis_status` metadata.
- Added a 768px geometry-analysis image and 400px mesh/color output default for the production relief path, with metadata for geometry-analysis dimensions.
- Added geometry-only proof cleanup, contour-smoothed subject masks, and nose-aware portrait relief shaping to reduce blocky subject edges, white outline ridges, rough shirt/background texture, and nose recession.
- Added hybrid relief debug artifacts under `debug/*.png` for geometry input, masks, detail maps, blended depth, relief depth, and final heightmap; local Functions mirroring now includes these debug artifacts.
- Added the Super Dad generated proof as the MVP relief north star in project direction docs, with smooth default surfaces and intentional texture called out as the next product-quality layer.
- Added roadmap/checklist direction for a surface-intent/material policy where smooth skin, scalp, neck, simple clothing, and backgrounds stay smooth unless text, logos, panel lines, hair, fabric, or another printable texture class is explicitly requested.
- Added the `super-dad-north-star-v1` proof-generation style contract for smooth printable poster art and intentional raised graphics.
- Added the print-file generator `smooth-default-v1` surface-intent/material policy schema, with metadata coverage for smooth skin/scalp/neck/hands/simple clothing/backgrounds and crisp text/logos/panel lines.
- Added v1 inferred surface-intent masks to the print-file generator, including smooth, crisp, texture, smoothing, and detail-gate debug artifacts plus `surface_intent_status` metadata.
- Added `surfaceIntentStatus` capture to the Functions print-file audit when `metadata.json` includes inferred surface-intent status.
- Added a graphic emboss mask/layer for the hybrid relief path so inferred text, logos, emblems, and graphic edges can be deliberately raised without allowing random proof texture into smooth regions.
- Added `surface-intent-emboss-mask.png` debug output and `surface_intent_status.roughness_metrics` for smooth-subject, flat-background, and crisp-graphic region review.
- Added approved-relief training protocols for working backward from human-approved production STLs into gold-master heightmaps, masks, QA renders, deterministic-generator tuning, and future LoRA/ControlNet datasets.
- Added a Blender MCP setup handoff task for the next chat so gold-master STL review can begin with an MCP-controlled Blender session.
- Added the first reusable square figurine base service asset `figurine-square-v1` under `services/print-file-generator/assets/figurine-bases/`, derived deterministically by `scripts/promote_square_base_asset.py` from the personalized gold-standard sample: the baked `Elliott` lettering bodies are removed, the structural bodies are boolean-unioned into a single watertight `105.24mm x 105.24mm x 24.00mm` STL, and `base.manifest.json` records the sloped front name-panel plane, panel rectangle, and the approved sample lettering style (raised `1.94mm` proud, embedded `0.52mm` behind the panel).
- Added the deterministic customer-name geometry service `app/figurine_name_base.py` in the print-file generator: server-side sign-name validation (12-character cap, letters/digits/space/hyphen/apostrophe/period), DejaVu Sans Bold lettering condensed 0.8x to match the approved sample proportions, target 10mm cap height with shrink-to-fit and a 4mm legibility floor, manifold boolean union into one watertight mesh, and STL/3MF/raw-scale preview GLB exports with metadata and checksums. This replaces the garbled Meshy-generated base text rejected in Experiment 002 B.
- Added `scripts/compose_named_base.py` CLI for local named-base composition; sample outputs for `Elliott`, `Sophie-Jay`, and `Maximilliana` live under `.tmp/experiments/named-base/`.
- Added the `POST /v1/figurine/named-base` print-file-generator endpoint, returning named-base artifact paths, lettering metadata, and composed-mesh stats, with `422` responses for invalid sign names.
- Added the `updateFigurineBaseConfig` Firebase callable: validates job ownership and figurine product type, persists `baseConfig` (shape, baseId, sign enabled/text) on the job, calls the named-base endpoint when the sign is enabled, stores `figurineNamedBase` artifact metadata, and mirrors named-base artifacts to `.tmp` like the preview pipeline.
- Added the base name sign panel to the figurine job page: once the Meshy Creative Lab GLB preview is displayed, the customer can toggle a name sign, enter a name (client-side validation mirroring the server's 12-character/character-set rules), and call `updateFigurineBaseConfig` to generate the deterministic named square base. The panel shows the persisted `baseConfig`/`figurineNamedBase` state, generation warnings, and an orbitable preview of the generated `named-base-preview.glb`.
- Added the deterministic assembled-figurine endpoint `POST /v1/figurine/assemble` in the print-file generator. It loads the original Creative Lab GLB plus generated named-base STL, rotates the likely body up-axis to Z, scales the body to `150mm`, aligns it to the base top plane, preserves source artifacts, and exports `assembled-preview.glb`, `assembled.stl`, `assembled.3mf`, and `metadata.json`.
- Added Firebase callables `generateFigurineAssembly` and `runFigurinePrintTooling`. Assembly persists `figurineAssembly` artifacts under `print-files/{uid}/{jobId}/figurine/assembled/{assemblyId}/`; print tooling signs the assembled GLB for Meshy `model_url`, runs Analyze, Repair, Analyze repaired, Remesh with quad/100000 `glb,stl,3mf`, and Analyze remeshed GLB/STL, then stores sanitized `figurinePrintTooling` state and downloaded provider outputs without changing checkout eligibility.
- Added `/jobs/{jobId}/print-readiness`, with assembled original, repaired, and remeshed comparison panels plus assemble/tooling actions. The existing customer job page still shows the original textured Creative Lab GLB as preview-only and links to this review page only after a named base exists.
- Added focused assembled-figurine tests covering output artifacts, 150mm scale metadata, source preservation, and missing input validation.
- Fixed the named-base Firestore write rejected with `Property figurineNamedBase contains an invalid nested entity`: the generator's `composed.boundsMm` is an array of arrays, which Firestore forbids, so `updateFigurineBaseConfig` now reshapes it to a `{min, max}` map before persisting. Unexpected named-base failures now log the error/stack to the Functions console and surface as a readable `Base sign generation failed: ...` message instead of a bare `INTERNAL` in the UI. The deterministic base path never calls Meshy; base + lettering remain fully server-side from the `figurine-square-v1` gold-standard-derived asset.
- Fixed repeated base-name edits on figurine jobs: each `updateFigurineBaseConfig` generation now writes named-base artifacts under a fresh generation prefix so changing `Elliiott` to `John` refreshes the GLB preview instead of reusing the browser-cached `named-base-preview.glb`; saving with the sign disabled also clears the old `figurineNamedBase` state.
- Fixed transient-network fragility in the Meshy Creative Lab provider: a single socket-level `fetch failed` on the figure build creation call killed a completed multi-minute prototype run (job `dd73d9d7-009b-4f92-9b65-baf9681c5f6c`, 2026-06-10 browser test). `meshyJson` now retries network failures (GETs up to 3 attempts including transient 429/5xx poll responses, POSTs up to 2 attempts because duplicated create-task requests can consume credits), the figurine failure path now logs the error and stack to the Functions console instead of only writing it to Firestore, and stored generation errors now include the fetch error cause.

### Changed

- Changed local Functions secret guidance so Firebase `defineSecret` values use ignored `apps/functions/.secret.local` in emulator runs, and Meshy Creative Lab task failures now preserve sanitized provider `task_error` details in logs and stored job errors.
- Changed the active product priority from poster-relief quality tuning to proving a PrintU-like figurine funnel with `3dprintyou.com` as the better-fit public domain candidate.
- Changed docs to clarify that image-to-3D providers were rejected for poster relief only, and are now valid candidates for standalone figurines.
- Changed roadmap/checklist/architecture/README/PRD positioning so Meshy is the first generated-3D provider candidate and the existing relief path is parked R&D.
- Changed PM and architecture docs to make the next implementation slice explicit: create figurine workflow services for source validation, 2D concept history, Meshy task tracking, asset ingestion, readiness, editor configuration, and checkout/preorder gating.
- Changed the default hybrid relief path to lean back toward HueForge/lithophane behavior: `lithophane_baseline` now contributes to the subject height signal, default `detail_weight` is `0.38`, bas-relief compression is less aggressive, and final subject/portrait smoothing is reduced so facial/body/graphic detail is not flattened away.
- Updated roadmap, checklist, README, architecture, workflow, service, and developer notes to make deterministic closed-relief generation the next print-file implementation slice.
- Wired the print-file generator `/v1/generate` route to produce real baseline artifacts when the selected image is readable from local filesystem or GCS storage.
- Raised the print-file generator's default decoded source-image limit to 4,000,000 pixels so normal AI proof images can be resized into relief artifacts.
- Added dev Firebase Storage CORS configuration so browser-based Three.js previews can fetch generated `preview.glb` artifacts.
- Tuned deterministic relief heightmaps to smooth noisy proof texture into broader poster-like depth bands while retaining softened edge detail.
- Stabilized the job-page GLB preview framing and added a regenerate action for approved 3D previews.
- Renamed the server-side Storage bucket env var to `APP_STORAGE_BUCKET` because Firebase Functions reserves the `FIREBASE_` prefix.
- Updated local PWA behavior so the service worker does not cache stale localhost development bundles.
- Replaced the earlier `posterized_luminance` print-file generator default with the chosen hybrid provider path.
- Corrected closed-relief mesh orientation so STL/GLB outputs preserve the source image's upright top-to-bottom direction.
- Made `lithophane_baseline` the production in-mask detail source for the hybrid provider.
- Tuned `masked_depth_detail_blend` to damp deterministic lithophane detail, smooth broad subject-surface roughness such as shirt texture, and further smooth detected eyes, mouth, and central-face skin while preserving low-frequency semantic shape and stronger structural edges.
- Added height-provider policy metadata and warnings so deterministic brightness-to-height providers are explicitly marked as fallback-only, not the target production-quality path.
- Updated the repo PM skill and agent guide to create or summarize human follow-up tasks during handoffs; this later moved to response-first handoffs with optional ignored `.tmp/human-tasks/` notes.
- Promoted `masked_depth_detail_blend` with `lithophane_baseline` detail source into the default web approval flow and print-file generator defaults.
- Changed hybrid relief generation to fail loudly when required depth or segmentation providers are unavailable instead of quietly substituting a lower-quality result.
- Condensed `AI_DEVELOPER_NOTES.md` into compact durable memory and aligned `AGENTS.md` plus the repo PM skill around source-of-truth boundaries.
- Changed default relief geometry from a full-bleed 5in x 7in plate to a 5in x 7in relief window inside a 5.5in x 7.5in physical object.
- Replaced placeholder color-package and filament-painting warnings with generated artifact checks in the print-file readiness summary.
- Changed generated `preview.glb` files from neutral material previews to image-colored previews using vertex colors sampled from the normalized proof image.
- Removed `scikit-image` from the print-file generator quality-gates extra because composition scoring no longer depends on SSIM.
- Changed the bordered relief mesh from a flat perimeter ring to a shaped product frame while preserving the 5in x 7in image window and 1/4in border dimensions.
- Removed customer-facing print-file download buttons from the job review preview while keeping proof, heightmap, GLB preview, and printability inspection.
- Changed the job-page GLB preview from a passive animated model to a stable inspection viewer with explicit zoom controls.
- Changed the job-page artifact layout so the approved proof and heightmap stay in the comparison row while the GLB preview gets a larger full-width inspection panel underneath.
- Changed the Functions approval flow and print-file generator defaults from a 200px to 280px working relief width.
- Changed the Functions approval flow and print-file generator defaults from a single 280px working relief width to 768px geometry analysis, 400px mesh output, 1,000,000 triangle cap, and 50 MB binary STL cap.
- Extended the proof-approval callable and browser callable timeout to 9 minutes so the production hybrid relief path can finish before the client reports an internal timeout.
- Changed local artifact mirroring so approved jobs become `generated` before the optional `.tmp` mirror downloads every print-file artifact.
- Removed the hybrid provider's nose-specific height boost after Blender review showed a puppet-like nose. The path now uses lower default detail weight, broader face-oval smoothing, and a face/forehead pit guard instead of creating a nose protrusion.
- Tightened Super Dad surface-intent smoothing by reducing default subject detail leakage, increasing smooth subject/background damping, and protecting only stronger graphic emboss regions from broad smoothing.
- Changed the relief-quality roadmap from raw subject-detail recovery toward controlled proof-to-print manufacturing: the customer photo is identity input, while the approved generated proof and surface-intent policy should determine printable geometry.
- Changed AI generation metadata to store the selected style contract metadata instead of raw prompt text.
- Changed `masked_depth_detail_blend` to gate deterministic detail through inferred surface intent, smooth scalp/neck/ear/body/background regions beyond face masks, keep crisp text/logos/graphic edges raised, and allow shallow material texture only when explicitly requested by proof-generation or human override metadata.
- Split the print-file generator depth/heightmap implementation into focused modules while preserving `app.depth` as a compatibility facade.

### Verified

- Verified the template-face-swap chibi flow end to end in the real browser workflow on 2026-07-04: customer photo upload -> Vertex face swap onto the admin template -> Meshy Creative Lab prototype concept review -> customer-triggered build -> textured GLB preview. Elliot approved the result ("works great"); the Chibi style runs in `template_face_swap` mode with the stylized template reference and the verbatim Vertex prompt saved in the workflow config.
- Verified a live Meshy Image to 3D task succeeded from `.tmp/Profile-Pic-HIMSS.jpg`, downloaded GLB/STL/3MF artifacts under `.tmp/print-files`, and exposed slicer-readiness risks for the first raw-photo output.
- Verified the first proof-driven Emoji/avatar Natural pose Meshy task `019e5c65-7b2b-7641-abd6-ed04fb4e3d2e` succeeded from a generated full-body concept, consumed `30` credits, downloaded GLB/STL/3MF artifacts under `.tmp/experiments/meshy/emoji-natural-2026-05-24T23-50-06-305Z`, and produced a visually complete stylized figurine.
- Verified Meshy printability analysis task `019e5c69-3d55-76ec-aecf-7cd728e6ed38` consumed `0` credits and returned `error` because the model is not watertight and has non-manifold/degenerate geometry.
- Verified Experiment 002 setup scripts parse locally without starting paid provider tasks.
- Recorded Elliot's Blender review that the first Meshy GLB is viewable but not the intended product style.
- Verified `services/print-file-generator` tests pass.
- Verified Firebase Functions build after print-file audit persistence changes.
- Verified the reorganized print-file generator test suite still collects and passes all 62 tests.
- Verified Depth Anything V2 Small experiment outputs for both canonical local input images under `.tmp/experiments/experiment_2`.
- Verified mesh orientation with a regression test that maps the image top row to positive model `Y`.
- Verified `masked_depth_detail_blend` with unit coverage for subject-only detail blending and deterministic detail-source switching.
- Verified both canonical inputs with hybrid lithophane and posterized detail-source runs under `.tmp/experiments/hybrid`.
- Verified the print-file generator test suite passes with the bordered physical object defaults.
- Verified color-package generation with focused Python contract/unit tests, Functions build, and web typecheck.
- Verified color preview GLB generation with focused print-file generator unit and contract tests.
- Verified shaped border/frame geometry with the full print-file generator test suite.
- Verified the web typecheck after adding job-page GLB inspection controls.
- Verified the full print-file generator test suite and Firebase Functions build at the 280px production default.
- Verified focused print-file generator unit and contract coverage for geometry-analysis resampling, contour smoothing, geometry cleanup, and nose-aware shaping.
- Verified the full print-file generator suite, Firebase Functions build, and web typecheck after promoting the 400px/768px relief-quality path.
- Verified focused print-file generator unit/contract tests and Firebase Functions build after removing the nose boost, adding the face pit guard, reducing texture detail, and returning debug artifact paths.
- Verified the full print-file generator suite, Firebase Functions build, and web typecheck after adding the Super Dad style contract and surface-intent schema.
- Verified the full print-file generator suite after adding inferred surface-intent masks and detail/smoothing gates.
- Verified the full print-file generator suite passes after the depth module split.
- Verified 13 focused unit tests for figurine sign-name validation, name-panel manifest loading, lettering plane placement, panel-bounds containment, and watertight named-base composition.
- Verified the Functions TypeScript check passes after adding `updateFigurineBaseConfig` and the named-base generation bridge.
- Verified composed named bases stay watertight and inside the base footprint for short, hyphenated, and 12-character names, with front-view depth renders matching the gold-standard Elliott sample.

## [Unreleased] - 2026-05-05

### Added

- Added Firebase client initialization for the web app, including optional local emulator wiring.
- Added web sign-in controls for email/password accounts and anonymous guest sessions.
- Added authenticated source-photo upload to Firebase Storage under `uploads/{uid}/{jobId}/source.{jpg|png}`.
- Wired the web flow to call `createGenerationJob` with the uploaded Storage path, selected style, and generated job id.
- Wired checkout to call the authenticated `createCheckoutSession` Firebase Function with the real job id instead of the local preview placeholder.
- Added responsive UI status/error states for auth, upload, job creation, and checkout readiness.
- Added a job proof review route at `/jobs/[jobId]` with approval controls.
- Added an `approveGeneratedImage` callable Function and gated checkout until a proof is approved.
- Added an order status route at `/orders/[orderId]` for payment, proof, and fulfillment state.
- Added a separate `NEXT_PUBLIC_USE_FIREBASE_FUNCTIONS_EMULATOR` switch so local callable Function testing can run without moving Auth, Firestore, and Storage to emulators.
- Added Firebase App Hosting as the selected first public web hosting target and checked in `apps/web/apphosting.yaml`.
- Added a checked-in `.firebaserc` with local `dev` and `default` aliases for `gen-lang-client-0675309660`.
- Wired `createGenerationJob` through the server-side AI provider adapter and persisted non-secret generation metadata on the Firestore job.
- Added idempotency guards for repeated job creation calls and Stripe Checkout session creation, with a new checkout attempt key after an expired session.
- Added npm scripts for Firestore rules, Storage rules, combined rules, and rules dry-run deployment.
- Added npm scripts for function-only and full Firebase emulator startup, including a JDK 21+ preflight for the full suite.
- Initialized the dev Firebase Storage default bucket at `gen-lang-client-0675309660.firebasestorage.app` in `US-CENTRAL1`.
- Added a direct Vertex/Gemini proof-generation request that reads the uploaded source image and stores the generated proof in job-scoped Firebase Storage.
- Added PWA icon assets, service worker registration, and a browser-gated install control.

### Changed

- Tightened `createGenerationJob` validation so job ids are client-provided but constrained, unique, and tied to the signed-in user's upload path.
- Changed the generation path to create a durable `generating` job, call the direct Vertex/Gemini adapter, and publish the generated proof image instead of using the uploaded source image as the proof.
- Changed checkout order creation to use the job id as the deterministic order document id for the current one-order-per-job MVP path.
- Updated the relief preview to show the MVP 5in x 7in dimensions as `127mm x 178mm` and keep the canvas framed on mobile.
- Updated `.gitignore` so source files under `apps/web/lib` can be tracked while generated package `lib` folders remain ignored.
- Updated checklist and docs to reflect proof approval, checkout gating, single-order status, current local testing, Firebase App Hosting, and the staging-first DNS plan.

### Verified

- Verified web and Functions TypeScript checks.
- Verified Firestore rules compile successfully through a Firebase deploy dry-run.
- Verified Storage rules compile successfully through a Firebase deploy dry-run.
- Deployed Firestore and Storage rules to the dev Firebase project.
- Verified the Next.js production build.
- Verified the local Next.js app route responses for `/`, `/jobs/test-job`, and `/orders/test-order`.
- Verified the Functions emulator loads `createGenerationJob`, `approveGeneratedImage`, `createCheckoutSession`, and `stripeWebhook`.
- Verified the full emulator preflight reports the current Java 17 install and blocks before starting the JDK 21+ dependent suite.
- Verified desktop and mobile rendering through a headless browser smoke check, including nonblank 3D canvas pixels and no mobile horizontal overflow.

### Known Limitations

- Public web hosting is not configured yet; testing is local at `http://localhost:3000`.
- The full Firebase emulator suite remains blocked on this machine until JDK 21+ is available, but the checked-in full-suite workflow now fails early with a clear preflight message.

## [Unreleased] - 2026-04-26

### Added

- Chose direct GCP Vertex/Gemini as the first MVP AI route and added a Functions provider adapter boundary for a future Cloudflare AI Gateway route.
- Added `services/print-file-generator` as the broader Cloud Run service scaffold for relief geometry, full-color print packages, and filament painting support files.
- Added a print file generation workflow doc and artifact manifest covering STL, 3MF/OBJ texture package, preview, metadata, palette, layer swaps, and print settings.
- Verified Cloudflare account API token access for account-scoped API calls.
- Verified Cloudflare can resolve the `3dprintposters.com` zone through the API.
- Verified AI Gateway API access for the Cloudflare account; no gateway is configured yet.
- Verified Google/Gemini/Vertex API keys with small live Gemini and Vertex AI requests.
- Repaired local `gcloud` usage, configured the project, and created Application Default Credentials for local Google client libraries.
- Updated product and conversion docs for a 5in x 7in target relief and Mimaki 3DUJ-2207 print-partner strategy.
- Added AI-provider environment placeholders and deployment notes.
- Added this documentation cleanup path for project progress, roadmap, and Cloudflare setup tracking.

### Planned

- Create the project AI Gateway after choosing the first provider and model strategy.
- Choose the first production hosting target before adding final Cloudflare DNS records.

## [Unreleased] - 2026-04-25

### Added

- Created initial monorepo architecture for web app, Firebase functions, Python STL service, and infrastructure docs.
- Added product implementation checklist and high-level architecture documentation.
- Added secret-safe `.gitignore` patterns for local env files and GCP/Firebase JSON keys.
- Added initial Next.js mobile-first PWA scaffold.
- Added initial Firebase Functions scaffold for job creation and Stripe checkout/webhook boundaries.
- Added initial Python Cloud Run service contract for image-to-STL conversion.
- Installed workspace dependencies and generated `package-lock.json`.
- Verified TypeScript checks for web and functions workspaces.
- Verified the Next.js production build.
- Created Stripe test product and $60 USD one-time price for the physical poster workflow.
- Updated checkout scaffolds to use `STRIPE_POSTER_PRICE_ID` when configured.
- Verified local checkout session creation returns a Stripe Checkout URL with a $60 USD total.

### Planned

- Connect Firebase Auth, Firestore, and Storage to the web UI.
- Wire the selected AI provider behind a server-side job pipeline.
- Implement the STL conversion pipeline and printability checks.
- Connect Stripe checkout and the selected Mimaki-capable fulfillment partner in test mode.
