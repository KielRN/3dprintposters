import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildDirectMultiImageTo3dRequest,
  buildMeshyOpenApiUrl,
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
