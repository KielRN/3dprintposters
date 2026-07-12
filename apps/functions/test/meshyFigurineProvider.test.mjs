import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildDirectMultiImageTo3dRequest,
  buildMeshyOpenApiUrl,
  readInlineImageDimensions,
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

test("Creative Lab source diagnostics read PNG dimensions without resizing", () => {
  const png = Buffer.alloc(24);
  png[0] = 0x89;
  png[1] = 0x50;
  png[2] = 0x4e;
  png[3] = 0x47;
  png.writeUInt32BE(1856, 16);
  png.writeUInt32BE(2304, 20);

  assert.deepEqual(readInlineImageDimensions(png), {
    width: 1856,
    height: 2304,
  });
});

test("Creative Lab source diagnostics return null for unknown image headers", () => {
  assert.equal(readInlineImageDimensions(Buffer.from("not-an-image")), null);
});
