import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolveSceneConceptPath,
  sceneRenderDecision,
} from "../lib/scenePreview.js";

test("sceneRenderDecision caches ready renders and enforces the 2-per-scene cap", () => {
  // no record yet -> render
  assert.equal(sceneRenderDecision(undefined, false), "render");
  // ready + no force -> cached, no spend
  assert.equal(
    sceneRenderDecision({ status: "ready", attempts: 1 }, false),
    "cached",
  );
  // force re-render allowed under the cap
  assert.equal(
    sceneRenderDecision({ status: "ready", attempts: 1 }, true),
    "render",
  );
  // hard cap: 2 renders per scene per job; force respects the cap
  assert.equal(
    sceneRenderDecision({ status: "ready", attempts: 2 }, true),
    "cap_exhausted",
  );
  assert.equal(
    sceneRenderDecision({ status: "failed", attempts: 2 }, false),
    "cap_exhausted",
  );
  // failed under the cap retries
  assert.equal(
    sceneRenderDecision({ status: "failed", attempts: 1 }, false),
    "render",
  );
  // stale pending (crashed render) retries under the cap
  assert.equal(
    sceneRenderDecision({ status: "pending", attempts: 1 }, false),
    "render",
  );
});

test("resolveSceneConceptPath prefers the approved image and skips placeholders", () => {
  assert.equal(
    resolveSceneConceptPath({
      approvedImagePath: "generated/u/j/preview.png",
      generatedImages: [
        { storagePath: "generated/u/j/preview-1.png", isPlaceholder: false },
      ],
    }),
    "generated/u/j/preview.png",
  );
  assert.equal(
    resolveSceneConceptPath({
      generatedImages: [
        { storagePath: "uploads/u/j/source.png", isPlaceholder: true },
        { storagePath: "generated/u/j/preview-2.png", isPlaceholder: false },
      ],
    }),
    "generated/u/j/preview-2.png",
  );
  assert.equal(
    resolveSceneConceptPath({
      generatedImages: [
        { storagePath: "uploads/u/j/source.png", isPlaceholder: true },
      ],
    }),
    null,
  );
  assert.equal(resolveSceneConceptPath({}), null);
});
