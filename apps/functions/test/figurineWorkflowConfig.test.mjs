import assert from "node:assert/strict";
import test from "node:test";

import {
  maxWorkflowStyleReferenceImages,
  normalizeFigurineWorkflowConfig,
  publicFigurineWorkflowConfig,
  validateFigurineWorkflowConfigInput,
  visibleWorkflowStyles,
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

test("default workflow config exposes only the approved public styles", () => {
  const config = normalizeFigurineWorkflowConfig({});
  const visibleIds = visibleWorkflowStyles(config).map((style) => style.id);

  assert.deepEqual(visibleIds, [
    "creative_lab_figure",
    "chibi_figure",
    "heroic_fantasy_male",
  ]);
  assert.equal(config.visibleStyleCount, 3);
  assert.equal(
    config.styles.find((style) => style.id === "heroic_fantasy_male")
      ?.generationWorkflow,
    "direct_multi_image_to_3d",
  );
  assert.equal(
    config.styles.find((style) => style.id === "emoji_avatar")?.enabled,
    false,
  );
  assert.equal(
    config.styles.find((style) => style.id === "bobblehead")?.enabled,
    false,
  );
  assert.equal(
    config.styles.find((style) => style.id === "cartoon_figure")?.enabled,
    false,
  );
});

test("saved configs that predate the chibi approval get it back and visible", () => {
  const config = normalizeFigurineWorkflowConfig({
    visibleStyleCount: 1,
    styles: [
      {
        label: "Creative Lab Figure",
        id: "creative_lab_figure",
        prompt: "Smooth toy figure proof.",
      },
      {
        label: "Emoji Avatar",
        id: "emoji_avatar",
        prompt: "Emoji avatar proof.",
      },
    ],
  });

  assert.equal(config.styles[1].id, "chibi_figure");
  assert.equal(config.styles[2].id, "heroic_fantasy_male");
  assert.equal(config.visibleStyleCount, 3);
  assert.deepEqual(
    visibleWorkflowStyles(config).map((style) => style.id),
    ["creative_lab_figure", "chibi_figure", "heroic_fantasy_male"],
  );
  assert.equal(
    config.styles.find((style) => style.id === "emoji_avatar")?.enabled,
    false,
  );
});

test("legacy configs with chibi buried outside the visible window move it into view", () => {
  // Mirrors the real adminConfig/figurineWorkflow doc saved 2026-06-19: all
  // five old default styles including chibi_figure, with visibleStyleCount 2.
  const config = normalizeFigurineWorkflowConfig({
    visibleStyleCount: 2,
    styles: [
      {
        label: "Creative Lab Figure",
        id: "creative_lab_figure",
        prompt: "Smooth toy figure proof.",
      },
      {
        label: "Emoji Avatar",
        id: "emoji_avatar",
        prompt: "Emoji avatar proof.",
      },
      {
        label: "Chibi Figure",
        id: "chibi_figure",
        prompt: "Chibi proof.",
      },
      {
        label: "Bobblehead",
        id: "bobblehead",
        prompt: "Bobblehead proof.",
      },
      {
        label: "Cartoon Figure",
        id: "cartoon_figure",
        prompt: "Cartoon proof.",
      },
    ],
  });

  assert.deepEqual(
    visibleWorkflowStyles(config).map((style) => style.id),
    ["creative_lab_figure", "chibi_figure", "heroic_fantasy_male"],
  );
  assert.equal(config.visibleStyleCount, 3);
  assert.equal(config.styles.length, 6);
  assert.deepEqual(
    config.styles.map((style) => [style.id, style.enabled]),
    [
      ["creative_lab_figure", true],
      ["chibi_figure", true],
      ["heroic_fantasy_male", true],
      ["emoji_avatar", false],
      ["bobblehead", false],
      ["cartoon_figure", false],
    ],
  );
});

test("an admin-disabled chibi style stays disabled and hidden", () => {
  const config = normalizeFigurineWorkflowConfig({
    visibleStyleCount: 1,
    styles: [
      {
        label: "Creative Lab Figure",
        id: "creative_lab_figure",
        prompt: "Smooth toy figure proof.",
      },
      {
        label: "Chibi",
        id: "chibi_figure",
        prompt: "Chibi proof.",
        enabled: false,
      },
    ],
  });

  assert.equal(config.visibleStyleCount, 2);
  assert.equal(
    config.styles.find((style) => style.id === "chibi_figure")?.enabled,
    false,
  );
  assert.deepEqual(
    visibleWorkflowStyles(config).map((style) => style.id),
    ["creative_lab_figure", "heroic_fantasy_male"],
  );
});

test("an admin-disabled heroic style stays disabled and hidden", () => {
  const config = normalizeFigurineWorkflowConfig({
    visibleStyleCount: 2,
    styles: [
      {
        label: "Creative Lab Figure",
        id: "creative_lab_figure",
        prompt: "Smooth toy figure proof.",
      },
      {
        label: "Chibi",
        id: "chibi_figure",
        prompt: "Chibi proof.",
      },
      {
        label: "Heroic fantasy male",
        id: "heroic_fantasy_male",
        prompt: "Heroic proof.",
        proofMode: "template_face_swap",
        generationWorkflow: "direct_multi_image_to_3d",
        enabled: false,
      },
    ],
  });

  assert.equal(config.visibleStyleCount, 2);
  assert.equal(
    config.styles.find((style) => style.id === "heroic_fantasy_male")?.enabled,
    false,
  );
  assert.deepEqual(
    visibleWorkflowStyles(config).map((style) => style.id),
    ["creative_lab_figure", "chibi_figure"],
  );
});

test("style proof mode round-trips and defaults to generated_options", () => {
  const config = normalizeFigurineWorkflowConfig({
    styles: [
      {
        label: "Creative Lab Figure",
        id: "creative_lab_figure",
        prompt: "Smooth toy figure proof.",
      },
      {
        label: "Chibi",
        id: "chibi_figure",
        prompt: "Chibi proof.",
        proofMode: "template_face_swap",
      },
    ],
  });

  assert.equal(config.styles[0].proofMode, "generated_options");
  assert.equal(
    config.styles.find((style) => style.id === "chibi_figure")?.proofMode,
    "template_face_swap",
  );

  const publicConfig = publicFigurineWorkflowConfig(config);
  assert.equal(
    publicConfig.styles.find((style) => style.id === "chibi_figure")?.proofMode,
    "template_face_swap",
  );
});

test("save-path validation rejects invalid payloads instead of defaulting", () => {
  // A style with an empty prompt fails the schema; before this check, the
  // save path silently replaced such payloads with the full defaults.
  const invalidResult = validateFigurineWorkflowConfigInput({
    styles: [{ label: "Chibi", id: "chibi_figure", prompt: "" }],
  });
  assert.ok(typeof invalidResult === "string" && invalidResult.length > 0);

  const validResult = validateFigurineWorkflowConfigInput({
    visibleStyleCount: 2,
    styles: [
      {
        label: "Chibi",
        id: "chibi_figure",
        prompt: "Chibi proof.",
        proofMode: "template_face_swap",
      },
    ],
  });
  assert.equal(validResult, null);
});

test("style generation workflow round-trips and defaults to Creative Lab", () => {
  const config = normalizeFigurineWorkflowConfig({
    styles: [
      {
        label: "Creative Lab Figure",
        id: "creative_lab_figure",
        prompt: "Smooth toy figure proof.",
      },
      {
        label: "Heroic fantasy male",
        id: "heroic_fantasy_male",
        prompt: "Heroic proof.",
        generationWorkflow: "direct_multi_image_to_3d",
      },
    ],
  });

  assert.equal(config.styles[0].generationWorkflow, "creative_lab_figure");
  assert.equal(
    config.styles.find((style) => style.id === "heroic_fantasy_male")
      ?.generationWorkflow,
    "direct_multi_image_to_3d",
  );

  const publicConfig = publicFigurineWorkflowConfig(config);
  assert.equal(
    publicConfig.styles.find((style) => style.id === "heroic_fantasy_male")
      ?.generationWorkflow,
    "direct_multi_image_to_3d",
  );
});

test("save-path validation rejects configs with no public styles", () => {
  const result = validateFigurineWorkflowConfigInput({
    visibleStyleCount: 2,
    styles: [
      {
        label: "Creative Lab Figure",
        id: "creative_lab_figure",
        prompt: "Smooth toy figure proof.",
        enabled: false,
      },
      {
        label: "Chibi",
        id: "chibi_figure",
        prompt: "Chibi proof.",
        enabled: false,
      },
      {
        label: "Heroic fantasy male",
        id: "heroic_fantasy_male",
        prompt: "Heroic proof.",
        enabled: false,
        generationWorkflow: "direct_multi_image_to_3d",
      },
    ],
  });

  assert.match(result ?? "", /At least one style/);
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
