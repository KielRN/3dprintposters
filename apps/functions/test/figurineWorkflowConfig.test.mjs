import assert from "node:assert/strict";
import test from "node:test";

import {
  maxWorkflowStyleReferenceImages,
  normalizeDirectMultiImageProviderSelection,
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
    "chibi_female",
    "heroic_fantasy_male",
    "heroic_fantasy_female",
  ]);
  assert.equal(config.visibleStyleCount, 5);
  assert.equal(
    config.styles.find((style) => style.id === "chibi_female")
      ?.generationWorkflow,
    "creative_lab_figure",
  );
  assert.equal(
    config.styles.find((style) => style.id === "chibi_female")?.proofMode,
    "template_face_swap",
  );
  assert.equal(
    config.styles.find((style) => style.id === "heroic_fantasy_male")
      ?.generationWorkflow,
    "direct_multi_image_to_3d",
  );
  assert.equal(
    config.styles.find((style) => style.id === "heroic_fantasy_female")
      ?.generationWorkflow,
    "direct_multi_image_to_3d",
  );
  assert.equal(
    config.styles.find((style) => style.id === "heroic_fantasy_female")
      ?.proofMode,
    "template_face_swap",
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
  assert.equal(config.styles[2].id, "chibi_female");
  assert.equal(config.styles[3].id, "heroic_fantasy_male");
  assert.equal(config.styles[4].id, "heroic_fantasy_female");
  assert.equal(config.visibleStyleCount, 5);
  assert.deepEqual(
    visibleWorkflowStyles(config).map((style) => style.id),
    [
      "creative_lab_figure",
      "chibi_figure",
      "chibi_female",
      "heroic_fantasy_male",
      "heroic_fantasy_female",
    ],
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
    [
      "creative_lab_figure",
      "chibi_figure",
      "chibi_female",
      "heroic_fantasy_male",
      "heroic_fantasy_female",
    ],
  );
  assert.equal(config.visibleStyleCount, 5);
  assert.equal(config.styles.length, 8);
  assert.deepEqual(
    config.styles.map((style) => [style.id, style.enabled]),
    [
      ["creative_lab_figure", true],
      ["chibi_figure", true],
      ["chibi_female", true],
      ["heroic_fantasy_male", true],
      ["heroic_fantasy_female", true],
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

  assert.equal(config.visibleStyleCount, 4);
  assert.equal(
    config.styles.find((style) => style.id === "chibi_figure")?.enabled,
    false,
  );
  assert.deepEqual(
    visibleWorkflowStyles(config).map((style) => style.id),
    [
      "creative_lab_figure",
      "chibi_female",
      "heroic_fantasy_male",
      "heroic_fantasy_female",
    ],
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

  assert.equal(config.visibleStyleCount, 4);
  assert.equal(
    config.styles.find((style) => style.id === "heroic_fantasy_male")?.enabled,
    false,
  );
  assert.deepEqual(
    visibleWorkflowStyles(config).map((style) => style.id),
    [
      "creative_lab_figure",
      "chibi_figure",
      "chibi_female",
      "heroic_fantasy_female",
    ],
  );
});

test("an admin-disabled heroic female style stays disabled and hidden", () => {
  const config = normalizeFigurineWorkflowConfig({
    visibleStyleCount: 4,
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
      },
      {
        label: "Heroic fantasy female",
        id: "heroic_fantasy_female",
        prompt: "Heroic female proof.",
        proofMode: "template_face_swap",
        generationWorkflow: "direct_multi_image_to_3d",
        enabled: false,
      },
    ],
  });

  assert.equal(config.visibleStyleCount, 4);
  assert.equal(
    config.styles.find((style) => style.id === "heroic_fantasy_female")
      ?.enabled,
    false,
  );
  assert.deepEqual(
    visibleWorkflowStyles(config).map((style) => style.id),
    [
      "creative_lab_figure",
      "chibi_figure",
      "chibi_female",
      "heroic_fantasy_male",
    ],
  );
});

