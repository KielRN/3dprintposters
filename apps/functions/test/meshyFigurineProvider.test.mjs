import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildDirectMultiImageTo3dRequest,
  buildMeshyOpenApiUrl,
  planMeshyCreativeLabImageResize,
} from "../lib/meshyFigurineProvider.js";

test("direct Multi-Image-to-3D request matches exp 014 and 018 settings", () => {
  const request = buildDirectMultiImageTo3dRequest([
    "data:image/png;base64,redacted",
  ]);

  assert.deepEqual(request, {
    image_urls: ["data:image/png;base64,redacted"],
    ai_model: "meshy-6",
    should_texture: true,
    enable_pbr: false,
    should_remesh: true,
    image_enhancement: true,
    remove_lighting: true,
    moderation: true,
    target_formats: ["glb", "stl", "3mf"],
    target_polycount: 100000,
    save_pre_remeshed_model: true,
  });
});

test("Meshy direct endpoints use OpenAPI v1 while Creative Lab keeps its base route", () => {
  assert.equal(
    buildMeshyOpenApiUrl("/multi-image-to-3d", { apiVersion: "v1" }),
    "https://api.meshy.ai/openapi/v1/multi-image-to-3d",
  );
  assert.equal(
    buildMeshyOpenApiUrl("/print/analyze", { apiVersion: "v1" }),
    "https://api.meshy.ai/openapi/v1/print/analyze",
  );
  assert.equal(
    buildMeshyOpenApiUrl("/creative-lab/figure/v1/build"),
    "https://api.meshy.ai/openapi/creative-lab/figure/v1/build",
  );
});

test("Creative Lab input planner shrinks oversized 2K proof images", () => {
  const plan = planMeshyCreativeLabImageResize({
    width: 1856,
    height: 2304,
  });

  assert.equal(plan.resized, true);
  assert.equal(plan.height, 2048);
  assert.equal(plan.width, 1649);
  assert.ok(plan.width * plan.height <= 3_900_000);
  assert.deepEqual(plan.reasons, ["max_dimension"]);
});

test("Creative Lab input planner also caps pixel count", () => {
  const plan = planMeshyCreativeLabImageResize({
    width: 2400,
    height: 1800,
    maxDimension: 4096,
    maxPixels: 3_900_000,
  });

  assert.equal(plan.resized, true);
  assert.ok(plan.width * plan.height <= 3_900_000);
  assert.deepEqual(plan.reasons, ["max_pixels"]);
});

test("Creative Lab input planner leaves known-good experiment dimensions alone", () => {
  const plan = planMeshyCreativeLabImageResize({
    width: 1122,
    height: 1402,
  });

  assert.deepEqual(plan, {
    width: 1122,
    height: 1402,
    resized: false,
    reasons: [],
  });
});
