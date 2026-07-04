# Operator Console & Fulfillment Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a post-payment fulfillment lifecycle (Paid → Accepted → In Production → Shipped → Completed, with reject/refund side paths), an allowlist-gated Operator console with work-queue tabs and a curated download bundle, and friendly pipeline labels in the admin console.

**Architecture:** Hybrid state model per the approved spec ([docs/superpowers/specs/2026-07-04-operator-console-fulfillment-design.md](../specs/2026-07-04-operator-console-fulfillment-design.md)): pre-payment stages are derived from existing job fields by a shared `pipeline.ts` module (duplicated functions↔web like `figurineWorkflowConfig.ts`); post-payment stages are owned by a new `fulfillment` object on `orders/{jobId}` (order doc ID == job ID). Every transition stamps a denormalized `pipelineStage` onto `jobs/{jobId}` for one-field list queries. Operators only touch callables returning sanitized data; downloads are signed URLs.

**Tech Stack:** Firebase Functions v2 (Node 22, TS), Firestore, Storage, Stripe, zod, `archiver` (new dep), Next.js app router + Tailwind, `node --test` `.mjs` tests against built `lib/` output.

**Key existing patterns to follow:**
- Allowlist auth: `apps/functions/src/adminSupport.ts` (`parseAdminSupportAllowlist`, `isAdminSupportAllowed`, dev bypass via `adminSupportDevelopmentAccessReason`) and `requireAdminSupport` in `apps/functions/src/index.ts:2203`.
- Callable pattern: `onCall({ secrets: [...] }, async (request) => { requireX(request); zodSchema.safeParse(request.data); ... })`.
- Tests: `apps/functions/test/*.test.mjs`, `import { test } from "node:test"`, import from `../lib/<module>.js`, npm script per suite that runs `npm run build` first.
- Web callables: `httpsCallable(firebaseClients.functions, "name")` + `callWithTransientRetry` from `apps/web/lib/callableRetry.ts`.
- Signed URLs: `getSignedUrl({ action: "read", expires: ... })` as in `signedModelUrl` (`apps/functions/src/index.ts:2992`).

**Verification commands (used throughout):**
- Functions: `cd apps/functions && npm run typecheck && npm run build`
- Web: `cd apps/web && npx tsc --noEmit`
- Tests: `cd apps/functions && npm run test:pipeline` (etc.)

---

## Task 1: `pipeline.ts` — stages, labels, transitions, derivation (functions)

**Files:**
- Create: `apps/functions/src/pipeline.ts`
- Test: `apps/functions/test/pipeline.test.mjs`
- Modify: `apps/functions/package.json` (add test script)

- [ ] **Step 1: Write the failing test**

Create `apps/functions/test/pipeline.test.mjs`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canTransition,
  derivePipelineStage,
  displayJobId,
  fulfillmentStages,
  pipelineStageLabels,
} from "../lib/pipeline.js";

test("displayJobId returns uppercased last five characters", () => {
  assert.equal(displayJobId("abcdef12345xyz98"), "XYZ98");
  assert.equal(displayJobId("abc"), "ABC");
});

test("every pipeline stage has a label", () => {
  for (const stage of [
    "draft",
    "generating",
    "preview_ready",
    "2d_approved",
    "3d_ready",
    ...fulfillmentStages,
    "canceled",
    "failed",
  ]) {
    assert.equal(typeof pipelineStageLabels[stage], "string");
    assert.ok(pipelineStageLabels[stage].length > 0);
  }
  assert.equal(pipelineStageLabels["2d_approved"], "2D Approved");
});

test("legal fulfillment transitions", () => {
  assert.ok(canTransition("paid", "accepted"));
  assert.ok(canTransition("paid", "refunded"));
  assert.ok(canTransition("accepted", "in_production"));
  assert.ok(canTransition("accepted", "rejected_by_operator"));
  assert.ok(canTransition("in_production", "shipped"));
  assert.ok(canTransition("in_production", "rejected_by_operator"));
  assert.ok(canTransition("shipped", "completed"));
  assert.ok(canTransition("rejected_by_operator", "paid"));
  assert.ok(canTransition("completed", "refunded"));
});

test("illegal fulfillment transitions are rejected", () => {
  assert.equal(canTransition("paid", "shipped"), false);
  assert.equal(canTransition("paid", "in_production"), false);
  assert.equal(canTransition("accepted", "completed"), false);
  assert.equal(canTransition("refunded", "paid"), false);
  assert.equal(canTransition("shipped", "accepted"), false);
  assert.equal(canTransition("paid", "paid"), false);
});

test("derivePipelineStage prefers the stamped job field", () => {
  assert.equal(
    derivePipelineStage({
      job: { pipelineStage: "in_production", status: "approved" },
    }),
    "in_production",
  );
});

test("derivePipelineStage uses order fulfillment stage when present", () => {
  assert.equal(
    derivePipelineStage({
      job: { status: "approved" },
      order: { fulfillment: { stage: "accepted" } },
    }),
    "accepted",
  );
});

test("legacy paid order with no fulfillment object reads as paid", () => {
  assert.equal(
    derivePipelineStage({
      job: { status: "approved" },
      order: { paymentStatus: "paid", fulfillmentStatus: "not_started" },
    }),
    "paid",
  );
});

test("derives pre-payment stages from job fields", () => {
  assert.equal(derivePipelineStage({ job: {} }), "draft");
  assert.equal(derivePipelineStage({ job: { status: "generating" } }), "generating");
  assert.equal(
    derivePipelineStage({ job: { status: "preview_ready" } }),
    "preview_ready",
  );
  assert.equal(
    derivePipelineStage({ job: { status: "needs_review" } }),
    "preview_ready",
  );
  assert.equal(derivePipelineStage({ job: { status: "approved" } }), "2d_approved");
  assert.equal(derivePipelineStage({ job: { status: "failed" } }), "failed");
  assert.equal(derivePipelineStage({ job: { status: "canceled" } }), "canceled");
});

