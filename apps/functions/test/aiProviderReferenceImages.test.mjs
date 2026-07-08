import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReferenceImageGenerationMetadata,
  buildVertexImageGenerationConfig,
  buildVertexInteractionsResponseFormat,
  buildVertexUserParts,
  nearestSupportedAspectRatio,
  readImageDimensions,
  resolveTemplateFaceSwapPrompt,
} from "../lib/aiProvider.js";
import { defaultTemplateFaceSwapPrompt } from "../lib/figurineWorkflowConfig.js";

test("Vertex user parts append style references after source image", () => {
  const parts = buildVertexUserParts({
    promptText: "Generate a figurine proof.",
    sourceImageBuffer: Buffer.from("source-image"),
    sourceMimeType: "image/jpeg",
    referenceImages: [
      {
        id: "reference-1",
        mimeType: "image/png",
        imageBuffer: Buffer.from("style-reference"),
      },
    ],
  });

  assert.equal(parts.length, 3);
  assert.equal(parts[0].text, "Generate a figurine proof.");
  assert.equal(parts[1].inlineData.mimeType, "image/jpeg");
  assert.equal(
    parts[1].inlineData.data,
    Buffer.from("source-image").toString("base64"),
  );
  assert.equal(parts[2].inlineData.mimeType, "image/png");
  assert.equal(
    parts[2].inlineData.data,
    Buffer.from("style-reference").toString("base64"),
  );
});

test("reference image metadata stores counts and IDs without paths", () => {
  const metadata = buildReferenceImageGenerationMetadata([
    {
      id: "reference-1",
      label: "Round toy finish",
      storagePath:
        "admin/workflow-style-references/creative_lab_figure/reference-1.png",
      mimeType: "image/png",
      enabled: true,
    },
    {
      id: "reference-2",
      label: "Disabled",
      storagePath:
        "admin/workflow-style-references/creative_lab_figure/reference-2.png",
      mimeType: "image/png",
      enabled: false,
    },
  ]);

  assert.deepEqual(metadata, {
    referenceImageCount: 1,
    referenceImageIds: ["reference-1"],
  });
  assert.doesNotMatch(JSON.stringify(metadata), /admin\/workflow|https?:\/\//);
});

test("template face swap sends the style prompt verbatim, defaulting when blank", () => {
  assert.equal(
    resolveTemplateFaceSwapPrompt("My exact swap instruction."),
    "My exact swap instruction.",
  );
  assert.equal(
    resolveTemplateFaceSwapPrompt("   "),
    defaultTemplateFaceSwapPrompt,
  );
  assert.equal(
    resolveTemplateFaceSwapPrompt(undefined),
    defaultTemplateFaceSwapPrompt,
  );
  assert.match(
    defaultTemplateFaceSwapPrompt,
    /Preserve every costume and surface detail at full sharpness/,
  );
});

test("nearest supported aspect ratio matches the exp-011 template shape", () => {
  // 1122x1402 is the known-good exp-011 Creative Lab input.
  assert.equal(nearestSupportedAspectRatio(1122, 1402), "4:5");
  assert.equal(nearestSupportedAspectRatio(1000, 1000), "1:1");
  assert.equal(nearestSupportedAspectRatio(2100, 900), "21:9");
});

test("Vertex generateContent config stays on the unconfigured fallback shape", () => {
  assert.deepEqual(buildVertexImageGenerationConfig(), {
    candidateCount: 1,
    responseModalities: ["TEXT", "IMAGE"],
  });
});

test("Gemini Interactions response format uses the validated 2K image fields", () => {
  const responseFormat = buildVertexInteractionsResponseFormat({
    aspectRatio: "4:5",
    imageSize: "2K",
  });

  assert.deepEqual(responseFormat, {
    type: "image",
    mime_type: "image/jpeg",
    aspect_ratio: "4:5",
    image_size: "2K",
  });
});

test("image dimensions parse from PNG and JPEG headers", () => {
  const pngWidth = Buffer.alloc(4);
  pngWidth.writeUInt32BE(1122, 0);
  const pngHeight = Buffer.alloc(4);
  pngHeight.writeUInt32BE(1402, 0);
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from([0, 0, 0, 13]),
    Buffer.from("IHDR"),
    pngWidth,
    pngHeight,
    Buffer.alloc(5),
  ]);
  assert.deepEqual(readImageDimensions(png, "image/png"), {
    width: 1122,
    height: 1402,
  });

  const jpeg = Buffer.from([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x05, 0x7a, 0x04, 0x62, 0x03,
    0x00, 0x00, 0x00, 0x00,
  ]);
  assert.deepEqual(readImageDimensions(jpeg, "image/jpeg"), {
    width: 1122,
    height: 1402,
  });

  assert.equal(readImageDimensions(Buffer.from("not an image"), "image/png"), null);
});
