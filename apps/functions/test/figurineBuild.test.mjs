import assert from "node:assert/strict";
import { test } from "node:test";

import {
  claimFigurineBuildUpdate,
  requeueFigurineBuildUpdate,
  shouldQueueFigurineBuildOnPayment,
  shouldRunFigurineBuild,
} from "../lib/figurineBuild.js";

function figurineJob(figurineBuild) {
  return {
    productType: "figurine",
    ...(figurineBuild === undefined ? {} : { figurineBuild }),
  };
}

test("shouldRunFigurineBuild fires only on a transition into queued", () => {
  assert.equal(
    shouldRunFigurineBuild(
      figurineJob(undefined),
      figurineJob({ status: "queued" }),
    ),
    true,
  );
  assert.equal(
    shouldRunFigurineBuild(undefined, figurineJob({ status: "queued" })),
    true,
  );
  // echo write of the claim (queued -> running) must not re-enter
  assert.equal(
    shouldRunFigurineBuild(
      figurineJob({ status: "queued" }),
      figurineJob({ status: "running" }),
    ),
    false,
  );
  // unrelated job writes while queued must not double-fire
  assert.equal(
    shouldRunFigurineBuild(
      figurineJob({ status: "queued" }),
      figurineJob({ status: "queued" }),
    ),
    false,
  );
  // requeue (failed -> queued) fires again
  assert.equal(
    shouldRunFigurineBuild(
      figurineJob({ status: "failed" }),
      figurineJob({ status: "queued" }),
    ),
    true,
  );
  // deletes and non-figurine jobs never fire
  assert.equal(
    shouldRunFigurineBuild(figurineJob({ status: "queued" }), undefined),
    false,
  );
  assert.equal(
    shouldRunFigurineBuild(undefined, {
      productType: "poster",
      figurineBuild: { status: "queued" },
    }),
    false,
  );
});

test("claimFigurineBuildUpdate claims only from queued", () => {
  const claim = claimFigurineBuildUpdate({ status: "queued", attempts: 0 });
  assert.equal(claim.status, "running");
  assert.ok(claim.startedAt);
  for (const status of ["running", "ready", "failed"]) {
    assert.equal(claimFigurineBuildUpdate({ status }), null);
  }
  assert.equal(claimFigurineBuildUpdate(undefined), null);
  assert.equal(claimFigurineBuildUpdate("queued"), null);
});

test("requeueFigurineBuildUpdate requeues only from failed and increments attempts", () => {
  const requeue = requeueFigurineBuildUpdate({ status: "failed", attempts: 0 });
  assert.equal(requeue.status, "queued");
  assert.equal(requeue.attempts, 1);
  assert.ok(requeue.queuedAt);
  assert.equal(
    requeueFigurineBuildUpdate({ status: "failed", attempts: 3 }).attempts,
    4,
  );
  assert.equal(requeueFigurineBuildUpdate({ status: "failed" }).attempts, 1);
  for (const status of ["queued", "running", "ready"]) {
    assert.equal(requeueFigurineBuildUpdate({ status }), null);
  }
  assert.equal(requeueFigurineBuildUpdate(undefined), null);
});

test("shouldQueueFigurineBuildOnPayment stamps only figurine jobs without an existing build record", () => {
  assert.equal(shouldQueueFigurineBuildOnPayment({ productType: "figurine" }), true);
  assert.equal(
    shouldQueueFigurineBuildOnPayment({ selectedStyle: "chibi_figure" }),
    true,
  );
  // webhook redelivery after the build was queued/claimed/finished must never re-stamp
  for (const status of ["queued", "running", "ready", "failed"]) {
    assert.equal(
      shouldQueueFigurineBuildOnPayment(figurineJob({ status })),
      false,
    );
  }
  assert.equal(shouldQueueFigurineBuildOnPayment({ productType: "poster" }), false);
  assert.equal(shouldQueueFigurineBuildOnPayment(undefined), false);
});

test("figurinePreviewReadyForAssembly requires a ready preview with a GLB", async () => {
  const { figurinePreviewReadyForAssembly } = await import(
    "../lib/figurineBuild.js"
  );
  // Funded flow pre-payment: no preview yet, base naming must skip assembly.
  assert.equal(figurinePreviewReadyForAssembly({}), false);
  assert.equal(
    figurinePreviewReadyForAssembly({ figurinePreview: null }),
    false,
  );
  assert.equal(
    figurinePreviewReadyForAssembly({
      figurinePreview: { status: "generating" },
    }),
    false,
  );
  assert.equal(
    figurinePreviewReadyForAssembly({
      figurinePreview: { status: "preview_ready" },
    }),
    false,
  );
  // Post-payment (or legacy) jobs with a built body still assemble.
  assert.equal(
    figurinePreviewReadyForAssembly({
      figurinePreview: {
        status: "preview_ready",
        previewGlb: "print-files/u/j/figurine/creative-lab-original/model.glb",
      },
    }),
    true,
  );
});
