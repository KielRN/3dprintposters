# Operator Console & Fulfillment Pipeline — Design

**Date:** 2026-07-04
**Status:** Approved (brainstormed with visual companion; state machine, console layout, and approach validated)

## Problem

The admin jobs console shows raw internal statuses ("Approved" actually means the customer
approved the 2D concept image), there is no operator (print-service) role, no gated file
handoff, and no post-payment lifecycle. Jobs effectively end at "paid".

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Operator identity | One trusted external print partner; allowlist-based access (mirrors admin allowlist) |
| Console layout | Work-queue tabs (Available / My jobs / Shipped & Done), list left + detail right |
| Download bundle | Curated ZIP: assembled STL, full-color 3MF, assembled GLB, thumbnail, approved 2D image, job sheet. Repair/remesh artifacts as optional individual downloads |
| Paint option | Customer chooses painted vs unpainted at checkout (separate Stripe price) |
| Refund | Real Stripe refund via API + state change, admin-only |
| Architecture | Hybrid: pre-payment stages derived from existing fields; post-payment stages owned by a new `fulfillment` object on the order doc |

## State model

### Pipeline stages (single display vocabulary)

Happy path:

1. **Draft / Generating** — customer working (derived)
2. **Preview Ready** — 2D concept shown (derived)
3. **2D Approved** — customer approved concept image (derived; today's raw `approved`)
4. **3D Ready** — model generated, auto checks pass (derived)
5. **Paid** — checkout completed (owned by `fulfillment`)
6. **Accepted** — operator claimed the job; downloads unlock
7. **In Production** — sub-state: `printing` or `painting`
8. **Shipped** — tracking recorded by operator
9. **Completed** — admin closes out; archived view

Side paths:

- **Rejected by operator** — after Accepted; requires reason; auto-opens an admin-support
  note (issue type `print_readiness`). Admin either fixes and re-queues (back to Paid /
  Available) or refunds. Never silently returns to the pool.
- **Refunded** — admin-only, reachable from any stage ≥ Paid. Terminal.
- **Canceled** — admin-only, for stale unpaid jobs. Terminal.
- **Failed** — existing failure statuses map to this label (derived).

### Storage

- **Pre-payment:** `derivePipelineStage(job, order)` in a new shared module
  `apps/functions/src/pipeline.ts`, mirrored as `apps/web/lib/pipeline.ts` — the same
  duplication pattern the codebase already uses for `figurineWorkflowConfig.ts`. Used by
  sanitizers and UI so labels cannot drift. Handles legacy docs: a paid order with
  `fulfillmentStatus: "not_started"` and no `fulfillment` object reads as stage `paid` —
  no migration script.
- **Post-payment:** `orders/{orderId}.fulfillment`:

```ts
fulfillment: {
  stage: "paid" | "accepted" | "in_production" | "shipped" | "completed"
       | "rejected_by_operator" | "refunded",
  productionSubState: "printing" | "painting" | null,
  acceptedAt: Timestamp | null,
  acceptedBy: { uid: string, email: string | null } | null,
  rejection: { reason: string, at: Timestamp, by: string } | null,
  tracking: { carrier: string, number: string, at: Timestamp } | null,
  refund: { stripeRefundId: string, amountCents: number, at: Timestamp, by: string } | null,
  history: Array<{ stage: string, at: Timestamp, by: string, note?: string }> // append-only
}
```

- **Denormalized:** every transition stamps `pipelineStage: string` and
  `pipelineUpdatedAt` onto the job doc so list queries are one indexed `where`.
- **Transition validation:** a server-side map of legal edges; illegal transitions throw
  `failed-precondition`. Accept uses a Firestore transaction to prevent double-accept.

## Roles & access

- New secret `OPERATOR_ALLOWLIST` (comma-separated emails), checked the same way as
  `ADMIN_SUPPORT_ALLOWLIST` (see `adminSupport.ts` / `isAdminSupportAllowed`).
- Admins are implicitly operators (so the owner can exercise the operator view).
- Operators interact only through callable functions returning sanitized data — no direct
  Firestore/Storage reads. Downloads are short-lived signed URLs.
- New callable `getConsoleRole` → `{ isAdmin, isOperator }` for frontend routing.

## Backend changes (`apps/functions/src`)

New callables (in `index.ts`, logic in a new `operatorConsole.ts` where practical):

- `listOperatorJobs({ tab })` — tabs map to stages: `available` → `paid`;
  `mine` → `accepted | in_production | rejected_by_operator`;
  `done` → `shipped | completed`. Row shape: customer name, jobId, last-5 display id,
  stage, paint flag, product type, `pipelineUpdatedAt`.
- `getOperatorJob({ jobId })` — detail: preview thumbnail signed URL, paint option,
  ship-to address (**only when stage ≥ accepted**), bundle status + file list, history.
- `operatorAcceptJob({ jobId })` — transaction: assert stage `paid`, write `accepted`,
  enqueue bundle build.
- `operatorUpdateFulfillment({ jobId, action, payload })` — actions:
  `start_production`, `set_production_substate` (`printing`/`painting`),
  `reject` (reason required), `ship` (carrier + tracking number required).
- `adminRefundJob({ jobId })` — admin-only; `stripe.refunds.create({ payment_intent })`;
  writes `refunded` only on Stripe success; records refund details.
- `adminSetFulfillment({ jobId, action })` — admin-only escape hatch:
  `complete` (from shipped), `requeue` (from rejected → paid/Available),
  `cancel` (unpaid jobs only).

Rejection side effect: auto-create an admin-support note (existing notes system) with
issue type `print_readiness` and the operator's reason.

### Checkout & webhook

- Checkout callable accepts `paintOption: "painted" | "unpainted"` for figurines; selects
  the corresponding Stripe price (`STRIPE_FIGURINE_PAINTED_PRICE_ID` /
  `STRIPE_FIGURINE_UNPAINTED_PRICE_ID`, with `price_data` fallback like the current poster
  path). Stored on order and job.
- `checkout.session.completed` webhook additionally persists:
  `customerName` / `customerEmail` (from `session.customer_details`),
  `shippingAddress` (from `session.shipping_details` / `collected_information`),
  sets `fulfillment` initial object with stage `paid`, and stamps job `pipelineStage`.
  **This is the linchpin — without it the operator cannot ship.**

### Download bundle

- Built on accept (background step, not blocking the accept response):
  `print-bundle-{last5}.zip` under the job's storage prefix containing assembled STL,
  full-color 3MF, assembled GLB, thumbnail PNG, customer-approved 2D image, and a
  generated `job-sheet.txt` (job #, customer name, ship-to, paint option, product/size).
- Detail pane: **Download print bundle** (signed URL, 24 h, re-issuable on demand) +
  "Additional files" expander with individual signed links (repair/remesh and remaining
  artifacts).
- Bundle build failure: stage remains `accepted`; detail pane shows a retry button;
  individual links still work as fallback.

## Frontend changes (`apps/web`)

### Operator console (new)

- Route `app/operator/page.tsx` + `components/OperatorConsole.tsx`.
- Gate on `getConsoleRole`; non-operators see access-denied.
- Three tabs with badge counts: **Available / My jobs / Shipped & Done**.
- Left list rows: customer name · `#last-5` · stage pill · relative last-action time;
  sorted by most recent action.
- Right detail pane: preview thumbnail, paint badge, ship-to (post-accept), history
  timeline, and stage-appropriate actions:
  - Paid → **Accept job**
  - Accepted → **Download print bundle**, **Start production**, **Reject (reason required)**
  - In Production → sub-state toggle (printing/painting), **Mark shipped** (carrier +
    tracking inputs)
  - Shipped/Completed → read-only summary.

### Admin console (updates to `AdminSupportJobs.tsx`)

- Status pill uses friendly pipeline labels (**2D Approved**, 3D Ready, Paid, Accepted,
  In Production, Shipped, Completed, Rejected — needs attention, Refunded, Canceled,
  Failed). Raw internal status moves into the detail metadata table.
- New pipeline-stage filter dropdown.
- Detail pane gains a Fulfillment section: operator identity, production sub-state,
  tracking, history timeline.
- Admin actions: **Refund** (confirm dialog; visible stage ≥ Paid), **Re-queue**
  (rejected only), **Mark completed** (shipped only), **Cancel** (unpaid only).

## Edge cases

- **Double accept:** transaction guard; second caller gets `failed-precondition`.
- **Refund mid-production:** allowed; job disappears from actionable tabs and shows
  Refunded in Done/admin so the operator stops work.
- **Legacy jobs:** derived-stage fallbacks; no migration required.
- **Operator allowlist change mid-job:** history keeps `acceptedBy`; new operator can
  continue (single-partner model, no reassignment flow needed now — YAGNI).

## Testing

- Unit: `derivePipelineStage` across legacy/current doc shapes; transition validator
  (every legal edge accepted, illegal edges rejected).
- Emulator integration: accept (incl. double-accept race), reject → support note,
  ship, refund (Stripe mocked), admin re-queue/complete/cancel.
- Webhook test: shipping address + customer name persisted; `fulfillment` initialized.
- UI: operator tabs render correct queues from emulator data; admin pill labels map
  correctly; download button appears only post-accept.

## Out of scope (explicitly)

- Multiple competing print services / marketplace assignment.
- Kanban board view (possible later admin enhancement).
- Auto-complete of shipped jobs on a timer.
- Customer-facing tracking notifications (worth a follow-up spec).
