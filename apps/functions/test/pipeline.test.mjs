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
