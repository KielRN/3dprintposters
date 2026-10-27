# 3DPrintPosters / 3DPrintYou — Roadmap

Status legend: 🟢 done · 🟡 in progress · ⚪ not started / deferred · 🔴 blocked

This roadmap is the durable product-status board. Keep it high-level and current; do not use it as a task dump, changelog, experiment log, or implementation scratchpad.

Source-of-truth split:

- `PROJECT_STATE.md` — compact current implementation state, active direction, and risks.
- `DECISIONS.md` — durable product and architecture decisions.
- `CHANGELOG.md` — completed changes and verification history.
- `docs/DESIGN.md` — front-end design system: brand, color/type tokens, landing-page architecture, and the hero scrub spec.
- `research/MESHY_SERVICE_IMPLEMENTATION_PLAN.md` — Meshy API findings, experiment results, and implementation backlog.
- `research/FIGURINE_FULFILLMENT_SUPPLY_CHAIN.md` — physical supplier research, RFQs, landed-cost comparisons, open questions, and sourcing decisions.
- `docs/Workflows/figurine-and-operator-workflows.md` and `docs/Workflows/figurine-style-workflow-contracts.md` — current figurine/customer/operator workflow contracts.
- `docs/MESHY_FIGURINE_UI_WORKFLOW.md` — PrintU-inspired figurine planning reference.
- `docs/PRINT_FILE_GENERATION_WORKFLOW.md` — poster-relief print-file service contract.
- `CHECKLIST.md` — archive pointer only.

## Phase A — Direction And Validated Preview

- 🟢 Product focus — active priority is customer acquisition through a PrintU-like personalized figurine workflow. Poster relief remains parked R&D.
- 🟢 Creative Lab preview pipeline — validated on 2026-06-07 with job `cfc9039a-d83c-48d7-9ed5-39f214fce6c6`: upload photo -> 2D proof -> approval -> Meshy Creative Lab Figure -> Storage-backed textured GLB preview.
- 🟢 Upstream 3D figure generation — Experiment 009 is the approved upstream milestone: three Creative Lab Figure API passes produced smooth no-base GLBs, and Blender inspection confirmed feet-sized bottom footprints rather than broad pedestal geometry.
- 🟢 Launch style scope — final launch catalog is Chibi-only as of 2026-08-26: **Chibi female**, **Chibi male**, **Chibi heroic fantasy female**, and **Chibi heroic fantasy male**. All four use Meshy Creative Lab; the heroic-fantasy Chibi pair uses template face swap and the photo-driven pair uses realistic-person cleanup. Other tested styles did not meet the owner's launch-quality bar and are excluded from the public launch catalog. Current IDs/contracts live in `docs/Workflows/figurine-style-workflow-contracts.md`; durable policy lives in `DECISIONS.md`.
- 🟢 Checkout honesty — normal figurine checkout unlocks at concept approval and queues the provider 3D build after payment; manual studio-review checkout is the explicit server-confirmed fallback path. Provider GLBs and print-readiness internals stay operator/support-only.

## Phase B — Figurine Print-Decision Workflow

