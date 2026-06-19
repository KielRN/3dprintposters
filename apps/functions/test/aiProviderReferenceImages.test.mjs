import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReferenceImageGenerationMetadata,
  buildVertexUserParts,
} from "../lib/aiProvider.js";

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
