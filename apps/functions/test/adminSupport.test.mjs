import assert from "node:assert/strict";
import { test } from "node:test";

import {
  collectAdminJobAssets,
  jobMatchesAdminSupportFilters,
  matchesAdminSupportSearch,
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

test("job summary exposes customer name and email from order data", () => {
  const summary = sanitizeAdminSupportJobSummary({
    jobId: "job-1",
    jobData: baseJob(),
    orderData: {
      customerName: "Jane Cooper",
      customerEmail: "jane@example.com",
    },
  });

  assert.equal(summary.customerName, "Jane Cooper");
  assert.equal(summary.customerEmail, "jane@example.com");
});

test("job summary customer fields are null without order data", () => {
  const summary = sanitizeAdminSupportJobSummary({
    jobId: "job-1",
    jobData: baseJob(),
  });

  assert.equal(summary.customerName, null);
  assert.equal(summary.customerEmail, null);
});

test("selectedStyle filter matches the job's style id", () => {
  const summary = sanitizeAdminSupportJobSummary({
    jobId: "job-1",
    jobData: baseJob(),
  });

  assert.equal(
    jobMatchesAdminSupportFilters(summary, {
      selectedStyle: "creative_lab_figure",
    }),
    true,
  );
  assert.equal(
    jobMatchesAdminSupportFilters(summary, { selectedStyle: "chibi_female" }),
    false,
  );
});

test("search matches job id, uid, customer name, and email case-insensitively", () => {
  const summary = sanitizeAdminSupportJobSummary({
    jobId: "job-1",
    jobData: baseJob(),
    orderData: {
      customerName: "Jane Cooper",
      customerEmail: "jane@example.com",
    },
  });

  assert.equal(matchesAdminSupportSearch(summary, "jane"), true);
  assert.equal(matchesAdminSupportSearch(summary, "COOPER"), true);
  assert.equal(matchesAdminSupportSearch(summary, "jane@example"), true);
  assert.equal(matchesAdminSupportSearch(summary, "job-1"), true);
  assert.equal(matchesAdminSupportSearch(summary, "customer-1"), true);
  assert.equal(matchesAdminSupportSearch(summary, "nomatch"), false);
  assert.equal(matchesAdminSupportSearch(summary, ""), true);
});

test("collectAdminJobAssets gathers labeled, deduped assets across categories", () => {
  const assets = collectAdminJobAssets({
    jobId: "job-1",
    jobData: {
      sourceImagePath: "uploads/customer-1/job-1/photo.jpg",
      approvedImagePath: "approved/customer-1/job-1/approved.png",
      generatedImages: [
        { storagePath: "generated/customer-1/job-1/preview-1.png" },
        { storagePath: "generated/customer-1/job-1/preview-2.png" },
      ],
      figurinePreview: {
        thumbnailPath: "print-files/customer-1/job-1/thumb.png",
        artifacts: { previewGlb: "print-files/customer-1/job-1/preview.glb" },
      },
      printFileArtifacts: {
        modelStl: "print-files/customer-1/job-1/model.stl",
        fullColor3mf: "print-files/customer-1/job-1/full.3mf",
        previewGlb: "print-files/customer-1/job-1/preview.glb",
      },
      figurineAssembly: {
        artifacts: { assembledGlb: "print-files/customer-1/job-1/assembly.glb" },
      },
    },
    orderData: {
      printBundle: { status: "ready", storagePath: "bundles/job-1/bundle.zip" },
    },
  });

  const byPath = new Map(assets.map((asset) => [asset.storagePath, asset]));

  assert.equal(byPath.get("uploads/customer-1/job-1/photo.jpg")?.category, "Source");
  assert.equal(byPath.get("uploads/customer-1/job-1/photo.jpg")?.ext, "jpg");
  assert.equal(byPath.get("generated/customer-1/job-1/preview-1.png")?.category, "Proofs");
  assert.equal(byPath.get("print-files/customer-1/job-1/model.stl")?.ext, "stl");
  assert.equal(byPath.get("bundles/job-1/bundle.zip")?.category, "Order bundle");
  assert.equal(byPath.get("bundles/job-1/bundle.zip")?.ext, "zip");

  const glbEntries = assets.filter(
    (asset) => asset.storagePath === "print-files/customer-1/job-1/preview.glb",
  );
  assert.equal(glbEntries.length, 1);
});

test("collectAdminJobAssets returns nothing when the job has no assets", () => {
  assert.deepEqual(
    collectAdminJobAssets({ jobId: "job-1", jobData: {}, orderData: null }),
    [],
  );
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