- 🟡 Named base service — deterministic `figurine-square-v1` named-base service exists with `POST /v1/figurine/named-base`, `updateFigurineBaseConfig`, fresh artifact prefixes, and job-page preview controls. Manual lettering, slicer, and manifest approval are still needed before calling it product-approved.
- 🟡 Body/base assembly — deterministic body-on-named-base composition now exists in `services/print-file-generator` with explicit `150mm` body scaling, source preservation, GLB/STL/3MF exports, and `generateFigurineAssembly`. Real-job Blender/slicer validation is still required.
- 🟡 Print conversion/readiness — `runFigurinePrintTooling` now promotes the Exp 010-style provider path into Functions for assembled packages: Analyze, Repair, Analyze repaired, Remesh, and Analyze remeshed GLB/STL. The core decision remains open because Meshy Repair is textureless and Meshy Remesh may still fail printability.
- 🔴 Fulfillment path — first intended public purchase path is automated checkout for full-color partner fulfillment, but checkout remains blocked until the selected partner's file, quote, order, policy, landed economics, sample quality, and print-readiness requirements are validated. No path should imply automatic print readiness yet.
- 🟡 U.S./Mexico supply-chain comparison — three finished PolyX 3D samples cost `$300` total / `$100` each and passed the owner's initial visible-quality review, but that cost is too high for the intended painted-product margin. Resino Lab has returned the first Mexico response with a preliminary `$30-$55` unpainted estimate; itemized painted and landed-cost evidence, comparable samples, and a 5-10 unit pilot are still required. The working plan and evidence log live in `research/FIGURINE_FULFILLMENT_SUPPLY_CHAIN.md`.
- 🟡 AI-assisted multicolor cost reduction — U1 local connection, accessory slicing, upload, and first black-PLA accessory plate completion verified on 2026-10-24; plate 2 start accepted, physical fit/finish remains pending. Meshy and Hi3D multicolor tests completed on the same Chibi on 2026-10-21; Hi3D improved closed-volume mesh checks but did not improve facial color regions over Meshy cartoon. Chibi-specific U1 slicing, scale/filaments, physical finish, and economics remain unvalidated. Compare against the PolyX benchmark before selecting a production method. Current equipment state lives in `docs/PRINT_STUDIO_INVENTORY.md`, printer operations in `docs/SNAPMAKER_U1_OPERATIONS.md`, and experiment evidence in `research/FIGURINE_FULFILLMENT_SUPPLY_CHAIN.md`.
- 🔴 Public policy and economics — provider terms, cost ceilings, likeness/privacy rules, moderation, and customer-content limits still need explicit product decisions before public traffic.

## Phase C — Provider Boundary And Job State

- 🟡 Async/provider reliability — Meshy webhook receiver is deployed at `https://api.3dprintyou.com/webhooks/meshy`, fixture mode exists, and Meshy API retry handling now covers transient fetch failures.
- 🟡 Model history and retry controls — add richer model-generation history, visible retry/status controls, provider task IDs, status transitions, credits, failure reasons, and retry attempts without storing secrets.
- 🟡 Webhook/poll reconciliation — reconcile polling and webhook events into one Firestore-visible state model.
- 🟡 Asset ingestion — keep provider assets job-scoped and ingest them immediately because external retention can be short.
- ⚪ Cost, moderation, and quota gates — add cost ceilings, moderation checks, user-facing creation credits, server-side hard stops before provider-spend steps, and provider failure states before wider traffic.

## Phase D — First Purchase-Intent Funnel

- 🟢 Marketing landing surface — `/` in this app remains the scroll-scrubbed hero landing page (committed WebP frame sequence, Fraunces/Inter, warm token system, reduced-motion fallback); the creation flow moved to `/start` and the PWA `start_url` follows. The public SEO coming-soon surface is now the standalone 3DPrintYou Railway site at `https://3dprintyou.com`, reusing the same hero pattern without app functions.
- 🟡 Purchase-intent direction — target automated checkout for full-color partner fulfillment; implementation remains blocked on partner requirements, backend eligibility, and print-readiness validation.
- ⚪ Backend eligibility rules — wire checkout/preorder eligibility to backend job state, not only browser UI.
- ⚪ User credit ledger — track customer creation credits with atomic reserve/consume/refund adjustments, show remaining credits before generation, and tie usage back to `jobCost`.
- ⚪ Funnel analytics — track upload, proof generation, proof approval, 3D preview readiness, base-name edits, checkout/preorder intent, and abandonment.
- ⚪ Stripe production readiness — keep Stripe in test mode until the selected path is represented honestly and verified end to end.
- ⚪ Account and product rules — require verified email before public creation; document and enforce account lifecycle, likeness, minors/consent, celebrities/IP, unsafe content, refunds, retention, and manual-review rules.

## Phase E — Public Exposure And Ops

