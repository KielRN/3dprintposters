import assert from "node:assert/strict";
import { test } from "node:test";

import {
  fallbackFigurineCheckoutEligibility,
  hasManualProofFulfillmentMode,
  publicGenerationProgressMessage,
  publicGenerationRecoveryMessage,
  shouldMarkGenerationStale,
} from "../lib/generationRecovery.js";

function timestamp(ms) {
  return {
    toMillis() {
      return ms;
    },
  };
}

function fallbackJob(overrides = {}) {
  return {
    uid: "user-1",
    productType: "figurine",
    status: "failed",
    sourceImagePath: "uploads/user-1/job-123/source.jpg",
    selectedStyle: "chibi_figure",
    baseConfig: {
      sign: {
        enabled: true,
        text: "Maya",
      },
    },
    generationState: {
      state: "failed",
      failureCode: "provider_generation_incomplete",
    },
    ...overrides,
  };
}

test("fallback eligibility requires an owned failed figurine with source and base name", () => {
  assert.deepEqual(
    fallbackFigurineCheckoutEligibility({
      jobId: "job-123",
      uid: "user-1",
      jobData: fallbackJob(),
    }),
    { eligible: true },
  );
  assert.equal(
    fallbackFigurineCheckoutEligibility({
      jobId: "job-123",
      uid: "user-2",
      jobData: fallbackJob(),
    }).reason,
    "owner_mismatch",
  );
  assert.equal(
    fallbackFigurineCheckoutEligibility({
      jobId: "job-123",
      uid: "user-1",
      jobData: fallbackJob({ status: "generating", generationState: { state: "running" } }),
    }).reason,
    "generation_state_active",
  );
  assert.equal(
    fallbackFigurineCheckoutEligibility({
      jobId: "job-123",
      uid: "user-1",
      jobData: fallbackJob({ baseConfig: { sign: { text: "" } } }),
    }).reason,
    "base_name_required",
  );
});

test("stale generation detection uses durable progress timestamps", () => {
  assert.equal(
    shouldMarkGenerationStale({
      nowMs: 1_000_000,
      staleAfterMs: 100_000,
      jobData: {
        productType: "figurine",
        status: "generating",
        generationState: { state: "running", lastProgressAt: timestamp(850_000) },
      },
    }),
    true,
  );
  assert.equal(
    shouldMarkGenerationStale({
      nowMs: 1_000_000,
      staleAfterMs: 100_000,
      jobData: {
        productType: "figurine",
        status: "generating",
        generationState: { state: "running", lastProgressAt: timestamp(950_000) },
      },
    }),
    false,
  );
  assert.equal(
    shouldMarkGenerationStale({
      nowMs: 1_000_000,
      staleAfterMs: 100_000,
      jobData: {
        productType: "figurine",
        status: "preview_ready",
        generationState: { state: "ready", lastProgressAt: timestamp(100_000) },
      },
    }),
    false,
  );
});

test("manual proof mode is recognized on jobs, orders, and fulfillment", () => {
  assert.equal(
    hasManualProofFulfillmentMode({
      jobData: { fulfillmentMode: "manual_proof_required" },
    }),
    true,
  );
  assert.equal(
    hasManualProofFulfillmentMode({
      orderData: { fulfillmentMode: "manual_proof_required" },
    }),
    true,
  );
  assert.equal(
    hasManualProofFulfillmentMode({
      orderData: { fulfillment: { productionSubState: "manual_proof_required" } },
    }),
    true,
  );
  assert.equal(hasManualProofFulfillmentMode({ jobData: {}, orderData: {} }), false);
});

test("customer-facing recovery messages avoid raw provider language", () => {
  assert.equal(publicGenerationRecoveryMessage().includes("internal"), false);
  assert.equal(publicGenerationRecoveryMessage().includes("failed"), false);
  assert.equal(publicGenerationProgressMessage("finalized"), "Your hero concept is ready.");
});
