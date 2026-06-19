import assert from "node:assert/strict";
import test from "node:test";

import {
  maxWorkflowStyleReferenceImages,
  normalizeFigurineWorkflowConfig,
  publicFigurineWorkflowConfig,
} from "../lib/figurineWorkflowConfig.js";

function styleWithReferenceImages(referenceImages) {
  return {
    label: "Creative Lab Figure",
    id: "creative_lab_figure",
    productType: "figurine",
    prompt: "Smooth toy figure proof.",
    enabled: true,
    referenceImages,
  };
}

test("workflow config keeps old styles valid without reference images", () => {
  const config = normalizeFigurineWorkflowConfig({
    styles: [
      {
        label: "Creative Lab Figure",
        id: "creative_lab_figure",
        prompt: "Smooth toy figure proof.",
      },
    ],
  });

  assert.deepEqual(config.styles[0].referenceImages, []);
});

test("workflow config keeps up to four valid per-style reference images", () => {
  const referenceImages = Array.from({ length: 5 }, (_value, index) => ({
    id: `reference-${index + 1}`,
    label: `Reference ${index + 1}`,
    storagePath: `admin/workflow-style-references/creative_lab_figure/reference-${index + 1}.png`,
    mimeType: "image/png",
    enabled: index !== 1,
  }));
  const config = normalizeFigurineWorkflowConfig({
    styles: [styleWithReferenceImages(referenceImages)],
  });

  assert.equal(
    config.styles[0].referenceImages.length,
    maxWorkflowStyleReferenceImages,
  );
  assert.equal(config.styles[0].referenceImages[0].id, "reference-1");
  assert.equal(config.styles[0].referenceImages[1].enabled, false);
});

test("workflow config drops invalid reference image paths and MIME types", () => {
  const config = normalizeFigurineWorkflowConfig({
    styles: [
      styleWithReferenceImages([
        {
          id: "valid",
          label: "Valid",
          storagePath:
            "admin/workflow-style-references/creative_lab_figure/valid-ref.png",
          mimeType: "image/png",
        },
        {
          id: "bad-path",
          label: "Bad path",
          storagePath: "uploads/user/job/source.png",
          mimeType: "image/png",
        },
        {
          id: "bad-mime",
          label: "Bad MIME",
          storagePath:
            "admin/workflow-style-references/creative_lab_figure/bad-mime.webp",
          mimeType: "image/webp",
        },
      ]),
    ],
  });

  assert.deepEqual(
    config.styles[0].referenceImages.map((image) => image.id),
    ["valid"],
  );
});

test("public workflow config strips prompt references and storage paths", () => {
  const config = normalizeFigurineWorkflowConfig({
    baseProofPrompt:
      "Create a figurine proof from the customer source photo with admin-only direction.",
    styles: [
      styleWithReferenceImages([
        {
          id: "valid",
          label: "Valid",
          storagePath:
            "admin/workflow-style-references/creative_lab_figure/valid-ref.png",
          mimeType: "image/png",
        },
      ]),
    ],
  });
  const publicConfig = publicFigurineWorkflowConfig(config);

  assert.equal(publicConfig.baseProofPrompt, "Server-managed proof prompt.");
  assert.equal(publicConfig.styles[0].prompt, "Server-managed style prompt.");
  assert.deepEqual(publicConfig.styles[0].referenceImages, []);
});