test("an admin-disabled chibi female style stays disabled and hidden", () => {
  const config = normalizeFigurineWorkflowConfig({
    visibleStyleCount: 3,
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
        label: "Chibi female",
        id: "chibi_female",
        prompt: "Chibi female proof.",
        proofMode: "template_face_swap",
        generationWorkflow: "creative_lab_figure",
        enabled: false,
      },
      {
        label: "Heroic fantasy male",
        id: "heroic_fantasy_male",
        prompt: "Heroic proof.",
        proofMode: "template_face_swap",
        generationWorkflow: "direct_multi_image_to_3d",
      },
    ],
  });

  assert.equal(config.visibleStyleCount, 4);
  assert.equal(
    config.styles.find((style) => style.id === "chibi_female")?.enabled,
    false,
  );
  assert.deepEqual(
    visibleWorkflowStyles(config).map((style) => style.id),
    [
      "creative_lab_figure",
      "chibi_figure",
      "heroic_fantasy_male",
      "heroic_fantasy_female",
    ],
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
      {
        label: "Heroic fantasy female",
        id: "heroic_fantasy_female",
        prompt: "Heroic female proof.",
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
  assert.equal(
    config.styles.find((style) => style.id === "heroic_fantasy_female")
      ?.generationWorkflow,
    "direct_multi_image_to_3d",
  );

  const publicConfig = publicFigurineWorkflowConfig(config);
  assert.equal(
    publicConfig.styles.find((style) => style.id === "heroic_fantasy_male")
      ?.generationWorkflow,
    "direct_multi_image_to_3d",
  );
  assert.equal(
    publicConfig.styles.find((style) => style.id === "heroic_fantasy_female")
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
        label: "Chibi female",
        id: "chibi_female",
        prompt: "Chibi female proof.",
        enabled: false,
        proofMode: "template_face_swap",
        generationWorkflow: "creative_lab_figure",
      },
      {
        label: "Heroic fantasy male",
        id: "heroic_fantasy_male",
        prompt: "Heroic proof.",
        enabled: false,
        generationWorkflow: "direct_multi_image_to_3d",
      },
      {
        label: "Heroic fantasy female",
        id: "heroic_fantasy_female",
        prompt: "Heroic female proof.",
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

test("direct styles default to the Hi3D provider with its default model", () => {
  const config = normalizeFigurineWorkflowConfig({
    styles: [
      {
        id: "heroic_fantasy_male",
        label: "Heroic fantasy male",
        proofMode: "template_face_swap",
        generationWorkflow: "direct_multi_image_to_3d",
        prompt: "Face swap task prompt.",
      },
    ],
  });
  const heroic = config.styles.find(
    (style) => style.id === "heroic_fantasy_male",
  );

  assert.equal(heroic.provider, "hi3d");
  assert.equal(heroic.providerModel, "hitem3dv2.1");
});

test("direct styles keep an explicit Meshy provider selection", () => {
  const config = normalizeFigurineWorkflowConfig({
    styles: [
      {
        id: "heroic_fantasy_male",
        label: "Heroic fantasy male",
        proofMode: "template_face_swap",
        generationWorkflow: "direct_multi_image_to_3d",
        provider: "meshy",
        providerModel: "meshy-6",
        prompt: "Face swap task prompt.",
      },
    ],
  });
  const heroic = config.styles.find(
    (style) => style.id === "heroic_fantasy_male",
  );

  assert.equal(heroic.provider, "meshy");
  assert.equal(heroic.providerModel, "meshy-6");
});

test("direct styles coerce unknown providers and models to valid defaults", () => {
  const config = normalizeFigurineWorkflowConfig({
    styles: [
      {
        id: "heroic_fantasy_male",
        label: "Heroic fantasy male",
        proofMode: "template_face_swap",
        generationWorkflow: "direct_multi_image_to_3d",
        provider: "tripo",
        providerModel: "tripo-v3.1",
        prompt: "Face swap task prompt.",
      },
      {
        id: "heroic_fantasy_female",
        label: "Heroic fantasy female",
        proofMode: "template_face_swap",
        generationWorkflow: "direct_multi_image_to_3d",
        provider: "hi3d",
        providerModel: "not-a-model",
        prompt: "Face swap task prompt.",
      },
    ],
  });
  const male = config.styles.find(
    (style) => style.id === "heroic_fantasy_male",
  );
  const female = config.styles.find(
    (style) => style.id === "heroic_fantasy_female",
  );

  assert.equal(male.provider, "hi3d");
  assert.equal(male.providerModel, "hitem3dv2.1");
  assert.equal(female.provider, "hi3d");
  assert.equal(female.providerModel, "hitem3dv2.1");
});

test("creative lab styles carry no provider fields", () => {
  const config = normalizeFigurineWorkflowConfig({
    styles: [
      {
        id: "chibi_figure",
        label: "Chibi",
        generationWorkflow: "creative_lab_figure",
        provider: "hi3d",
        providerModel: "hitem3dv2.1",
        prompt: "Chibi prompt.",
      },
    ],
  });
  const chibi = config.styles.find((style) => style.id === "chibi_figure");

  assert.equal(chibi.provider, undefined);
  assert.equal(chibi.providerModel, undefined);
});

test("normalizeDirectMultiImageProviderSelection resets model on provider switch", () => {
  assert.deepEqual(
    normalizeDirectMultiImageProviderSelection({ provider: "meshy" }),
    { provider: "meshy", providerModel: "meshy-6" },
  );
  assert.deepEqual(
    normalizeDirectMultiImageProviderSelection({
      provider: "hi3d",
      providerModel: "scene-portraitv2.1",
    }),
    { provider: "hi3d", providerModel: "scene-portraitv2.1" },
  );
  assert.deepEqual(normalizeDirectMultiImageProviderSelection({}), {
    provider: "hi3d",
    providerModel: "hitem3dv2.1",
  });
});
