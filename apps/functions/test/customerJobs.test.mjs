import assert from "node:assert/strict";
import test from "node:test";

import {
  customerJobDeletionBlock,
  isCustomerDeletedJob,
} from "../lib/customerJobs.js";

test("customer job deletion allows pre-checkout jobs", () => {
  assert.equal(
    customerJobDeletionBlock({
      jobData: { uid: "user-1", status: "preview_ready" },
    }),
    null,
  );
});

test("customer job deletion blocks fulfillment jobs", () => {
  assert.match(
    customerJobDeletionBlock({
      jobData: { uid: "user-1", status: "approved", pipelineStage: "paid" },
    }) ?? "",
    /Paid orders/,
  );
});

test("customer job deletion blocks active checkout", () => {
  assert.match(
    customerJobDeletionBlock({
      jobData: { uid: "user-1", status: "approved" },
      orderData: { status: "checkout_created", paymentStatus: "pending" },
    }) ?? "",
    /active checkout/,
  );
});

test("customer job deletion allows expired checkout attempts", () => {
  assert.equal(
    customerJobDeletionBlock({
      jobData: { uid: "user-1", status: "approved" },
      orderData: { status: "checkout_expired", paymentStatus: "expired" },
    }),
    null,
  );
});

test("customer deleted jobs are recognized by marker fields", () => {
  assert.equal(isCustomerDeletedJob({ customerDeleted: true }), true);
  assert.equal(isCustomerDeletedJob({ customerDeletedAt: { seconds: 1 } }), true);
  assert.equal(isCustomerDeletedJob({ status: "preview_ready" }), false);
});