- 🟡 Domains — `https://3dprintyou.com` remains the canonical public coming-soon domain from `KielRN/3dprintyou` on Railway/Cloudflare. The full product-app candidate is separately live at `https://3dprintposters-production.up.railway.app` from this repo; `api.3dprintyou.com` remains the Meshy webhook custom domain. `www.3dprintyou.com` still needs its Railway custom domain or Cloudflare redirect before advertising it.
- 🟡 Product-app hosting — the Next.js app is deployed as a Railway standalone server in the same Railway project as the coming-soon service, while Functions, Auth, Firestore, Storage, and Stripe checkout remain on Firebase. The candidate uses the shared dev Firebase project and is not the public production launch. Remaining gates are a full browser sign-in/upload/proof/checkout smoke test, a dedicated production Firebase project, monitoring/abuse controls, and a branded app-domain or apex-cutover decision.
- 🟡 App-host indexing guard — the Railway candidate sends `X-Robots-Tag: noindex, nofollow, noarchive` and matching Next metadata, and the temporary host is absent from public sitemaps. When a branded app hostname is added, preserve the app-level guard and add/verify a host-specific Cloudflare response-header guard without applying it to the public SEO apex `3dprintyou.com` or webhook host `api.3dprintyou.com`.
- 🟢 Admin/operator role gate — `/admin`, workflow controls, support actions, refunds/requeues, `/operator`, and print-readiness tooling are server-enforced with Firebase Auth custom claims in the dev project as of 2026-07-11. Remaining ops work: verified-email hardening, usage-credit adjustments, fulfillment holds, and future scoped print-partner roles.
- ⚪ Role-management workspace — build an in-app admin workspace to grant and revoke admin/operator roles per account, replacing the manual `apps/functions/scripts/seed-auth-roles.mjs` script. Interim posture (2026-07-11): account creation is disabled on the `/operator` and `/admin` sign-in surfaces, and accounts self-created through customer UI receive no admin or operator claims — elevated roles are provisioned out-of-band only.
- ⚪ Print-partner portal — add scoped partner access for approved print-package downloads, download audit events, and partner cost capture for margin review.
- ⚪ Alerts and cleanup — add alerting for model cost spikes, failed webhooks, fulfillment failures, and storage growth; add cleanup jobs for abandoned uploads and expired artifacts.

## Phase F — Parked Or Later Work

- ⚪ Poster-relief tuning — deferred unless the relief product is reactivated. The current relief path has a real server-side generator, 400px mesh output, color packages, surface-intent metadata, and GLB inspection UI.
- ⚪ Additional figurine styles — direct Heroic fantasy, Super Hero, faithful/realistic, Bobblehead, Cartoon, Image pose, T-pose, and other variants are deferred beyond launch. Reconsider them only after the four Chibi launch styles are reliable and a later reviewed decision clears their output quality.
- ⚪ Direct Multi-Image-to-3D styles — the Hi3D provider path remains implemented for R&D/admin use, but its Heroic fantasy, Super Hero, and faithful/realistic styles are not launch offers after the 2026-08-26 physical-output review.
- ⚪ Native mobile packaging — defer until the web PWA proves the workflow.
- ⚪ Additional fulfillment geographies/providers — defer expansion beyond the active U.S./Mexico comparison until the first path has itemized quotes, comparable samples, and pilot evidence.

## PM Plan Workspace

Detailed PM plans should not live in this roadmap. When a roadmap item needs a temporary plan, create an ignored scratch folder:

```text
.tmp/pm-plans/YYYY-MM-DD-short-slug/
  plan.md
  implementation.md
  evidence.md
```

Use this workspace only when it materially helps the work. Keep `plan.md` focused on scope, decisions, risks, and done criteria. Keep `implementation.md` focused on the execution sequence and verification notes. Use `evidence.md` only when there is enough testing or review output to avoid cluttering the other files.

After implementation lands, delete the temporary plan folder. Move durable outcomes into the right permanent source: `CHANGELOG.md` for completed work, `DECISIONS.md` for durable product and architecture decisions, `PROJECT_STATE.md` for current state and risks, `research/MESHY_SERVICE_IMPLEMENTATION_PLAN.md` for Meshy technical findings, and this roadmap only when the traffic-light status or priority order changes.

Never store secrets, personal credentials, provider asset URLs with sensitive access, or long-lived human-task queues in `.tmp/pm-plans/`.