test("3d_ready when poster print files generated or figurine checkout eligible", () => {
  assert.equal(
    derivePipelineStage({
      job: {
        status: "approved",
        productType: "poster",
        printFileStatus: "generated",
      },
    }),
    "3d_ready",
  );
  assert.equal(
    derivePipelineStage({
      job: {
        status: "approved",
        productType: "figurine",
        checkoutEligibility: { eligible: true },
      },
    }),
    "3d_ready",
  );
  assert.equal(
    derivePipelineStage({
      job: {
        status: "approved",
        productType: "figurine",
        checkoutEligibility: { eligible: false, reason: "Needs review." },
      },
    }),
    "2d_approved",
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/functions && npm run build; node --test test/pipeline.test.mjs`
Expected: build fails or tests fail with "Cannot find module '../lib/pipeline.js'".

- [ ] **Step 3: Write the implementation**

Create `apps/functions/src/pipeline.ts`:

```ts
export const fulfillmentStages = [
  "paid",
  "accepted",
  "in_production",
  "shipped",
  "completed",
  "rejected_by_operator",
  "refunded",
] as const;

export type FulfillmentStage = (typeof fulfillmentStages)[number];

export const pipelineStages = [
  "draft",
  "generating",
  "preview_ready",
  "2d_approved",
  "3d_ready",
  ...fulfillmentStages,
  "canceled",
  "failed",
] as const;

export type PipelineStage = (typeof pipelineStages)[number];

export const pipelineStageLabels: Record<PipelineStage, string> = {
  draft: "Draft",
  generating: "Generating",
  preview_ready: "Preview Ready",
  "2d_approved": "2D Approved",
  "3d_ready": "3D Ready",
  paid: "Paid",
  accepted: "Accepted",
  in_production: "In Production",
  shipped: "Shipped",
  completed: "Completed",
  rejected_by_operator: "Rejected — needs attention",
  refunded: "Refunded",
  canceled: "Canceled",
  failed: "Failed",
};

const legalTransitions: Record<FulfillmentStage, readonly FulfillmentStage[]> = {
  paid: ["accepted", "refunded"],
  accepted: ["in_production", "rejected_by_operator", "refunded"],
  in_production: ["shipped", "rejected_by_operator", "refunded"],
  shipped: ["completed", "refunded"],
  completed: ["refunded"],
  rejected_by_operator: ["paid", "refunded"],
  refunded: [],
};

export function isFulfillmentStage(value: unknown): value is FulfillmentStage {
  return fulfillmentStages.includes(value as FulfillmentStage);
}

export function isPipelineStage(value: unknown): value is PipelineStage {
  return pipelineStages.includes(value as PipelineStage);
}

export function canTransition(from: unknown, to: unknown): boolean {
  if (!isFulfillmentStage(from) || !isFulfillmentStage(to)) {
    return false;
  }
  return legalTransitions[from].includes(to);
}

export function displayJobId(jobId: string): string {
  return jobId.slice(-5).toUpperCase();
}

const previewStatuses = new Set([
  "preview_ready",
  "needs_review",
  "ready",
  "generated",
]);

type LooseRecord = Record<string, unknown>;

function record(value: unknown): LooseRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as LooseRecord)
    : {};
}

export function derivePipelineStage(input: {
  job: LooseRecord;
  order?: LooseRecord | null;
}): PipelineStage {
  const job = record(input.job);
  const order = record(input.order ?? undefined);

  if (isPipelineStage(job.pipelineStage)) {
    return job.pipelineStage;
  }

  const fulfillment = record(order.fulfillment);
  if (isFulfillmentStage(fulfillment.stage)) {
    return fulfillment.stage;
  }

  if (order.paymentStatus === "paid" || order.status === "paid") {
    return "paid";
  }

  const status = typeof job.status === "string" ? job.status : null;
  if (status === "failed") {
    return "failed";
  }
  if (status === "canceled") {
    return "canceled";
  }

  const threeDReady =
    (job.productType === "poster" && job.printFileStatus === "generated") ||
    (job.productType === "figurine" &&
      record(job.checkoutEligibility).eligible === true);
  if (threeDReady) {
    return "3d_ready";
  }

  if (status === "approved") {
    return "2d_approved";
  }
  if (status && previewStatuses.has(status)) {
    return "preview_ready";
  }
  if (status) {
    return "generating";
  }
  return "draft";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/functions && npm run build; node --test test/pipeline.test.mjs`
Expected: all tests PASS.

- [ ] **Step 5: Add the npm script**

In `apps/functions/package.json` scripts, after `"test:workflow-config"`:

```json
"test:pipeline": "npm run build && node --test test/pipeline.test.mjs test/operatorConsole.test.mjs",
```

(The `operatorConsole.test.mjs` file arrives in Task 3; `node --test` fails on a missing file, so create a placeholder now: `apps/functions/test/operatorConsole.test.mjs` containing only `import { test } from "node:test"; test("placeholder", () => {});`.)

- [ ] **Step 6: Commit**

```bash
git add apps/functions/src/pipeline.ts apps/functions/test/pipeline.test.mjs apps/functions/test/operatorConsole.test.mjs apps/functions/package.json
git commit -m "feat(pipeline): stage vocabulary, transition rules, and derivation"
```

---

## Task 2: Mirror `pipeline.ts` to the web app

**Files:**
- Create: `apps/web/lib/pipeline.ts`

- [ ] **Step 1: Copy the module**

Copy `apps/functions/src/pipeline.ts` verbatim to `apps/web/lib/pipeline.ts`. Add this header comment at the top of BOTH files:

```ts
// Mirrored between apps/functions/src/pipeline.ts and apps/web/lib/pipeline.ts
// (same pattern as figurineWorkflowConfig.ts). Keep the two copies identical.
```

- [ ] **Step 2: Verify web typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/pipeline.ts apps/functions/src/pipeline.ts
git commit -m "feat(web): mirror pipeline stage module"
```

---

## Task 3: `operatorConsole.ts` — pure logic (sanitizers, bundle selection, webhook extraction)

**Files:**
- Create: `apps/functions/src/operatorConsole.ts`
- Test: `apps/functions/test/operatorConsole.test.mjs` (replace placeholder)

- [ ] **Step 1: Write the failing test**

Replace `apps/functions/test/operatorConsole.test.mjs` with:

```js
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildJobSheet,
  customerFieldsFromSession,
  operatorTabStages,
  sanitizeOperatorJobDetail,
  sanitizeOperatorJobSummary,
  selectBundleFiles,
} from "../lib/operatorConsole.js";

function timestamp(iso) {
  return {
    toDate() {
      return new Date(iso);
    },
  };
}

function paidOrder() {
  return {
    uid: "customer-1",
    jobId: "job-abc12345",
    customerName: "Maria Gonzalez",
    customerEmail: "maria@example.com",
    shippingAddress: {
      name: "Maria Gonzalez",
      line1: "1 Main St",
      line2: null,
      city: "Austin",
      state: "TX",
      postalCode: "78701",
      country: "US",
    },
    paintOption: "painted",
    fulfillment: {
      stage: "paid",
      productionSubState: null,
      history: [],
    },
    updatedAt: timestamp("2026-07-04T10:00:00.000Z"),
  };
}

function paidJob() {
  return {
    uid: "customer-1",
    productType: "figurine",
    status: "approved",
    pipelineStage: "paid",
    approvedImagePath: "generated/customer-1/job-abc12345/approved.png",
    printFileArtifacts: {
      modelStl: "print-files/customer-1/job-abc12345/model.stl",
      fullColor3mf: "print-files/customer-1/job-abc12345/full-color.3mf",
      previewGlb: "print-files/customer-1/job-abc12345/preview.glb",
    },
    figurinePreview: {
      thumbnailPath: "print-files/customer-1/job-abc12345/thumbnail.png",
    },
    figurineAssembly: {
      status: "assembled",
      artifacts: {
        assembled_glb: "print-files/customer-1/job-abc12345/figurine/assembled/a1/model.glb",
        assembled_stl: "print-files/customer-1/job-abc12345/figurine/assembled/a1/model.stl",
        report_json: "print-files/customer-1/job-abc12345/figurine/assembled/a1/report.json",
      },
    },
    pipelineUpdatedAt: timestamp("2026-07-04T10:00:00.000Z"),
  };
}

test("operator tabs map to fulfillment stages", () => {
  assert.deepEqual(operatorTabStages.available, ["paid"]);
  assert.deepEqual(operatorTabStages.mine, [
    "accepted",
    "in_production",
    "rejected_by_operator",
  ]);
  assert.deepEqual(operatorTabStages.done, ["shipped", "completed", "refunded"]);
});

test("summary row exposes display fields and hides ship-to", () => {
  const row = sanitizeOperatorJobSummary({
    jobId: "job-abc12345",
    jobData: paidJob(),
    orderData: paidOrder(),
  });
  assert.equal(row.jobId, "job-abc12345");
  assert.equal(row.displayId, "12345");
  assert.equal(row.customerName, "Maria Gonzalez");
  assert.equal(row.stage, "paid");
  assert.equal(row.paintOption, "painted");
  assert.equal(row.productType, "figurine");
  assert.equal(row.updatedAt, "2026-07-04T10:00:00.000Z");
  assert.equal("shippingAddress" in row, false);
});

test("detail hides ship-to before accept and shows it after", () => {
  const before = sanitizeOperatorJobDetail({
    jobId: "job-abc12345",
    jobData: paidJob(),
    orderData: paidOrder(),
  });
  assert.equal(before.shipTo, null);

  const order = paidOrder();
  order.fulfillment.stage = "accepted";
  const job = paidJob();
  job.pipelineStage = "accepted";
  const after = sanitizeOperatorJobDetail({
    jobId: "job-abc12345",
    jobData: job,
    orderData: order,
  });
  assert.equal(after.shipTo.city, "Austin");
  assert.equal(after.stage, "accepted");
});

test("selectBundleFiles picks curated artifacts with stable names", () => {
  const files = selectBundleFiles({ jobId: "job-abc12345", jobData: paidJob() });
  const names = files.map((file) => file.name).sort();
  assert.deepEqual(names, [
    "approved-2d.png",
    "assembled_glb.glb",
    "assembled_stl.stl",
    "full-color.3mf",
    "model.stl",
    "preview.glb",
    "thumbnail.png",
  ]);
  for (const file of files) {
    assert.ok(file.storagePath.startsWith("generated/") || file.storagePath.startsWith("print-files/"));
  }
});

test("selectBundleFiles skips missing artifacts and non-model assembly files", () => {
  const job = paidJob();
  delete job.figurineAssembly;
  delete job.printFileArtifacts.fullColor3mf;
  const names = selectBundleFiles({ jobId: "j", jobData: job }).map((f) => f.name);
  assert.ok(!names.includes("full-color.3mf"));
  assert.ok(!names.includes("assembled_stl.stl"));
  assert.ok(!names.includes("report_json.json"));
  assert.ok(names.includes("model.stl"));
});

test("buildJobSheet includes the operator-facing facts", () => {
  const sheet = buildJobSheet({
    jobId: "job-abc12345",
    jobData: paidJob(),
    orderData: paidOrder(),
  });
  assert.match(sheet, /Job #12345/);
  assert.match(sheet, /Maria Gonzalez/);
  assert.match(sheet, /1 Main St/);
  assert.match(sheet, /Austin, TX 78701 US/);
  assert.match(sheet, /Paint option: painted/);
  assert.match(sheet, /Product: figurine/);
});

test("customerFieldsFromSession reads customer and shipping details", () => {
  const fields = customerFieldsFromSession({
    customer_details: { name: "Maria Gonzalez", email: "maria@example.com" },
    shipping_details: {
      name: "Maria Gonzalez",
      address: {
        line1: "1 Main St",
        line2: null,
        city: "Austin",
        state: "TX",
        postal_code: "78701",
        country: "US",
      },
    },
  });
  assert.equal(fields.customerName, "Maria Gonzalez");
  assert.equal(fields.customerEmail, "maria@example.com");
  assert.equal(fields.shippingAddress.postalCode, "78701");
});

test("customerFieldsFromSession falls back to collected_information and nulls", () => {
  const fields = customerFieldsFromSession({
    customer_details: { name: null, email: "x@example.com" },
    collected_information: {
      shipping_details: {
        name: "X",
        address: { line1: "2 Oak", city: "Waco", state: "TX", postal_code: "76701", country: "US" },
      },
    },
  });
  assert.equal(fields.customerName, null);
  assert.equal(fields.shippingAddress.city, "Waco");

  const empty = customerFieldsFromSession({});
  assert.equal(empty.customerName, null);
  assert.equal(empty.customerEmail, null);
  assert.equal(empty.shippingAddress, null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/functions && npm run build; node --test test/operatorConsole.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `apps/functions/src/operatorConsole.ts`:

```ts
import {
  displayJobId,
  isFulfillmentStage,
  type FulfillmentStage,
} from "./pipeline.js";

type LooseRecord = Record<string, unknown>;

function record(value: unknown): LooseRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as LooseRecord)
    : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isoDate(value: unknown): string | null {
  const candidate = value as { toDate?: () => Date } | null;
  if (candidate && typeof candidate.toDate === "function") {
    return candidate.toDate().toISOString();
  }
  return null;
}

export const operatorTabs = ["available", "mine", "done"] as const;
export type OperatorTab = (typeof operatorTabs)[number];

export const operatorTabStages: Record<OperatorTab, FulfillmentStage[]> = {
  available: ["paid"],
  mine: ["accepted", "in_production", "rejected_by_operator"],
  done: ["shipped", "completed", "refunded"],
};

export type ShipTo = {
  name: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
};

function shipToFromOrder(orderData: LooseRecord): ShipTo | null {
  const address = record(orderData.shippingAddress);
  if (!str(address.line1)) {
    return null;
  }
  return {
    name: str(address.name),
    line1: str(address.line1),
    line2: str(address.line2),
    city: str(address.city),
    state: str(address.state),
    postalCode: str(address.postalCode),
    country: str(address.country),
  };
}

function stageFromDocs(jobData: LooseRecord, orderData: LooseRecord): FulfillmentStage {
  const fulfillment = record(orderData.fulfillment);
  if (isFulfillmentStage(fulfillment.stage)) {
    return fulfillment.stage;
  }
  if (isFulfillmentStage(jobData.pipelineStage)) {
    return jobData.pipelineStage;
  }
  return "paid";
}

export function sanitizeOperatorJobSummary(input: {
  jobId: string;
  jobData: LooseRecord;
  orderData: LooseRecord;
}) {
  const fulfillment = record(input.orderData.fulfillment);
  return {
    jobId: input.jobId,
    displayId: displayJobId(input.jobId),
    customerName: str(input.orderData.customerName) ?? "Customer",
    stage: stageFromDocs(input.jobData, input.orderData),
    productionSubState: str(fulfillment.productionSubState),
    paintOption: str(input.orderData.paintOption),
    productType: str(input.jobData.productType),
    updatedAt:
      isoDate(input.jobData.pipelineUpdatedAt) ??
      isoDate(input.orderData.updatedAt) ??
      isoDate(input.jobData.updatedAt),
  };
}

const shipToVisibleStages = new Set<FulfillmentStage>([
  "accepted",
  "in_production",
  "shipped",
  "completed",
  "rejected_by_operator",
]);

export function sanitizeOperatorJobDetail(input: {
  jobId: string;
  jobData: LooseRecord;
  orderData: LooseRecord;
}) {
  const summary = sanitizeOperatorJobSummary(input);
  const fulfillment = record(input.orderData.fulfillment);
  const historyRaw = Array.isArray(fulfillment.history) ? fulfillment.history : [];
  const bundle = record(input.orderData.printBundle);
  const tracking = record(fulfillment.tracking);
  const rejection = record(fulfillment.rejection);

  return {
    ...summary,
    shipTo: shipToVisibleStages.has(summary.stage)
      ? shipToFromOrder(input.orderData)
      : null,
    customerEmail: shipToVisibleStages.has(summary.stage)
      ? str(input.orderData.customerEmail)
      : null,
    tracking: str(tracking.number)
      ? {
          carrier: str(tracking.carrier),
          number: str(tracking.number),
          at: isoDate(tracking.at),
        }
      : null,
    rejection: str(rejection.reason)
      ? { reason: str(rejection.reason), at: isoDate(rejection.at) }
      : null,
    bundle: {
      status: str(bundle.status) ?? "not_built",
      storagePath: str(bundle.storagePath),
      error: str(bundle.error),
    },
    history: historyRaw.map((entry) => {
      const item = record(entry);
      return {
        stage: str(item.stage),
        at: isoDate(item.at),
        by: str(item.by),
        note: str(item.note),
      };
    }),
  };
}

export type BundleFile = { name: string; storagePath: string };

function extensionOf(path: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(path);
  return match ? match[1].toLowerCase() : "bin";
}

const bundleModelExtensions = new Set(["stl", "glb", "3mf", "obj"]);

export function selectBundleFiles(input: {
  jobId: string;
  jobData: LooseRecord;
}): BundleFile[] {
  const files: BundleFile[] = [];
  const jobData = input.jobData;
  const printFileArtifacts = record(jobData.printFileArtifacts);

  const approved = str(jobData.approvedImagePath);
  if (approved) {
    files.push({ name: `approved-2d.${extensionOf(approved)}`, storagePath: approved });
  }
  const thumbnail = str(record(jobData.figurinePreview).thumbnailPath);
  if (thumbnail) {
    files.push({ name: `thumbnail.${extensionOf(thumbnail)}`, storagePath: thumbnail });
  }
  const modelStl = str(printFileArtifacts.modelStl);
  if (modelStl) {
    files.push({ name: "model.stl", storagePath: modelStl });
  }
  const fullColor3mf = str(printFileArtifacts.fullColor3mf);
  if (fullColor3mf) {
    files.push({ name: "full-color.3mf", storagePath: fullColor3mf });
  }
  const previewGlb = str(printFileArtifacts.previewGlb);
  if (previewGlb) {
    files.push({ name: "preview.glb", storagePath: previewGlb });
  }
  const assemblyArtifacts = record(record(jobData.figurineAssembly).artifacts);
  for (const [key, value] of Object.entries(assemblyArtifacts)) {
    const path = str(value);
    if (!path) {
      continue;
    }
    const extension = extensionOf(path);
    if (bundleModelExtensions.has(extension)) {
      files.push({ name: `${key}.${extension}`, storagePath: path });
    }
  }
  return files;
}

export function buildJobSheet(input: {
  jobId: string;
  jobData: LooseRecord;
  orderData: LooseRecord;
}): string {
  const shipTo = shipToFromOrder(input.orderData);
  const lines = [
    `Job #${displayJobId(input.jobId)} (${input.jobId})`,
    `Customer: ${str(input.orderData.customerName) ?? "Unknown"}`,
    `Product: ${str(input.jobData.productType) ?? "unknown"}`,
    `Paint option: ${str(input.orderData.paintOption) ?? "unpainted"}`,
    "",
    "Ship to:",
    ...(shipTo
      ? [
          shipTo.name ?? "",
          shipTo.line1 ?? "",
          ...(shipTo.line2 ? [shipTo.line2] : []),
          `${shipTo.city ?? ""}, ${shipTo.state ?? ""} ${shipTo.postalCode ?? ""} ${shipTo.country ?? ""}`,
        ]
      : ["(no address on file — contact support)"]),
  ];
  return lines.join("\n");
}

export function customerFieldsFromSession(session: LooseRecord): {
  customerName: string | null;
  customerEmail: string | null;
  shippingAddress: ShipTo | null;
} {
  const customer = record(session.customer_details);
  const shipping =
    (record(session.shipping_details).address
      ? record(session.shipping_details)
      : null) ??
    (record(record(session.collected_information).shipping_details).address
      ? record(record(session.collected_information).shipping_details)
      : null);
  const address = shipping ? record(shipping.address) : null;

  return {
    customerName: str(customer.name),
    customerEmail: str(customer.email),
    shippingAddress: address
      ? {
          name: str(shipping?.name),
          line1: str(address.line1),
          line2: str(address.line2),
          city: str(address.city),
          state: str(address.state),
          postalCode: str(address.postal_code),
          country: str(address.country),
        }
      : null,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/functions && npm run test:pipeline`
Expected: all pipeline + operatorConsole tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/functions/src/operatorConsole.ts apps/functions/test/operatorConsole.test.mjs
git commit -m "feat(operator): sanitizers, bundle selection, and session extraction"
```

---

## Task 4: Webhook persists customer + shipping and initializes fulfillment (linchpin)

**Files:**
- Modify: `apps/functions/src/index.ts` — the `checkout.session.completed` branch of `stripeWebhook` (around line 1935) and the `CheckoutSessionWebhookObject` type.

- [ ] **Step 1: Extend the webhook payload type**

Find the `CheckoutSessionWebhookObject` type in `apps/functions/src/index.ts` (search for `CheckoutSessionWebhookObject`) and ensure it includes (add missing fields, keep existing ones):

```ts
type CheckoutSessionWebhookObject = {
  metadata?: { orderId?: string; jobId?: string; uid?: string } | null;
  payment_intent?: string | { id?: string } | null;
  customer_details?: { name?: string | null; email?: string | null } | null;
  shipping_details?: {
    name?: string | null;
    address?: Record<string, string | null> | null;
  } | null;
  collected_information?: {
    shipping_details?: {
      name?: string | null;
      address?: Record<string, string | null> | null;
    } | null;
  } | null;
};
```

- [ ] **Step 2: Add imports**

At the top of `index.ts`, alongside the existing local imports:

```ts
import { customerFieldsFromSession } from "./operatorConsole.js";
```

- [ ] **Step 3: Rewrite the `checkout.session.completed` handler**

Replace the existing block (currently `index.ts:1935-1956`) with:

```ts
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as CheckoutSessionWebhookObject;
      const orderId = session.metadata?.orderId;
      const jobId = session.metadata?.jobId ?? orderId;

      if (orderId) {
        const customerFields = customerFieldsFromSession(
          session as Record<string, unknown>,
        );
        const paidAt = FieldValue.serverTimestamp();
        const batch = db.batch();
        batch.set(
          db.collection("orders").doc(orderId),
          {
            status: "paid",
            paymentStatus: "paid",
            stripePaymentIntentId:
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : null,
            customerName: customerFields.customerName,
            customerEmail: customerFields.customerEmail,
            shippingAddress: customerFields.shippingAddress,
            fulfillment: {
              stage: "paid",
              productionSubState: null,
              acceptedAt: null,
              acceptedBy: null,
              rejection: null,
              tracking: null,
              refund: null,
              history: FieldValue.arrayUnion({
                stage: "paid",
                at: Timestamp.now(),
                by: "stripe_webhook",
              }),
            },
            updatedAt: paidAt,
          },
          { merge: true },
        );
        if (jobId) {
          batch.set(
            db.collection("jobs").doc(jobId),
            {
              pipelineStage: "paid",
              pipelineUpdatedAt: paidAt,
              updatedAt: paidAt,
            },
            { merge: true },
          );
        }
        await batch.commit();
      }
    }
```

Note: `FieldValue.serverTimestamp()` is not allowed inside `arrayUnion`, so the history entry uses `Timestamp.now()`. Ensure `Timestamp` is imported from `firebase-admin/firestore` (add it to the existing import at the top if missing).

- [ ] **Step 4: Typecheck and build**

Run: `cd apps/functions && npm run typecheck && npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/functions/src/index.ts
git commit -m "feat(checkout): persist customer, shipping, and fulfillment on payment"
```

---

## Task 5: Paint option + figurine checkout unlock

**Files:**
- Modify: `apps/functions/src/index.ts` — `checkoutSchema`, `createCheckoutSession` (line 1736)
- Modify: `apps/web/components/JobDetail.tsx` — checkout call + paint radio

- [ ] **Step 1: Extend the checkout schema**

Find `checkoutSchema` in `index.ts` (search `const checkoutSchema`) and extend it:

```ts
const checkoutSchema = z.object({
  jobId: z.string().min(1),
  paintOption: z.enum(["painted", "unpainted"]).optional(),
});
```

- [ ] **Step 2: Add figurine price secrets**

Next to the existing `stripePosterPriceId` definition (search `stripePosterPriceId`), add:

```ts
const stripeFigurinePaintedPriceId = defineSecret("STRIPE_FIGURINE_PAINTED_PRICE_ID");
const stripeFigurineUnpaintedPriceId = defineSecret("STRIPE_FIGURINE_UNPAINTED_PRICE_ID");
```

Add both to `createCheckoutSession`'s `secrets` array.

- [ ] **Step 3: Replace the figurine hard block with the eligibility gate**

In `createCheckoutSession`, replace:

```ts
    if (jobData.productType === "figurine") {
      throw new HttpsError(
        "failed-precondition",
        "Figurine checkout is locked until print files are approved.",
      );
    }
```

with:

```ts
    const isFigurine = jobData.productType === "figurine";
    const paintOption = isFigurine
      ? (parsed.data.paintOption ?? "unpainted")
      : null;
    if (isFigurine) {
      const eligibility = jobData.checkoutEligibility as
        | { eligible?: unknown; reason?: unknown }
        | undefined;
      if (eligibility?.eligible !== true) {
        throw new HttpsError(
          "failed-precondition",
          typeof eligibility?.reason === "string"
            ? eligibility.reason
            : "Figurine checkout is locked until print readiness review is complete.",
        );
      }
    }
```

Also relax the print-file precondition so figurines pass when they have assembly output instead of poster print files. Replace the `printFileStatus !== "generated"` guard with:

```ts
    const printFileArtifacts = jobData.printFileArtifacts as
      | Partial<PrintFileArtifacts>
      | undefined;
    if (
      !isFigurine &&
      (jobData.printFileStatus !== "generated" ||
        typeof printFileArtifacts?.modelStl !== "string" ||
        typeof printFileArtifacts.previewGlb !== "string")
    ) {
      throw new HttpsError(
        "failed-precondition",
        "3D print file generation must finish before checkout.",
      );
    }
```

- [ ] **Step 4: Select the line item by product and paint option**

Inside `createCheckoutSession`, before `stripe.checkout.sessions.create`, add:

```ts
    const figurinePriceId = paintOption === "painted"
      ? stripeFigurinePaintedPriceId.value() || process.env.STRIPE_FIGURINE_PAINTED_PRICE_ID
      : stripeFigurineUnpaintedPriceId.value() || process.env.STRIPE_FIGURINE_UNPAINTED_PRICE_ID;
    const figurineFallbackAmount = paintOption === "painted" ? 14900 : 9900;
    const lineItems = isFigurine
      ? figurinePriceId
        ? [{ quantity: 1, price: figurinePriceId }]
        : [
            {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: figurineFallbackAmount,
                product_data: {
                  name:
                    paintOption === "painted"
                      ? "Custom 3D Printed Figurine (painted)"
                      : "Custom 3D Printed Figurine (unpainted)",
                  description: "Custom figurine from your photo",
                },
              },
            },
          ]
      : posterPriceId
        ? [{ quantity: 1, price: posterPriceId }]
        : [
            {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: 6000,
                product_data: {
                  name: "Custom 3D Print Poster",
                  description: "5in x 7in physical relief poster",
                },
              },
            },
          ];
```

Replace the existing `line_items: posterPriceId ? [...] : [...]` argument with `line_items: lineItems,` and add `paintOption` to the session `metadata` object (`paintOption: paintOption ?? ""`).

In the `orderRef.set` payload after session creation, add:

```ts
        paintOption,
        productType: jobData.productType ?? "poster",
```

and change the `priceSnapshot.unitAmount` to reflect the figurine fallback when `isFigurine` (use `isFigurine ? figurineFallbackAmount : 6000`).

Also include `paintOption` in the `checkoutIdempotencyKey` array (append `paintOption ?? "none"`) so switching paint options doesn't collide with a prior attempt.

- [ ] **Step 5: Typecheck functions**

Run: `cd apps/functions && npm run typecheck`
Expected: clean.

- [ ] **Step 6: Add the paint choice to the customer checkout UI**

In `apps/web/components/JobDetail.tsx`:

1. Add state near the other `useState` calls (search `checkoutBusy`):

```ts
  const [paintOption, setPaintOption] = useState<"painted" | "unpainted">("unpainted");
```

2. In `startCheckout` (line ~594), change the call to pass it for figurines:

```ts
      const result = await createCheckout(
        isFigurineJob ? { jobId, paintOption } : { jobId },
      );
```

Update the `CreateCheckoutSessionRequest` type in this file (search for it) to include `paintOption?: "painted" | "unpainted"`.

3. Find where the checkout button renders (search for `startCheckout` usage in JSX / `checkoutBusy`). Immediately above the button, add a figurine-only paint selector:

```tsx
        {isFigurineJob ? (
          <fieldset className="mt-4 rounded-lg border border-black/10 p-3">
            <legend className="px-1 text-sm font-bold">Finish</legend>
            <label className="mr-4 inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="paintOption"
                checked={paintOption === "unpainted"}
                onChange={() => setPaintOption("unpainted")}
              />
              Unpainted
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="paintOption"
                checked={paintOption === "painted"}
                onChange={() => setPaintOption("painted")}
              />
              Painted &amp; finished
            </label>
          </fieldset>
        ) : null}
```

- [ ] **Step 7: Typecheck web and commit**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean.

```bash
git add apps/functions/src/index.ts apps/web/components/JobDetail.tsx
git commit -m "feat(checkout): figurine paint option and eligibility-gated checkout"
```

---

## Task 6: Operator allowlist, `requireOperator`, and `getConsoleRole`

**Files:**
- Modify: `apps/functions/src/index.ts`

- [ ] **Step 1: Define the secret and helpers**

Next to `const adminSupportAllowlist = defineSecret("ADMIN_SUPPORT_ALLOWLIST");` (line ~71), add:

```ts
const operatorAllowlist = defineSecret("OPERATOR_ALLOWLIST");
```

Directly below `requireAdminSupport` (line ~2242), add:

```ts
function consolePrincipal(request: {
  auth?: { uid: string; token?: Record<string, unknown> };
}): { uid: string; email: string | null } {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }
  return {
    uid: request.auth.uid,
    email:
      typeof request.auth.token?.email === "string"
        ? request.auth.token.email
        : null,
  };
}

function consoleRoles(request: {
  auth?: { uid: string; token?: Record<string, unknown> };
}): { principal: { uid: string; email: string | null }; isAdmin: boolean; isOperator: boolean } {
  const principal = consolePrincipal(request);
  if (adminSupportDevelopmentAccessReason(process.env)) {
    return { principal, isAdmin: true, isOperator: true };
  }
  const adminList =
    adminSupportAllowlist.value()?.trim() ||
    process.env.ADMIN_SUPPORT_ALLOWLIST?.trim() ||
    "";
  const operatorList =
    operatorAllowlist.value()?.trim() ||
    process.env.OPERATOR_ALLOWLIST?.trim() ||
    "";
  const isAdmin = isAdminSupportAllowed({ allowlist: adminList, principal });
  // Admins are implicitly operators so the owner can exercise the operator view.
  const isOperator =
    isAdmin || isAdminSupportAllowed({ allowlist: operatorList, principal });
  return { principal, isAdmin, isOperator };
}

function requireOperator(request: {
  auth?: { uid: string; token?: Record<string, unknown> };
}): { uid: string; email: string | null } {
  const roles = consoleRoles(request);
  if (!roles.isOperator) {
    throw new HttpsError(
      "permission-denied",
      "This account is not on the operator allowlist.",
    );
  }
  return roles.principal;
}
```

- [ ] **Step 2: Add the `getConsoleRole` callable**

Add near the other admin callables (after `addAdminSupportNote` is fine):

```ts
export const getConsoleRole = onCall(
  {
    secrets: [adminSupportAllowlist, operatorAllowlist],
  },
  async (request) => {
    const roles = consoleRoles(request);
    return { isAdmin: roles.isAdmin, isOperator: roles.isOperator };
  },
);
```

- [ ] **Step 3: Typecheck, build, commit**

Run: `cd apps/functions && npm run typecheck && npm run build`
Expected: clean.

```bash
git add apps/functions/src/index.ts
git commit -m "feat(operator): operator allowlist and console role callable"
```

---

## Task 7: `listOperatorJobs` and `getOperatorJob` callables

**Files:**
- Modify: `apps/functions/src/index.ts`

- [ ] **Step 1: Add schemas and imports**

Imports (extend the existing import block):

```ts
import {
  customerFieldsFromSession,
  operatorTabStages,
  operatorTabs,
  sanitizeOperatorJobDetail,
  sanitizeOperatorJobSummary,
  selectBundleFiles,
} from "./operatorConsole.js";
```

(Merge with whatever was already imported from these modules in earlier tasks — one import statement per module. `buildJobSheet`, `canTransition`, and `displayJobId` get added in Task 8 where they're first used, to avoid unused-import errors at this commit.)

Schemas near the other zod schemas:

```ts
const listOperatorJobsSchema = z.object({
  tab: z.enum(operatorTabs),
});
const operatorJobIdSchema = z.object({
  jobId: z.string().min(1),
});
```

- [ ] **Step 2: Add the list callable**

```ts
export const listOperatorJobs = onCall(
  {
    secrets: [adminSupportAllowlist, operatorAllowlist],
  },
  async (request) => {
    requireOperator(request);
    const parsed = listOperatorJobsSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", "A valid tab is required.");
    }

    const stages = operatorTabStages[parsed.data.tab];
    const jobsSnap = await db
      .collection("jobs")
      .where("pipelineStage", "in", stages)
      .limit(200)
      .get();

    const items = await Promise.all(
      jobsSnap.docs.map(async (jobDoc) => {
        const orderSnap = await db.collection("orders").doc(jobDoc.id).get();
        return sanitizeOperatorJobSummary({
          jobId: jobDoc.id,
          jobData: jobDoc.data() as Record<string, unknown>,
          orderData: (orderSnap.data() ?? {}) as Record<string, unknown>,
        });
      }),
    );
    items.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    return { items };
  },
);
```

- [ ] **Step 3: Add a shared detail loader and the detail callable**

```ts
async function loadOperatorJobDocs(jobId: string) {
  const jobRef = db.collection("jobs").doc(jobId);
  const orderRef = db.collection("orders").doc(jobId);
  const [jobSnap, orderSnap] = await Promise.all([jobRef.get(), orderRef.get()]);
  const jobData = jobSnap.data() as Record<string, unknown> | undefined;
  if (!jobSnap.exists || !jobData) {
    throw new HttpsError("not-found", "Job not found.");
  }
  return {
    jobRef,
    orderRef,
    jobData,
    orderData: (orderSnap.data() ?? {}) as Record<string, unknown>,
  };
}

async function operatorJobDetailPayload(jobId: string) {
  const { jobData, orderData } = await loadOperatorJobDocs(jobId);
  const detail = sanitizeOperatorJobDetail({ jobId, jobData, orderData });

  const bucketName = resolveRequiredEnv("APP_STORAGE_BUCKET");
  let previewUrl: string | null = null;
  const thumbnailPath =
    (jobData.figurinePreview as { thumbnailPath?: string } | undefined)
      ?.thumbnailPath ??
    (typeof jobData.approvedImagePath === "string"
      ? jobData.approvedImagePath
      : null);
  if (thumbnailPath) {
    try {
      const signed = await signedModelUrl({ bucketName, storagePath: thumbnailPath });
      previewUrl = signed.url;
    } catch {
      previewUrl = null;
    }
  }

  let bundleUrl: string | null = null;
  if (detail.bundle.status === "ready" && detail.bundle.storagePath) {
    const signed = await signedModelUrl({
      bucketName,
      storagePath: detail.bundle.storagePath,
    });
    bundleUrl = signed.url;
  }

  const extraFiles = await Promise.all(
    selectBundleFiles({ jobId, jobData }).map(async (file) => {
      try {
        const signed = await signedModelUrl({ bucketName, storagePath: file.storagePath });
        return { name: file.name, url: signed.url };
      } catch {
        return { name: file.name, url: null };
      }
    }),
  );

  return { job: { ...detail, previewUrl, bundleUrl, files: extraFiles } };
}

export const getOperatorJob = onCall(
  {
    secrets: [adminSupportAllowlist, operatorAllowlist, appStorageBucket],
  },
  async (request) => {
    requireOperator(request);
    const parsed = operatorJobIdSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", "jobId is required.");
    }
    return operatorJobDetailPayload(parsed.data.jobId);
  },
);
```

Note: `resolveRequiredEnv` and `signedModelUrl` already exist in `index.ts` (`signedModelUrl` is at ~line 2992; `resolveRequiredEnv("APP_STORAGE_BUCKET")` is the established bucket-name pattern, e.g. line 2538 in `getAdminJobPreview`).

- [ ] **Step 4: Typecheck, build, commit**

Run: `cd apps/functions && npm run typecheck && npm run build`

```bash
git add apps/functions/src/index.ts
git commit -m "feat(operator): list and detail callables"
```

---

## Task 8: `operatorAcceptJob` + bundle build, `operatorUpdateFulfillment`

**Files:**
- Modify: `apps/functions/src/index.ts`, `apps/functions/package.json`

- [ ] **Step 1: Add the `archiver` dependency**

Run: `cd apps/functions && npm install archiver && npm install -D @types/archiver`

- [ ] **Step 2: Add a fulfillment transition helper**

In `index.ts`, near `loadOperatorJobDocs`:

```ts
async function applyFulfillmentTransition(input: {
  jobId: string;
  toStage: string;
  by: { uid: string; email: string | null };
  note?: string;
  extraOrderFields?: Record<string, unknown>;
}) {
  const jobRef = db.collection("jobs").doc(input.jobId);
  const orderRef = db.collection("orders").doc(input.jobId);

  await db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    const orderData = orderSnap.data();
    if (!orderSnap.exists || !orderData) {
      throw new HttpsError("failed-precondition", "This job has no paid order.");
    }
    const currentStage = (orderData.fulfillment as { stage?: unknown } | undefined)
      ?.stage;
    if (!canTransition(currentStage, input.toStage)) {
      throw new HttpsError(
        "failed-precondition",
        `Cannot move this job from "${String(currentStage)}" to "${input.toStage}".`,
      );
    }
    const now = FieldValue.serverTimestamp();
    tx.set(
      orderRef,
      {
        fulfillment: {
          stage: input.toStage,
          history: FieldValue.arrayUnion({
            stage: input.toStage,
            at: Timestamp.now(),
            by: input.by.email ?? input.by.uid,
            ...(input.note ? { note: input.note } : {}),
          }),
        },
        ...(input.extraOrderFields ?? {}),
        updatedAt: now,
      },
      { merge: true },
    );
    tx.set(
      jobRef,
      { pipelineStage: input.toStage, pipelineUpdatedAt: now, updatedAt: now },
      { merge: true },
    );
  });
}
```

- [ ] **Step 3: Add the bundle builder**

```ts
import archiver from "archiver";
import { PassThrough } from "node:stream";
```

(top of file, with the other imports), then near the operator callables:

```ts
async function buildPrintBundle(input: { jobId: string }): Promise<void> {
  const orderRef = db.collection("orders").doc(input.jobId);
  try {
    const { jobData, orderData } = await loadOperatorJobDocs(input.jobId);
    const files = selectBundleFiles({ jobId: input.jobId, jobData });
    if (files.length === 0) {
      throw new Error("No print artifacts found for this job.");
    }
    const bucketName = resolveRequiredEnv("APP_STORAGE_BUCKET");
    const bucket = getStorage().bucket(bucketName);
    const uid = typeof jobData.uid === "string" ? jobData.uid : "unknown";
    const bundlePath = `print-files/${uid}/${input.jobId}/operator/print-bundle-${displayJobId(input.jobId).toLowerCase()}.zip`;

    const archive = archiver("zip", { zlib: { level: 6 } });
    const passthrough = new PassThrough();
    const upload = bucket.file(bundlePath).save(passthrough, {
      contentType: "application/zip",
      resumable: false,
    });
    archive.pipe(passthrough);

    archive.append(
      buildJobSheet({ jobId: input.jobId, jobData, orderData }),
      { name: "job-sheet.txt" },
    );
    for (const file of files) {
      const [buffer] = await bucket.file(file.storagePath).download();
      archive.append(buffer, { name: file.name });
    }
    await archive.finalize();
    await upload;

    await orderRef.set(
      {
        printBundle: {
          status: "ready",
          storagePath: bundlePath,
          error: null,
          builtAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );
  } catch (error) {
    await orderRef.set(
      {
        printBundle: {
          status: "failed",
          error: String(error).slice(0, 500),
          builtAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );
  }
}
```

Extend the imports for this task: add `buildJobSheet` to the `./operatorConsole.js` import and add `canTransition` and `displayJobId` to the `./pipeline.js` import in `index.ts`.

- [ ] **Step 4: Add the accept callable**

```ts
export const operatorAcceptJob = onCall(
  {
    secrets: [adminSupportAllowlist, operatorAllowlist, appStorageBucket],
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  async (request) => {
    const operator = requireOperator(request);
    const parsed = operatorJobIdSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", "jobId is required.");
    }

    await applyFulfillmentTransition({
      jobId: parsed.data.jobId,
      toStage: "accepted",
      by: operator,
      extraOrderFields: {
        fulfillment: {
          stage: "accepted",
          acceptedAt: FieldValue.serverTimestamp(),
          acceptedBy: { uid: operator.uid, email: operator.email },
        },
        printBundle: { status: "building", error: null },
      },
    });

    await buildPrintBundle({ jobId: parsed.data.jobId });
    return operatorJobDetailPayload(parsed.data.jobId);
  },
);
```

**Careful:** `extraOrderFields.fulfillment` and the transition's own `fulfillment` write must not clobber each other — merge them. Adjust `applyFulfillmentTransition` so `extraOrderFields` is deep-merged into the same `tx.set` payload (spread `input.extraOrderFields?.fulfillment` inside the `fulfillment` object and spread the rest at top level):

```ts
    const extra = (input.extraOrderFields ?? {}) as Record<string, unknown>;
    const extraFulfillment = (extra.fulfillment ?? {}) as Record<string, unknown>;
    const { fulfillment: _ignored, ...extraTopLevel } = extra;
    tx.set(
      orderRef,
      {
        fulfillment: {
          stage: input.toStage,
          ...extraFulfillment,
          history: FieldValue.arrayUnion({
            stage: input.toStage,
            at: Timestamp.now(),
            by: input.by.email ?? input.by.uid,
            ...(input.note ? { note: input.note } : {}),
          }),
        },
        ...extraTopLevel,
        updatedAt: now,
      },
      { merge: true },
    );
```

- [ ] **Step 5: Add the fulfillment-update callable**

```ts
const operatorUpdateFulfillmentSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start_production"), jobId: z.string().min(1) }),
  z.object({
    action: z.literal("set_production_substate"),
    jobId: z.string().min(1),
    subState: z.enum(["printing", "painting"]),
  }),
  z.object({
    action: z.literal("reject"),
    jobId: z.string().min(1),
    reason: z.string().min(5).max(2000),
  }),
  z.object({
    action: z.literal("ship"),
    jobId: z.string().min(1),
    carrier: z.string().min(2).max(60),
    trackingNumber: z.string().min(4).max(120),
  }),
]);

export const operatorUpdateFulfillment = onCall(
  {
    secrets: [adminSupportAllowlist, operatorAllowlist, appStorageBucket],
  },
  async (request) => {
    const operator = requireOperator(request);
    const parsed = operatorUpdateFulfillmentSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", "Invalid fulfillment action.");
    }
    const data = parsed.data;

    if (data.action === "start_production") {
      await applyFulfillmentTransition({
        jobId: data.jobId,
        toStage: "in_production",
        by: operator,
        extraOrderFields: {
          fulfillment: { stage: "in_production", productionSubState: "printing" },
        },
      });
    } else if (data.action === "set_production_substate") {
      const { orderRef, orderData } = await loadOperatorJobDocs(data.jobId);
      const stage = (orderData.fulfillment as { stage?: unknown } | undefined)?.stage;
      if (stage !== "in_production") {
        throw new HttpsError(
          "failed-precondition",
          "Sub-state can only change while the job is in production.",
        );
      }
      await orderRef.set(
        {
          fulfillment: { productionSubState: data.subState },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    } else if (data.action === "reject") {
      await applyFulfillmentTransition({
        jobId: data.jobId,
        toStage: "rejected_by_operator",
        by: operator,
        note: data.reason,
        extraOrderFields: {
          fulfillment: {
            stage: "rejected_by_operator",
            rejection: {
              reason: data.reason,
              at: Timestamp.now(),
              by: operator.email ?? operator.uid,
            },
          },
        },
      });
      // Surface the rejection in the existing admin-support workflow.
      const jobRef = db.collection("jobs").doc(data.jobId);
      const noteRef = jobRef.collection("supportNotes").doc();
      const batch = db.batch();
      batch.set(noteRef, {
        body: `Print service rejected this job: ${data.reason}`,
        statusChange: "open",
        createdAt: FieldValue.serverTimestamp(),
        createdByUid: operator.uid,
        createdByEmail: operator.email,
      });
      batch.set(
        jobRef,
        {
          supportSummary: {
            status: "open",
            noteCount: FieldValue.increment(1),
            lastNoteAt: FieldValue.serverTimestamp(),
            lastNoteByUid: operator.uid,
            lastNoteByEmail: operator.email,
            lastNotePreview: `Print service rejected: ${data.reason}`.slice(0, 160),
            updatedAt: FieldValue.serverTimestamp(),
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await batch.commit();
    } else {
      await applyFulfillmentTransition({
        jobId: data.jobId,
        toStage: "shipped",
        by: operator,
        extraOrderFields: {
          fulfillment: {
            stage: "shipped",
            tracking: {
              carrier: data.carrier,
              number: data.trackingNumber,
              at: Timestamp.now(),
            },
          },
        },
      });
    }

    return operatorJobDetailPayload(data.jobId);
  },
);
```

- [ ] **Step 6: Typecheck, build, run tests, commit**

Run: `cd apps/functions && npm run typecheck && npm run build && npm run test:pipeline`
Expected: clean, tests pass.

```bash
git add apps/functions/src/index.ts apps/functions/package.json apps/functions/package-lock.json
git commit -m "feat(operator): accept, bundle build, and fulfillment update callables"
```

---

## Task 9: `adminRefundJob` and `adminSetFulfillment`

**Files:**
- Modify: `apps/functions/src/index.ts`

- [ ] **Step 1: Add the refund callable**

```ts
const adminJobIdSchema = z.object({ jobId: z.string().min(1) });

export const adminRefundJob = onCall(
  {
    secrets: [adminSupportAllowlist, stripeSecretKey],
  },
  async (request) => {
    const admin = requireAdminSupport(request);
    const parsed = adminJobIdSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", "jobId is required.");
    }

    const { orderData } = await loadOperatorJobDocs(parsed.data.jobId);
    const stage = (orderData.fulfillment as { stage?: unknown } | undefined)?.stage;
    if (!canTransition(stage, "refunded")) {
      throw new HttpsError(
        "failed-precondition",
        "Only paid jobs that are not already refunded can be refunded.",
      );
    }
    const paymentIntentId = orderData.stripePaymentIntentId;
    if (typeof paymentIntentId !== "string" || !paymentIntentId) {
      throw new HttpsError(
        "failed-precondition",
        "No Stripe payment intent is recorded for this order.",
      );
    }

    const stripe = new Stripe(stripeSecretKey.value());
    const refund = await stripe.refunds.create({ payment_intent: paymentIntentId });

    await applyFulfillmentTransition({
      jobId: parsed.data.jobId,
      toStage: "refunded",
      by: admin,
      extraOrderFields: {
        fulfillment: {
          stage: "refunded",
          refund: {
            stripeRefundId: refund.id,
            amountCents: refund.amount,
            at: Timestamp.now(),
            by: admin.email ?? admin.uid,
          },
        },
      },
    });
    return { refundId: refund.id };
  },
);
```

- [ ] **Step 2: Add the admin escape hatch**

```ts
const adminSetFulfillmentSchema = z.object({
  jobId: z.string().min(1),
  action: z.enum(["complete", "requeue", "cancel"]),
});

export const adminSetFulfillment = onCall(
  {
    secrets: [adminSupportAllowlist],
  },
  async (request) => {
    const admin = requireAdminSupport(request);
    const parsed = adminSetFulfillmentSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", "jobId and action are required.");
    }

    if (parsed.data.action === "complete") {
      await applyFulfillmentTransition({
        jobId: parsed.data.jobId,
        toStage: "completed",
        by: admin,
      });
    } else if (parsed.data.action === "requeue") {
      await applyFulfillmentTransition({
        jobId: parsed.data.jobId,
        toStage: "paid",
        by: admin,
        note: "Re-queued after operator rejection.",
        extraOrderFields: {
          fulfillment: { stage: "paid", rejection: null },
          printBundle: { status: "not_built", storagePath: null, error: null },
        },
      });
    } else {
      // cancel: unpaid jobs only — there is no order/fulfillment doc to transition.
      const orderSnap = await db.collection("orders").doc(parsed.data.jobId).get();
      if (
        orderSnap.exists &&
        (orderSnap.data()?.paymentStatus === "paid" ||
          orderSnap.data()?.status === "paid")
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Paid jobs cannot be canceled — refund instead.",
        );
      }
      const now = FieldValue.serverTimestamp();
      await db.collection("jobs").doc(parsed.data.jobId).set(
        {
          status: "canceled",
          pipelineStage: "canceled",
          pipelineUpdatedAt: now,
          updatedAt: now,
        },
        { merge: true },
      );
    }
    return { ok: true };
  },
);
```

- [ ] **Step 3: Typecheck, build, commit**

Run: `cd apps/functions && npm run typecheck && npm run build`

```bash
git add apps/functions/src/index.ts
git commit -m "feat(admin): stripe refund and fulfillment escape-hatch callables"
```

---

## Task 10: Expose `pipelineStage` in admin sanitizers + filter

**Files:**
- Modify: `apps/functions/src/adminSupport.ts`
- Modify: `apps/functions/src/index.ts` (filter schema)
- Test: `apps/functions/test/adminSupport.test.mjs` (extend)

- [ ] **Step 1: Write the failing test**

Append to `apps/functions/test/adminSupport.test.mjs`:

```js
test("job summary exposes a derived pipeline stage and label", () => {
  const summary = sanitizeAdminSupportJobSummary({
    jobId: "job-1",
    jobData: { ...baseJob(), status: "approved" },
  });
  assert.equal(summary.pipelineStage, "2d_approved");
  assert.equal(summary.pipelineStageLabel, "2D Approved");
});

test("stamped pipelineStage wins over derivation", () => {
  const summary = sanitizeAdminSupportJobSummary({
    jobId: "job-1",
    jobData: { ...baseJob(), status: "approved", pipelineStage: "in_production" },
  });
  assert.equal(summary.pipelineStage, "in_production");
});

test("pipelineStage filter matches derived stage", () => {
  const job = sanitizeAdminSupportJobSummary({
    jobId: "job-1",
    jobData: { ...baseJob(), status: "approved" },
  });
  assert.equal(
    jobMatchesAdminSupportFilters(job, { pipelineStage: "2d_approved" }),
    true,
  );
  assert.equal(
    jobMatchesAdminSupportFilters(job, { pipelineStage: "paid" }),
    false,
  );
});
```

Run: `cd apps/functions && npm run test:admin-support`
Expected: new tests FAIL.

- [ ] **Step 2: Implement in `adminSupport.ts`**

1. Import at the top:

```ts
import {
  derivePipelineStage,
  pipelineStageLabels,
  type PipelineStage,
} from "./pipeline.js";
```

2. Add to `AdminSupportJobSummary` type:

```ts
  pipelineStage: PipelineStage;
  pipelineStageLabel: string;
```

3. Add to `AdminSupportFilters` type:

```ts
  pipelineStage?: PipelineStage;
```

4. In `sanitizeAdminSupportJobSummary`, add to the returned object (it receives `jobData`; find the return statement):

```ts
    pipelineStage: derivePipelineStage({ job: input.jobData }),
    pipelineStageLabel:
      pipelineStageLabels[derivePipelineStage({ job: input.jobData })],
```

(Compute once into a local `const pipelineStage = derivePipelineStage({ job: input.jobData });` and use it for both fields.)

5. In `jobMatchesAdminSupportFilters` (find it in `adminSupport.ts`), add alongside the other filter checks:

```ts
  if (filters.pipelineStage && job.pipelineStage !== filters.pipelineStage) {
    return false;
  }
```

6. In `index.ts`, extend `listAdminSupportJobsSchema` with:

```ts
  pipelineStage: z.enum(pipelineStages).optional(),
```

(import `pipelineStages` from `./pipeline.js`), and add `...(data.pipelineStage ? { pipelineStage: data.pipelineStage } : {})` to `buildAdminSupportFilters`.

- [ ] **Step 3: Run tests, typecheck, commit**

Run: `cd apps/functions && npm run test:admin-support && npm run typecheck`
Expected: PASS.

```bash
git add apps/functions/src/adminSupport.ts apps/functions/src/index.ts apps/functions/test/adminSupport.test.mjs
git commit -m "feat(admin): derived pipeline stage in summaries and filters"
```

---

## Task 11: Operator console UI

**Files:**
- Create: `apps/web/app/operator/page.tsx`
- Create: `apps/web/components/OperatorConsole.tsx`

- [ ] **Step 1: Create the route**

`apps/web/app/operator/page.tsx`:

```tsx
import { OperatorConsole } from "@/components/OperatorConsole";

export default function OperatorPage() {
  return <OperatorConsole />;
}
```

- [ ] **Step 2: Create the console component**

`apps/web/components/OperatorConsole.tsx` — full file:

```tsx
"use client";

import { getFirebaseClients } from "@/lib/firebase";
import {
  callableErrorMessage,
  callWithTransientRetry,
} from "@/lib/callableRetry";
import { pipelineStageLabels, type FulfillmentStage } from "@/lib/pipeline";
import { httpsCallable } from "firebase/functions";
import { useEffect, useMemo, useState } from "react";

type OperatorTab = "available" | "mine" | "done";

type OperatorJobSummary = {
  jobId: string;
  displayId: string;
  customerName: string;
  stage: FulfillmentStage;
  productionSubState: "printing" | "painting" | null;
  paintOption: "painted" | "unpainted" | null;
  productType: string | null;
  updatedAt: string | null;
};

type OperatorJobDetail = OperatorJobSummary & {
  shipTo: {
    name: string | null;
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  } | null;
  customerEmail: string | null;
  tracking: { carrier: string | null; number: string | null; at: string | null } | null;
  rejection: { reason: string | null; at: string | null } | null;
  bundle: { status: string; storagePath: string | null; error: string | null };
  history: Array<{ stage: string | null; at: string | null; by: string | null; note: string | null }>;
  previewUrl: string | null;
  bundleUrl: string | null;
  files: Array<{ name: string; url: string | null }>;
};

const tabs: Array<{ id: OperatorTab; label: string }> = [
  { id: "available", label: "Available" },
  { id: "mine", label: "My jobs" },
  { id: "done", label: "Shipped & Done" },
];

function formatWhen(value: string | null) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function stageTone(stage: FulfillmentStage) {
  if (stage === "paid") {
    return "border-[var(--gold)]/40 bg-[var(--gold)]/10 text-[#8a6412]";
  }
  if (stage === "rejected_by_operator" || stage === "refunded") {
    return "border-[var(--coral)]/40 bg-[var(--coral)]/10 text-[var(--coral)]";
  }
  return "border-[var(--teal)]/40 bg-[var(--teal)]/10 text-[var(--teal)]";
}

export function OperatorConsole() {
  const firebaseClients = useMemo(() => getFirebaseClients(), []);
  const [role, setRole] = useState<{ isOperator: boolean } | null>(null);
  const [tab, setTab] = useState<OperatorTab>("available");
  const [jobs, setJobs] = useState<OperatorJobSummary[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [detail, setDetail] = useState<OperatorJobDetail | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");

  useEffect(() => {
    if (!firebaseClients) {
      return;
    }
    const getRole = httpsCallable<Record<string, never>, { isOperator: boolean }>(
      firebaseClients.functions,
      "getConsoleRole",
    );
    callWithTransientRetry(() => getRole({}))
      .then((result) => setRole(result.data))
      .catch(() => setRole({ isOperator: false }));
  }, [firebaseClients]);

  async function loadJobs(nextTab: OperatorTab) {
    if (!firebaseClients) {
      return;
    }
    setListLoading(true);
    setError("");
    try {
      const list = httpsCallable<{ tab: OperatorTab }, { items: OperatorJobSummary[] }>(
        firebaseClients.functions,
        "listOperatorJobs",
      );
      const result = await callWithTransientRetry(() => list({ tab: nextTab }));
      setJobs(result.data.items);
    } catch (listError) {
      setError(callableErrorMessage(listError, "Loading jobs failed."));
    } finally {
      setListLoading(false);
    }
  }

  async function loadDetail(jobId: string) {
    if (!firebaseClients) {
      return;
    }
    setDetailLoading(true);
    setError("");
    try {
      const getJob = httpsCallable<{ jobId: string }, { job: OperatorJobDetail }>(
        firebaseClients.functions,
        "getOperatorJob",
      );
      const result = await callWithTransientRetry(() => getJob({ jobId }));
      setDetail(result.data.job);
    } catch (detailError) {
      setError(callableErrorMessage(detailError, "Loading the job failed."));
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    if (role?.isOperator) {
      void loadJobs(tab);
      setSelectedJobId("");
      setDetail(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, tab]);

  async function runAction(input: Record<string, unknown>, callableName: string) {
    if (!firebaseClients || !detail) {
      return;
    }
    setActionBusy(true);
    setError("");
    try {
      const callable = httpsCallable<Record<string, unknown>, { job: OperatorJobDetail }>(
        firebaseClients.functions,
        callableName,
      );
      const result = await callable({ jobId: detail.jobId, ...input });
      if (result.data?.job) {
        setDetail(result.data.job);
      }
      await loadJobs(tab);
    } catch (actionError) {
      setError(callableErrorMessage(actionError, "The action failed."));
    } finally {
      setActionBusy(false);
    }
  }

  if (role === null) {
    return <section className="panel rounded-lg p-6">Checking access…</section>;
  }
  if (!role.isOperator) {
    return (
      <section className="panel rounded-lg p-6">
        <h1 className="display text-2xl">Print Console</h1>
        <p className="mt-2 text-[var(--muted)]">
          This account is not on the operator allowlist. Contact the site admin.
        </p>
      </section>
    );
  }

  return (
    <section className="panel min-w-0 rounded-lg p-5 sm:p-6">
      <h1 className="display text-2xl">Print Console</h1>
      <div className="mt-4 flex gap-2">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={`rounded-full px-4 py-2 text-sm font-black ${
              tab === entry.id
                ? "bg-[var(--teal)] text-white"
                : "bg-black/5 text-[var(--muted)]"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-[var(--coral)]/40 bg-[var(--coral)]/10 p-3 text-sm font-bold text-[var(--coral)]">
          {error}
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_3fr]">
        <div className="flex flex-col gap-2">
          {listLoading ? <p className="text-sm text-[var(--muted)]">Loading…</p> : null}
          {!listLoading && jobs.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No jobs in this queue.</p>
          ) : null}
          {jobs.map((job) => (
            <button
              key={job.jobId}
              type="button"
              onClick={() => {
                setSelectedJobId(job.jobId);
                void loadDetail(job.jobId);
              }}
              className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-left ${
                selectedJobId === job.jobId
                  ? "border-[var(--teal)] bg-[var(--teal)]/5"
                  : "border-black/10 bg-white"
              }`}
            >
              <span className="min-w-0">
                <span className="font-black">{job.customerName}</span>{" "}
                <span className="text-[var(--muted)]">#{job.displayId}</span>
              </span>
              <span
                className={`shrink-0 rounded-full border px-2 py-1 text-xs font-black ${stageTone(job.stage)}`}
              >
                {pipelineStageLabels[job.stage]}
                {job.productionSubState ? ` · ${job.productionSubState}` : ""}
              </span>
              <span className="shrink-0 text-xs text-[var(--muted)]">
                {formatWhen(job.updatedAt)}
              </span>
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-black/10 p-4">
          {detailLoading ? <p className="text-sm text-[var(--muted)]">Loading job…</p> : null}
          {!detailLoading && !detail ? (
            <p className="text-sm text-[var(--muted)]">Select a job to see details.</p>
          ) : null}
          {detail && !detailLoading ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-black">
                  {detail.customerName} — #{detail.displayId}
                </h2>
                <span
                  className={`rounded-full border px-3 py-1 text-sm font-black ${stageTone(detail.stage)}`}
                >
                  {pipelineStageLabels[detail.stage]}
                </span>
              </div>
              <p className="text-sm text-[var(--muted)]">
                {detail.productType ?? "product"} ·{" "}
                {detail.paintOption === "painted" ? "Painted & finished" : "Unpainted"} ·
                last action {formatWhen(detail.updatedAt)}
              </p>

              {detail.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={detail.previewUrl}
                  alt="Job preview"
                  className="max-h-56 w-fit rounded-lg border border-black/10"
                />
              ) : null}

              {detail.shipTo ? (
                <div className="rounded-lg bg-black/5 p-3 text-sm">
                  <p className="font-black">Ship to</p>
                  <p>{detail.shipTo.name}</p>
                  <p>{detail.shipTo.line1}</p>
                  {detail.shipTo.line2 ? <p>{detail.shipTo.line2}</p> : null}
                  <p>
                    {detail.shipTo.city}, {detail.shipTo.state} {detail.shipTo.postalCode}{" "}
                    {detail.shipTo.country}
                  </p>
                </div>
              ) : null}

              {detail.rejection?.reason ? (
                <p className="rounded-lg border border-[var(--coral)]/40 bg-[var(--coral)]/10 p-3 text-sm">
                  Rejected: {detail.rejection.reason}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {detail.stage === "paid" ? (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void runAction({}, "operatorAcceptJob")}
                    className="rounded-lg bg-[var(--teal)] px-4 py-2 font-black text-white disabled:opacity-50"
                  >
                    {actionBusy ? "Accepting…" : "Accept job"}
                  </button>
                ) : null}

                {detail.stage !== "paid" && detail.bundle.status === "ready" && detail.bundleUrl ? (
                  <a
                    href={detail.bundleUrl}
                    className="rounded-lg border border-[var(--teal)] px-4 py-2 font-black text-[var(--teal)]"
                  >
                    Download print bundle (.zip)
                  </a>
                ) : null}
                {detail.stage !== "paid" && detail.bundle.status === "building" ? (
                  <span className="px-2 py-2 text-sm text-[var(--muted)]">
                    Bundle building — refresh shortly.
                  </span>
                ) : null}
                {detail.stage !== "paid" && detail.bundle.status === "failed" ? (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void loadDetail(detail.jobId)}
                    className="rounded-lg border border-[var(--coral)] px-4 py-2 font-black text-[var(--coral)]"
                  >
                    Bundle failed — use individual files below
                  </button>
                ) : null}

                {detail.stage === "accepted" ? (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() =>
                      void runAction({ action: "start_production" }, "operatorUpdateFulfillment")
                    }
                    className="rounded-lg bg-[var(--teal)] px-4 py-2 font-black text-white disabled:opacity-50"
                  >
                    Start production
                  </button>
                ) : null}

                {detail.stage === "in_production" && detail.paintOption === "painted" ? (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() =>
                      void runAction(
                        {
                          action: "set_production_substate",
                          subState:
                            detail.productionSubState === "painting" ? "printing" : "painting",
                        },
                        "operatorUpdateFulfillment",
                      )
                    }
                    className="rounded-lg border border-[var(--teal)] px-4 py-2 font-black text-[var(--teal)] disabled:opacity-50"
                  >
                    {detail.productionSubState === "painting"
                      ? "Back to printing"
                      : "Move to painting"}
                  </button>
                ) : null}
              </div>

              {detail.stage === "in_production" ? (
                <div className="rounded-lg border border-black/10 p-3">
                  <p className="text-sm font-black">Mark shipped</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      className="rounded-lg border border-black/20 px-3 py-2 text-sm"
                      placeholder="Carrier (USPS, UPS…)"
                      value={carrier}
                      onChange={(event) => setCarrier(event.target.value)}
                    />
                    <input
                      className="rounded-lg border border-black/20 px-3 py-2 text-sm"
                      placeholder="Tracking number"
                      value={trackingNumber}
                      onChange={(event) => setTrackingNumber(event.target.value)}
                    />
                    <button
                      type="button"
                      disabled={actionBusy || carrier.length < 2 || trackingNumber.length < 4}
                      onClick={() =>
                        void runAction(
                          { action: "ship", carrier, trackingNumber },
                          "operatorUpdateFulfillment",
                        )
                      }
                      className="rounded-lg bg-[var(--teal)] px-4 py-2 font-black text-white disabled:opacity-50"
                    >
                      Mark shipped
                    </button>
                  </div>
                </div>
              ) : null}

              {detail.stage === "accepted" || detail.stage === "in_production" ? (
                <div className="rounded-lg border border-black/10 p-3">
                  <p className="text-sm font-black">Reject job</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      className="min-w-64 flex-1 rounded-lg border border-black/20 px-3 py-2 text-sm"
                      placeholder="Reason (required)"
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                    />
                    <button
                      type="button"
                      disabled={actionBusy || rejectReason.trim().length < 5}
                      onClick={() =>
                        void runAction(
                          { action: "reject", reason: rejectReason.trim() },
                          "operatorUpdateFulfillment",
                        )
                      }
                      className="rounded-lg border border-[var(--coral)] px-4 py-2 font-black text-[var(--coral)] disabled:opacity-50"
                    >
                      Reject for printing
                    </button>
                  </div>
                </div>
              ) : null}

              {detail.tracking?.number ? (
                <p className="text-sm">
                  Shipped via {detail.tracking.carrier} — tracking{" "}
                  <span className="font-black">{detail.tracking.number}</span>
                </p>
              ) : null}

              {detail.stage !== "paid" && detail.files.length > 0 ? (
                <details className="rounded-lg border border-black/10 p-3">
                  <summary className="cursor-pointer text-sm font-black">
                    Additional files
                  </summary>
                  <ul className="mt-2 flex flex-col gap-1 text-sm">
                    {detail.files.map((file) => (
                      <li key={file.name}>
                        {file.url ? (
                          <a className="text-[var(--teal)] underline" href={file.url}>
                            {file.name}
                          </a>
                        ) : (
                          <span className="text-[var(--muted)]">{file.name} (unavailable)</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              {detail.history.length > 0 ? (
                <div className="rounded-lg bg-black/5 p-3">
                  <p className="text-sm font-black">History</p>
                  <ul className="mt-1 flex flex-col gap-1 text-xs text-[var(--muted)]">
                    {detail.history.map((entry, index) => (
                      <li key={index}>
                        {formatWhen(entry.at)} — {entry.stage} by {entry.by}
                        {entry.note ? ` — ${entry.note}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
```

Note: `apps/web/lib/pipeline.ts` (Task 2) must export `FulfillmentStage` — it does.

- [ ] **Step 3: Typecheck and build web**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean. Fix any variance between this code and the real `getFirebaseClients` return shape (see `apps/web/lib/firebase.ts` — it may return `null` when unconfigured; mirror how `AdminSupportJobs.tsx` handles that, e.g. guard `firebaseClients` truthiness the same way).

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/operator/page.tsx apps/web/components/OperatorConsole.tsx
git commit -m "feat(web): operator print console with work-queue tabs"
```

---

## Task 12: Admin console — pipeline labels, filter, fulfillment section, admin actions

**Files:**
- Modify: `apps/web/components/AdminSupportJobs.tsx`
- Modify: `apps/functions/src/adminSupport.ts` (detail order fields)

- [ ] **Step 1: Expose fulfillment on the admin detail**

In `apps/functions/src/adminSupport.ts`, extend the `order` object type in `AdminSupportJobDetail` (line ~80) with:

```ts
    customerName: string | null;
    shippingAddress: Record<string, string | null> | null;
    paintOption: string | null;
    fulfillment: {
      stage: string | null;
      productionSubState: string | null;
      acceptedByEmail: string | null;
      trackingCarrier: string | null;
      trackingNumber: string | null;
      rejectionReason: string | null;
      history: Array<{ stage: string | null; at: string | null; by: string | null; note: string | null }>;
    } | null;
```

Then replace `sanitizeOrder` (line ~371) with:

```ts
function sanitizeOrder(orderData: Record<string, unknown>) {
  const priceSnapshot = asRecord(orderData.priceSnapshot);
  const fulfillment = asRecord(orderData.fulfillment);
  const acceptedBy = asRecord(fulfillment?.acceptedBy);
  const tracking = asRecord(fulfillment?.tracking);
  const rejection = asRecord(fulfillment?.rejection);
  const shippingAddress = asRecord(orderData.shippingAddress);
  const historyRaw = Array.isArray(fulfillment?.history) ? fulfillment.history : [];
  return {
    status: asString(orderData.status),
    paymentStatus: asString(orderData.paymentStatus),
    fulfillmentStatus: asString(orderData.fulfillmentStatus),
    checkoutAttempt: asNumber(orderData.checkoutAttempt),
    priceCurrency: asString(priceSnapshot?.currency),
    priceUnitAmount: asNumber(priceSnapshot?.unitAmount),
    updatedAt: toIsoString(orderData.updatedAt),
    createdAt: toIsoString(orderData.createdAt),
    customerName: asString(orderData.customerName),
    shippingAddress: shippingAddress
      ? {
          name: asString(shippingAddress.name),
          line1: asString(shippingAddress.line1),
          line2: asString(shippingAddress.line2),
          city: asString(shippingAddress.city),
          state: asString(shippingAddress.state),
          postalCode: asString(shippingAddress.postalCode),
          country: asString(shippingAddress.country),
        }
      : null,
    paintOption: asString(orderData.paintOption),
    fulfillment: fulfillment
      ? {
          stage: asString(fulfillment.stage),
          productionSubState: asString(fulfillment.productionSubState),
          acceptedByEmail: asString(acceptedBy?.email),
          trackingCarrier: asString(tracking?.carrier),
          trackingNumber: asString(tracking?.number),
          rejectionReason: asString(rejection?.reason),
          history: historyRaw.map((entry) => {
            const item = asRecord(entry as Record<string, unknown>);
            return {
              stage: asString(item?.stage),
              at: toIsoString(item?.at),
              by: asString(item?.by),
              note: asString(item?.note),
            };
          }),
        }
      : null,
  };
}
```

(`asRecord`, `asString`, `asNumber`, and `toIsoString` already exist in this file — check `asRecord`'s exact null behavior: if it returns `null` for non-objects, the `fulfillment ? ... : null` ternary works as written.)

Run: `cd apps/functions && npm run test:admin-support && npm run typecheck` — extend `baseJob`-style fixtures only if the existing detail test fails on the new fields (they are additive nulls, so it should pass).

- [ ] **Step 2: Friendly labels in the jobs list**

In `apps/web/components/AdminSupportJobs.tsx`:

1. Import: `import { pipelineStageLabels, pipelineStages, type PipelineStage } from "@/lib/pipeline";`
2. Add to the `JobSummary` type: `pipelineStage: PipelineStage; pipelineStageLabel: string;` and mirror the detail `order` additions from Step 1 into the `JobDetail` type.
3. In the list row (line ~481), replace `{label(job.status)}` inside the status pill with `{job.pipelineStageLabel}`.
4. In `statusTone`, accept the new stage values — replace the function with:

```ts
function statusTone(status: string | null | undefined) {
  if (
    status === "resolved" || status === "paid" || status === "generated" ||
    status === "accepted" || status === "in_production" || status === "shipped" ||
    status === "completed" || status === "3d_ready"
  ) {
    return "border-[var(--teal)]/30 bg-[var(--teal)]/10 text-[var(--teal)]";
  }
  if (
    status === "blocked" || status === "failed" || status === "expired" ||
    status === "rejected_by_operator" || status === "refunded" || status === "canceled"
  ) {
    return "border-[var(--coral)]/30 bg-[var(--coral)]/10 text-[var(--coral)]";
  }
  return "border-[var(--gold)]/30 bg-[var(--gold)]/10 text-[#8a6412]";
}
```

and pass `job.pipelineStage` to it in the row (`statusTone(job.pipelineStage)`).
5. In the detail metadata table (line ~574 `["Job", label(selectedJob.status)]`), keep the raw status row but relabel it: `["Internal status", label(selectedJob.status)]`, and add a row above it: `["Pipeline", selectedJob.pipelineStageLabel]`.

- [ ] **Step 3: Pipeline filter dropdown**

Add state `const [pipelineStage, setPipelineStage] = useState<"" | PipelineStage>("");`, include it in `filterKey`, pass it in the list request (`...(pipelineStage ? { pipelineStage } : {})` — also add `pipelineStage?: PipelineStage` to `ListAdminSupportJobsRequest`), and render a `<select>` next to the existing "Job status" filter:

```tsx
          <label className="flex flex-col gap-1 text-xs font-bold">
            Pipeline stage
            <select
              className="rounded-lg border border-black/20 px-2 py-2 text-sm"
              value={pipelineStage}
              onChange={(event) =>
                setPipelineStage(event.target.value as "" | PipelineStage)
              }
            >
              <option value="">All stages</option>
              {pipelineStages.map((stage) => (
                <option value={stage} key={stage}>
                  {pipelineStageLabels[stage]}
                </option>
              ))}
            </select>
          </label>
```

- [ ] **Step 4: Fulfillment section + admin actions in the detail pane**

In the detail pane (after the existing Order section around line 595), add:

```tsx
              {selectedJob.order?.fulfillment ? (
                <div className="mt-4 rounded-lg border border-black/10 p-3">
                  <h3 className="text-sm font-black">Fulfillment</h3>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <dt className="text-[var(--muted)]">Stage</dt>
                    <dd>{label(selectedJob.order.fulfillment.stage)}</dd>
                    <dt className="text-[var(--muted)]">Operator</dt>
                    <dd>{label(selectedJob.order.fulfillment.acceptedByEmail)}</dd>
                    <dt className="text-[var(--muted)]">Sub-state</dt>
                    <dd>{label(selectedJob.order.fulfillment.productionSubState)}</dd>
                    <dt className="text-[var(--muted)]">Tracking</dt>
                    <dd>
                      {selectedJob.order.fulfillment.trackingNumber
                        ? `${selectedJob.order.fulfillment.trackingCarrier ?? ""} ${selectedJob.order.fulfillment.trackingNumber}`
                        : "Not shipped"}
                    </dd>
                    {selectedJob.order.fulfillment.rejectionReason ? (
                      <>
                        <dt className="text-[var(--muted)]">Rejected</dt>
                        <dd>{selectedJob.order.fulfillment.rejectionReason}</dd>
                      </>
                    ) : null}
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {["paid", "accepted", "in_production", "shipped", "completed"].includes(
                      selectedJob.order.fulfillment.stage ?? "",
                    ) ? (
                      <button
                        type="button"
                        disabled={fulfillmentBusy}
                        onClick={() => void refundJob()}
                        className="rounded-lg border border-[var(--coral)] px-3 py-2 text-sm font-black text-[var(--coral)] disabled:opacity-50"
                      >
                        Refund
                      </button>
                    ) : null}
                    {selectedJob.order.fulfillment.stage === "rejected_by_operator" ? (
                      <button
                        type="button"
                        disabled={fulfillmentBusy}
                        onClick={() => void setFulfillment("requeue")}
                        className="rounded-lg border border-[var(--teal)] px-3 py-2 text-sm font-black text-[var(--teal)] disabled:opacity-50"
                      >
                        Re-queue for operator
                      </button>
                    ) : null}
                    {selectedJob.order.fulfillment.stage === "shipped" ? (
                      <button
                        type="button"
                        disabled={fulfillmentBusy}
                        onClick={() => void setFulfillment("complete")}
                        className="rounded-lg border border-[var(--teal)] px-3 py-2 text-sm font-black text-[var(--teal)] disabled:opacity-50"
                      >
                        Mark completed
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
```

with these handlers and state inside the component:

```ts
  const [fulfillmentBusy, setFulfillmentBusy] = useState(false);

  async function refundJob() {
    if (!selectedJob || !window.confirm("Refund this job in Stripe? This cannot be undone.")) {
      return;
    }
    setFulfillmentBusy(true);
    setError("");
    try {
      const refund = httpsCallable<{ jobId: string }, { refundId: string }>(
        firebaseClients.functions,
        "adminRefundJob",
      );
      await refund({ jobId: selectedJob.jobId });
      setNotice("Refund issued.");
      await loadJobDetail(selectedJob.jobId);
    } catch (refundError) {
      setError(callableErrorMessage(refundError, "Refund failed."));
    } finally {
      setFulfillmentBusy(false);
    }
  }

  async function setFulfillment(action: "complete" | "requeue" | "cancel") {
    if (!selectedJob) {
      return;
    }
    setFulfillmentBusy(true);
    setError("");
    try {
      const update = httpsCallable<{ jobId: string; action: string }, { ok: boolean }>(
        firebaseClients.functions,
        "adminSetFulfillment",
      );
      await update({ jobId: selectedJob.jobId, action });
      setNotice("Fulfillment updated.");
      await loadJobDetail(selectedJob.jobId);
    } catch (updateError) {
      setError(callableErrorMessage(updateError, "Updating fulfillment failed."));
    } finally {
      setFulfillmentBusy(false);
    }
  }
```

Note: the component's existing detail loader may be named differently (search for the function that calls `getAdminSupportJob` — around line 318 it's used inside a `loadJob`-style function). Use that exact function name instead of `loadJobDetail` if it differs.

- [ ] **Step 5: Typecheck, build, commit**

Run: `cd apps/web && npx tsc --noEmit && cd ../functions && npm run typecheck`
Expected: clean.

```bash
git add apps/web/components/AdminSupportJobs.tsx apps/functions/src/adminSupport.ts
git commit -m "feat(admin): pipeline labels, stage filter, fulfillment panel, refund"
```

---

## Task 13: Final verification, changelog, docs

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/ARCHITECTURE.md` (add fulfillment section)

- [ ] **Step 1: Run everything**

```bash
cd apps/functions && npm run build && npm run typecheck && npm run test:admin-support && npm run test:pipeline && npm run test:job-cost && npm run test:workflow-config
cd ../web && npx tsc --noEmit && npm run build
```

Expected: all pass. Fix anything that fails before proceeding.

- [ ] **Step 2: Emulator smoke test (manual)**

Run `cd apps/functions && npm run serve` and, in the web app against the emulator:
1. Visit `/operator` — dev bypass grants operator role; tabs render.
2. Create a job through the normal flow (or seed a Firestore job+order doc with `pipelineStage: "paid"`, `fulfillment.stage: "paid"`, a `customerName`, and `printFileArtifacts` paths pointing at any small storage objects).
3. Accept it — stage moves to Accepted, bundle builds (or fails gracefully if storage paths are fake; the failure path should render).
4. Start production → mark shipped with tracking → verify admin console shows the Fulfillment panel and "Mark completed" works.
5. Reject path: re-queue a job, accept, reject with a reason — verify a support note appears in the admin console.

- [ ] **Step 3: Update CHANGELOG.md and docs**

Add a CHANGELOG entry under a new date heading following the file's existing format, summarizing: operator console, fulfillment pipeline, paint option, shipping-address persistence, Stripe refunds.

In `docs/ARCHITECTURE.md`, add a short "Fulfillment pipeline" section: the stage list, the `orders/{jobId}.fulfillment` object, `pipelineStage` stamping, the operator allowlist, and required new secrets/env: `OPERATOR_ALLOWLIST`, `STRIPE_FIGURINE_PAINTED_PRICE_ID`, `STRIPE_FIGURINE_UNPAINTED_PRICE_ID`.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md docs/ARCHITECTURE.md
git commit -m "docs: fulfillment pipeline and operator console"
```

---

## Deployment notes (for the human, not the agent)

- Set secrets before deploy: `firebase functions:secrets:set OPERATOR_ALLOWLIST` (comma-separated operator emails/uids), and optionally the two figurine Stripe price IDs.
- The `checkout.session.completed` webhook change is backward compatible; existing paid orders read as stage `paid` via the legacy fallback.
- New Firestore composite indexes should not be required (`where("pipelineStage", "in", ...)` on a single field), but watch the emulator/console for index prompts on first query.
