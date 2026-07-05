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
  assert.deepEqual(operatorTabStages.all, [
    "paid",
    "accepted",
    "in_production",
    "shipped",
    "completed",
    "rejected_by_operator",
    "refunded",
  ]);
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
