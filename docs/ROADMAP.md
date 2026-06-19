# 3DPrintPosters / 3DPrintYou — Roadmap

Status legend: 🟢 done · 🟡 in progress · ⚪ not started / deferred · 🔴 blocked

This roadmap is the durable product-status board. Keep it high-level and current; do not use it as a task dump, changelog, experiment log, or implementation scratchpad.

Source-of-truth split:
- `PROJECT_STATE.md` — compact current implementation state, active direction, and risks.
- `DECISIONS.md` — durable product and architecture decisions.
- `CHANGELOG.md` — completed changes and verification history.
- `research/MESHY_SERVICE_IMPLEMENTATION_PLAN.md` — Meshy API findings, experiment results, and implementation backlog.
- `docs/MESHY_FIGURINE_UI_WORKFLOW.md` — target customer UX and job contract.
- `docs/PRINT_FILE_GENERATION_WORKFLOW.md` — poster-relief print-file service contract.
- `CHECKLIST.md` — archive pointer only.

## Phase A — Direction And Validated Preview

- 🟢 Product focus — active priority is customer acquisition through a PrintU-like personalized figurine workflow. Poster relief remains parked R&D.
- 🟢 Creative Lab preview pipeline — validated on 2026-06-07 with job `cfc9039a-d83c-48d7-9ed5-39f214fce6c6`: upload photo -> 2D proof -> approval -> Meshy Creative Lab Figure -> Storage-backed textured GLB preview.
- 🟢 Upstream 3D figure generation — Experiment 009 is the approved upstream milestone: three Creative Lab Figure API passes produced smooth no-base GLBs, and Blender inspection confirmed feet-sized bottom footprints rather than broad pedestal geometry.
- 🟢 Checkout honesty — figurine checkout remains locked in UI and backend until print files or an explicit preorder/manual-fulfillment path are approved.

## Phase B — Figurine Print-Decision Workflow

- 🟡 Named base service — deterministic `figurine-square-v1` named-base service exists with `POST /v1/figurine/named-base`, `updateFigurineBaseConfig`, fresh artifact prefixes, and job-page preview controls. Manual lettering, slicer, and manifest approval are still needed before calling it product-approved.
- 🟡 Body/base assembly — deterministic body-on-named-base composition now exists in `services/print-file-generator` with explicit `150mm` body scaling, source preservation, GLB/STL/3MF exports, and `generateFigurineAssembly`. Real-job Blender/slicer validation is still required.
- 🟡 Print conversion/readiness — `runFigurinePrintTooling` now promotes the Exp 010-style provider path into Functions for assembled packages: Analyze, Repair, Analyze repaired, Remesh, and Analyze remeshed GLB/STL. The core decision remains open because Meshy Repair is textureless and Meshy Remesh may still fail printability.
- 🔴 Fulfillment path — first intended public purchase path is automated checkout for full-color partner fulfillment, but checkout remains blocked until the selected partner's file, quote, order, policy, and print-readiness requirements are validated. No path should imply automatic print readiness yet.
- 🔴 Public policy and economics — provider terms, cost ceilings, likeness/privacy rules, moderation, and customer-content limits still need explicit product decisions before public traffic.

## Phase C — Provider Boundary And Job State

- 🟡 Async/provider reliability — Meshy webhook receiver is deployed at `https://api.3dprintyou.com/webhooks/meshy`, fixture mode exists, and Meshy API retry handling now covers transient fetch failures.
- 🟡 Model history and retry controls — add richer model-generation history, visible retry/status controls, provider task IDs, status transitions, credits, failure reasons, and retry attempts without storing secrets.
- 🟡 Webhook/poll reconciliation — reconcile polling and webhook events into one Firestore-visible state model.
- 🟡 Asset ingestion — keep provider assets job-scoped and ingest them immediately because external retention can be short.
- ⚪ Cost, moderation, and quota gates — add cost ceilings, moderation checks, user-facing creation credits, server-side hard stops before provider-spend steps, and provider failure states before wider traffic.

## Phase D — First Purchase-Intent Funnel

- 🟡 Purchase-intent direction — target automated checkout for full-color partner fulfillment; implementation remains blocked on partner requirements, backend eligibility, and print-readiness validation.
- ⚪ Backend eligibility rules — wire checkout/preorder eligibility to backend job state, not only browser UI.
- ⚪ User credit ledger — track customer creation credits with atomic reserve/consume/refund adjustments, show remaining credits before generation, and tie usage back to `jobCost`.
- ⚪ Funnel analytics — track upload, proof generation, proof approval, 3D preview readiness, base-name edits, checkout/preorder intent, and abandonment.
- ⚪ Stripe production readiness — keep Stripe in test mode until the selected path is represented honestly and verified end to end.
- ⚪ Account and product rules — require verified email before public creation; document and enforce account lifecycle, likeness, minors/consent, celebrities/IP, unsafe content, refunds, retention, and manual-review rules.

## Phase E — Public Exposure And Ops

- 🟡 Domains — `3dprintyou.com` is the preferred domain for the figurine pivot; Meshy webhook custom domain is live. Public app hosting/staging is not the main validated path yet.
- ⚪ Staging/production hosting — create staging and production hosting only after the figurine funnel is ready enough to expose honestly.
- 🟡 Admin/support view — v1 support jobs tab exists inside `/admin` with server-side allowlist gating, sanitized job/order/cost/error/audit visibility, and support notes/status markers. Refunds, retries, usage-credit adjustments, fulfillment holds, and production role/custom-claim hardening remain open.
- ⚪ Print-partner portal — add scoped partner access for approved print-package downloads, download audit events, and partner cost capture for margin review.
- ⚪ Alerts and cleanup — add alerting for model cost spikes, failed webhooks, fulfillment failures, and storage growth; add cleanup jobs for abandoned uploads and expired artifacts.

## Phase F — Parked Or Later Work

- ⚪ Poster-relief tuning — deferred unless the relief product is reactivated. The current relief path has a real server-side generator, 400px mesh output, color packages, surface-intent metadata, and GLB inspection UI.
- ⚪ Additional figurine styles — evaluate Bobblehead, Chibi, Cartoon, Image pose, and T-pose only after Creative Lab Figure + Natural pose stays reliable.
- ⚪ Multi-Image-to-3D revisit — resume only if Creative Lab print conversion fails or business/API constraints block it.
- ⚪ Native mobile packaging — defer until the web PWA proves the workflow.
- ⚪ Additional fulfillment providers — add after the first path has real evidence.

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
