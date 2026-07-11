import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildScenePrompt,
  resolveSceneConceptPath,
  resolveSceneSignName,
  scenePregenTargets,
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

test("resolveSceneSignName reads the enabled base sign only", () => {
  assert.equal(
    resolveSceneSignName({
      baseConfig: { sign: { enabled: true, text: "Ellie" } },
    }),
    "Ellie",
  );
  assert.equal(
    resolveSceneSignName({
      baseConfig: { sign: { enabled: false, text: "Ellie" } },
    }),
    null,
  );
  assert.equal(
    resolveSceneSignName({
      baseConfig: { sign: { enabled: true, text: "  " } },
    }),
    null,
  );
  assert.equal(resolveSceneSignName({}), null);
});

test("buildScenePrompt frames the figurine small and names the base", () => {
  const named = buildScenePrompt("desk", "Ellie", true);
  assert.match(named, /one quarter of the frame/i);
  assert.match(named, /do not zoom in/i);
  assert.match(named, /top of the head to the bottom of the base/i);
  assert.match(named, /"Ellie"/);
  assert.match(named, /nameplate/i);
  assert.ok(!/No text, captions/.test(named));
  // Color lock (v2.1): keep the concept's paint, never render a bare print,
  // and keep the ivory scoped to the base.
  assert.match(named, /Preserve the character's exact colors/i);
  assert.match(named, /fully painted/i);
  assert.match(named, /never a bare, unpainted/i);
  assert.match(named, /ivory color belongs to the display base only/i);

  const blank = buildScenePrompt("bookshelf", null, false);
  assert.match(blank, /No text, captions/);
  assert.ok(!/nameplate must read/i.test(blank));

  const noRef = buildScenePrompt("bookshelf", "Ellie", false);
  assert.match(noRef, /"Ellie"/);
  assert.ok(!/last reference image/i.test(noRef));
});

test("buildScenePrompt supports the unboxing scene", () => {
  const prompt = buildScenePrompt("unboxing", "Ellie", true);
  assert.match(prompt, /inside the open (gift|shipping) box/i);
  assert.match(prompt, /"Ellie"/);
});

test("scenePregenTargets fires once when the concept becomes definitive", () => {
  const single = {
    productType: "figurine",
    status: "preview_ready",
    generatedImages: [
      {
        storagePath: "generated/u/j/meshy-concept-1.png",
        isPlaceholder: false,
      },
    ],
  };
  assert.deepEqual(
    scenePregenTargets({ productType: "figurine", status: "generating" }, single),
    ["bookshelf", "desk", "unboxing"],
  );
  assert.deepEqual(scenePregenTargets(single, { ...single, updatedAt: 1 }), []);

  const multi = {
    productType: "figurine",
    status: "preview_ready",
    generatedImages: [
      { storagePath: "generated/u/j/p1.png", isPlaceholder: false },
      { storagePath: "generated/u/j/p2.png", isPlaceholder: false },
    ],
  };
  assert.deepEqual(scenePregenTargets({ productType: "figurine" }, multi), []);
  assert.deepEqual(
    scenePregenTargets(multi, {
      ...multi,
      approvedImagePath: "generated/u/j/p2.png",
    }),
    ["bookshelf", "desk", "unboxing"],
  );
  assert.deepEqual(
    scenePregenTargets(
      { productType: "figurine", status: "generating" },
      { ...single, scenePreviews: { bookshelf: { status: "ready" } } },
    ),
    ["desk", "unboxing"],
  );
  assert.deepEqual(
    scenePregenTargets(undefined, {
      productType: "poster",
      approvedImagePath: "x",
    }),
    [],
  );
  assert.deepEqual(
    scenePregenTargets(undefined, {
      productType: "figurine",
      status: "preview_ready",
      generatedImages: [
        { storagePath: "uploads/u/j/source.png", isPlaceholder: true },
      ],
    }),
    [],
  );
});
