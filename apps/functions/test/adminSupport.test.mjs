import assert from "node:assert/strict";
import { test } from "node:test";

import {
  adminSupportDevelopmentAccessReason,
  isAdminSupportAllowed,
  jobMatchesAdminSupportFilters,
  normalizeAdminSupportNoteBody,
  sanitizeAdminSupportJobDetail,
  sanitizeAdminSupportJobSummary,
} from "../lib/adminSupport.js";

function timestamp(iso) {
  return {
    toDate() {
      return new Date(iso);
    },
  };
}

function baseJob() {
  return {
    uid: "customer-1",
    productType: "figurine",
    status: "failed",
    selectedStyle: "creative_lab_figure",
    selectedStyleLabel: "Creative Lab Figure",
    readinessStatus: "concept_ready",
    generatedImages: [
      { storagePath: "generated/customer-1/job-1/preview-1.png" },
      { storagePath: "generated/customer-1/job-1/preview-2.png" },
    ],
    figurinePreview: {
      status: "preview_ready",
      printReadiness: "needs_review",
      previewGlb: "print-files/customer-1/job-1/model.glb",
    },
    checkoutEligibility: {
      eligible: false,
      reason: "Needs review.",
    },
    jobCost: {
      status: "partial",
      currency: "USD",
      providerCostUsd: 1.58,
      providerCreditTotals: { meshy: 51 },
    },
    error: {
      stage: "figurine_preview_generation",
      message: "Provider failed.",
    },
    createdAt: timestamp("2026-06-19T12:00:00.000Z"),
    updatedAt: timestamp("2026-06-19T12:30:00.000Z"),
  };
}

test("admin support allowlist matches exact UID or case-insensitive email", () => {
  assert.equal(
    isAdminSupportAllowed({
      allowlist: "admin@example.com,uid-123",
      principal: { uid: "uid-999", email: "Admin@Example.com" },
    }),
    true,
  );
  assert.equal(
    isAdminSupportAllowed({
      allowlist: "admin@example.com,uid-123",
      principal: { uid: "uid-123", email: null },
    }),
    true,
  );
  assert.equal(
    isAdminSupportAllowed({
      allowlist: "admin@example.com,uid-123",
      principal: { uid: "uid-456", email: "user@example.com" },
    }),
    false,
  );
});

test("admin support development access opens only dev contexts", () => {
  assert.equal(
    adminSupportDevelopmentAccessReason({ FUNCTIONS_EMULATOR: "true" }),
    "functions_emulator",
  );
  assert.equal(
    adminSupportDevelopmentAccessReason({
      GCLOUD_PROJECT: "gen-lang-client-0675309660",
    }),
    "dev_project",
  );
  assert.equal(
    adminSupportDevelopmentAccessReason({
      FIREBASE_CONFIG: JSON.stringify({
        projectId: "gen-lang-client-0675309660",
      }),
    }),
    "dev_project",
  );
  assert.equal(
    adminSupportDevelopmentAccessReason({
      ADMIN_SUPPORT_DEV_BYPASS: "true",
      GCLOUD_PROJECT: "production-project",
    }),
    "explicit_dev_bypass",
  );
  assert.equal(
    adminSupportDevelopmentAccessReason({
      GCLOUD_PROJECT: "production-project",
    }),
    null,
  );
});

test("support note body is required and normalized", () => {
  assert.equal(normalizeAdminSupportNoteBody("  Needs slicer review.  "), "Needs slicer review.");
  assert.equal(normalizeAdminSupportNoteBody("   "), null);
  assert.equal(normalizeAdminSupportNoteBody(null), null);
});

test("job summary exposes support fields without raw storage paths", () => {
  const summary = sanitizeAdminSupportJobSummary({
    jobId: "job-1",
    jobData: baseJob(),
  });

  assert.equal(summary.jobId, "job-1");
  assert.equal(summary.uid, "customer-1");
  assert.equal(summary.generatedImageCount, 2);
  assert.equal(summary.jobCost.providerCostUsd, 1.58);
  assert.equal(summary.jobCost.meshyCredits, 51);
  assert.deepEqual(
    summary.issueTypes.sort(),
    ["cost", "failed", "needs_review", "open_support", "print_readiness"].sort(),
  );
  assert.equal(JSON.stringify(summary).includes("print-files/"), false);
});

test("job filters match sanitized summaries", () => {
  const summary = sanitizeAdminSupportJobSummary({
    jobId: "job-1",
    jobData: baseJob(),
  });

  assert.equal(
    jobMatchesAdminSupportFilters(summary, {
      productType: "figurine",
      jobStatus: "failed",
      supportStatus: "open",
      issueType: "failed",
    }),
    true,
  );
  assert.equal(
    jobMatchesAdminSupportFilters(summary, { productType: "poster" }),
    false,
  );
});

test("job detail includes order, audit, and notes without asset URLs", () => {
  const detail = sanitizeAdminSupportJobDetail({
    jobId: "job-1",
    jobData: baseJob(),
    orderData: {
      status: "checkout_expired",
      paymentStatus: "expired",
      fulfillmentStatus: "not_started",
      priceSnapshot: { currency: "usd", unitAmount: 6000 },
      updatedAt: timestamp("2026-06-19T12:40:00.000Z"),
    },
    printFileAuditData: {
      status: "captured",
      heightProvider: "masked_depth_detail_blend",
      segmentationStatus: { status: "ok" },
      geometryAnalysisWidthPx: 768,
      capturedAt: timestamp("2026-06-19T12:35:00.000Z"),
    },
    supportNotes: [
      {
        id: "note-1",
        data: {
          body: "Customer asked about readiness.",
          statusChange: "watching",
          createdByUid: "admin-1",
          createdByEmail: "admin@example.com",
          createdAt: timestamp("2026-06-19T12:45:00.000Z"),
        },
      },
    ],
  });

  assert.equal(detail.order?.paymentStatus, "expired");
  assert.equal(detail.printFileAudit?.segmentationStatus, "ok");
  assert.equal(detail.supportNotes[0].statusChange, "watching");
  assert.equal(detail.artifactSummary.proofCount, 2);
  assert.equal(JSON.stringify(detail).includes("generated/customer-1"), false);
});
