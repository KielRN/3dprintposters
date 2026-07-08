export type WorkflowProductType = "poster" | "figurine";

export type WorkflowProofMode = "generated_options" | "template_face_swap";
export type WorkflowGenerationWorkflow =
  | "creative_lab_figure"
  | "direct_multi_image_to_3d";

// Mirrors the Functions-side provider catalog for the direct
// Multi-Image-to-3D workflow. Creative Lab styles always run on Meshy's
// Creative Lab API and carry no provider fields. Hi3D (Hitem3D v2.1) is the
// decided production path for direct styles; Meshy remains the rollback lever.
export type WorkflowFigurineProvider = "meshy" | "hi3d";

export type FigurineProviderModelInfo = {
  label: string;
  summary: string;
};

export const directMultiImageProviderCatalog: Record<
  WorkflowFigurineProvider,
  {
    label: string;
    defaultModel: string;
    models: Record<string, FigurineProviderModelInfo>;
  }
> = {
  meshy: {
    label: "Meshy",
    defaultModel: "meshy-6",
    models: {
      "meshy-6": {
        label: "Meshy 6",
        summary:
          "Multi-Image-to-3D · texture on, PBR off · remesh to 100k faces · GLB+STL+3MF · Meshy credits",
      },
    },
  },
  hi3d: {
    label: "Hi3D (Hitem3D)",
    defaultModel: "hitem3dv2.1",
    // Labels and resolution names mirror the Hi3D console usage table
    // (platform.hi3d.ai). Portrait @ 1536³ Pro Fast won Elliot's 2026-07-08
    // face-quality comparison; admins select it per style.
    models: {
      "hitem3dv2.1": {
        label: "hitem3d v2.1",
        summary:
          "1536³ Fast · Geometry + Texture · no PBR · GLB · 25 credits (~$0.50) · ~7 min",
      },
      "scene-portraitv2.1": {
        label: "scene-portrait v2.1",
        summary:
          "1536³ Pro Fast · Geometry + Texture · no PBR · GLB · 25 credits (~$0.50) · ~7 min",
      },
    },
  },
};

export const defaultDirectMultiImageProvider: WorkflowFigurineProvider = "hi3d";

export function normalizeDirectMultiImageProviderSelection(input: {
  provider?: unknown;
  providerModel?: unknown;
}): { provider: WorkflowFigurineProvider; providerModel: string } {
  const provider =
    input.provider === "meshy" || input.provider === "hi3d"
      ? input.provider
      : defaultDirectMultiImageProvider;
  const catalogEntry = directMultiImageProviderCatalog[provider];
  const providerModel =
    typeof input.providerModel === "string" &&
    input.providerModel in catalogEntry.models
      ? input.providerModel
      : catalogEntry.defaultModel;
  return { provider, providerModel };
}

// Mirrors the Functions-side default: in template_face_swap mode this text is
// sent to Vertex VERBATIM as the entire edit instruction, so the admin UI
// prefills it when the mode is selected. Image order: template first,
// customer photo second.
export const defaultTemplateFaceSwapPrompt = [
  "Face swap task. The first image is the approved style template character. The second image is the customer photo.",
  "Edit the first image so the character's facial identity becomes the person from the second image: face, head shape, skin tone, hair or baldness, facial hair, glasses, and expression cues come from the customer photo while staying rendered in the template's art style.",
  "Preserve everything else in the template exactly: pose, body proportions, costume, props with their exact grip and angle, colors, materials, lighting, background treatment, and framing.",
  "Preserve every costume and surface detail at full sharpness; do not soften, simplify, or repaint anything outside the swapped face and head.",
  "The result must read as the same stylized character artwork with a new identity, never as a photorealistic person.",
  "Output only the edited image.",
].join("\n");

export type WorkflowStyleReferenceImage = {
  id: string;
  label: string;
  storagePath: string;
  mimeType: "image/jpeg" | "image/png";
  enabled: boolean;
};

export type WorkflowStyleConfig = {
  id: string;
  label: string;
  productType: WorkflowProductType;
  proofMode: WorkflowProofMode;
  generationWorkflow: WorkflowGenerationWorkflow;
  // Set only when generationWorkflow is "direct_multi_image_to_3d"; validated
  // against directMultiImageProviderCatalog during normalization.
  provider?: WorkflowFigurineProvider;
  providerModel?: string;
  prompt: string;
  enabled: boolean;
  referenceImages: WorkflowStyleReferenceImage[];
};

export type WorkflowRoleGateConfig = {
  enabled: boolean;
  requiredRole: string;
  note: string;
};

export type FigurineWorkflowConfig = {
  proofGenerationCount: number;
  baseProofPrompt: string;
  visibleStyleCount: number;
  styles: WorkflowStyleConfig[];
  roleGate: WorkflowRoleGateConfig;
};

export type FigurineWorkflowConfigResponse = {
  config?: unknown;
  visibleStyles?: unknown;
  roleGate?: unknown;
};

export const maxWorkflowStyleReferenceImages = 4;
export const maxWorkflowStyleReferenceImageBytes = 5 * 1024 * 1024;
const referenceImageStoragePathPattern =
  /^admin\/workflow-style-references\/[a-z0-9_]{1,80}\/[a-zA-Z0-9_-]{8,80}\.(?:jpe?g|png)$/;

const approvedChibiStyle: WorkflowStyleConfig = {
  id: "chibi_figure",
  label: "Chibi heroic fantasy male",
  productType: "figurine",
  proofMode: "generated_options",
  generationWorkflow: "creative_lab_figure",
  prompt:
    "Fully stylized chibi character, never photorealistic: oversized head about one third of the total height, compact rounded body, large expressive eyes, a simplified friendly face that keeps the subject clearly recognizable, chunky simplified hands and shoes, smooth vinyl-toy surfaces, and broad clean color regions. The proof must read as a finished stylized character illustration, not a photo of a person.",
  enabled: true,
  referenceImages: [],
};

const approvedHeroicFantasyMaleStyle: WorkflowStyleConfig = {
  id: "heroic_fantasy_male",
  label: "Heroic fantasy male",
  productType: "figurine",
  proofMode: "template_face_swap",
  generationWorkflow: "direct_multi_image_to_3d",
  provider: "hi3d",
  providerModel: "hitem3dv2.1",
  prompt: defaultTemplateFaceSwapPrompt,
  enabled: true,
  referenceImages: [],
};

const approvedHeroicFantasyFemaleStyle: WorkflowStyleConfig = {
  id: "heroic_fantasy_female",
  label: "Heroic fantasy female",
  productType: "figurine",
  proofMode: "template_face_swap",
  generationWorkflow: "direct_multi_image_to_3d",
  provider: "hi3d",
  providerModel: "hitem3dv2.1",
  prompt: defaultTemplateFaceSwapPrompt,
  enabled: true,
  referenceImages: [],
};

const approvedChibiFemaleStyle: WorkflowStyleConfig = {
  id: "chibi_female",
  label: "Chibi heroic fantasy female",
  productType: "figurine",
  proofMode: "template_face_swap",
  generationWorkflow: "creative_lab_figure",
  prompt: defaultTemplateFaceSwapPrompt,
  enabled: true,
  referenceImages: [],
};

export const defaultFigurineWorkflowConfig: FigurineWorkflowConfig = {
  proofGenerationCount: 4,
  baseProofPrompt: [
    "Create a clean full-body 2D concept image for a personalized 3D printed figurine.",
    "Use the uploaded photo as the identity and outfit reference. Preserve recognizable facial likeness, broad head shape, glasses or facial hair if present, and the main clothing color impression.",
    "The result should feel like a product-ready figurine proof that can guide a later 3D model generation step.",
  ].join("\n"),
  visibleStyleCount: 5,
  styles: [
    {
      id: "creative_lab_figure",
      label: "Creative Lab Figure",
      productType: "figurine",
      proofMode: "generated_options",
      generationWorkflow: "creative_lab_figure",
      prompt:
        "Smooth chibi or emoji/avatar vinyl toy character, simplified expressive face, friendly proportions, clean silhouette, and broad color regions.",
      enabled: true,
      referenceImages: [],
    },
    approvedChibiStyle,
    approvedChibiFemaleStyle,
    approvedHeroicFantasyMaleStyle,
    approvedHeroicFantasyFemaleStyle,
    {
      id: "emoji_avatar",
      label: "Emoji Avatar",
      productType: "figurine",
      proofMode: "generated_options",
      generationWorkflow: "creative_lab_figure",
      prompt:
        "Bright emoji-avatar character with a rounded head, expressive simple face, toy-like body, clean clothing shapes, and a friendly natural standing pose.",
      enabled: false,
      referenceImages: [],
    },
    {
      id: "bobblehead",
      label: "Bobblehead",
      productType: "figurine",
      proofMode: "generated_options",
      generationWorkflow: "creative_lab_figure",
      prompt:
        "Bobblehead-inspired proof with an oversized expressive head, smaller sturdy body, clear facial likeness, and feet placed flat for later base assembly.",
      enabled: false,
      referenceImages: [],
    },
    {
      id: "cartoon_figure",
      label: "Cartoon Figure",
      productType: "figurine",
      proofMode: "generated_options",
      generationWorkflow: "creative_lab_figure",
      prompt:
        "Polished cartoon figurine with smooth simplified shapes, readable outfit colors, friendly expression, and a clean manufacturable silhouette.",
      enabled: false,
      referenceImages: [],
    },
  ],
  roleGate: {
    enabled: false,
    requiredRole: "admin",
    note: "Placeholder only during dev. The save callable requires a signed-in user, but custom-claim role enforcement is not active yet.",
  },
};

export function normalizeFigurineWorkflowConfig(
  rawConfig: unknown,
): FigurineWorkflowConfig {
  if (!rawConfig || typeof rawConfig !== "object") {
    return defaultFigurineWorkflowConfig;
  }

  const config = rawConfig as Partial<FigurineWorkflowConfig>;
  const styles = Array.isArray(config.styles)
    ? config.styles
        .map(normalizeWorkflowStyle)
        .filter((style): style is WorkflowStyleConfig => Boolean(style))
        .slice(0, 12)
    : defaultFigurineWorkflowConfig.styles;
  const safeStyles =
    styles.length > 0 ? styles : defaultFigurineWorkflowConfig.styles;
  const requestedVisibleStyleCount = clampInteger(
    config.visibleStyleCount,
    1,
    safeStyles.length,
    defaultFigurineWorkflowConfig.visibleStyleCount,
  );
  const chibiSafeConfig = ensureApprovedChibiStyle(
    safeStyles,
    requestedVisibleStyleCount,
  );
  const chibiFemaleSafeConfig = ensureApprovedChibiFemaleStyle(
    chibiSafeConfig.styles,
    chibiSafeConfig.visibleStyleCount,
  );
  const heroicSafeConfig = ensureApprovedHeroicFantasyMaleStyle(
    chibiFemaleSafeConfig.styles,
    chibiFemaleSafeConfig.visibleStyleCount,
  );
  const heroicFemaleSafeConfig = ensureApprovedHeroicFantasyFemaleStyle(
    heroicSafeConfig.styles,
    heroicSafeConfig.visibleStyleCount,
  );
  const publicSafeStyles = applyLegacyVisibleStyleWindow(
    heroicFemaleSafeConfig.styles,
    heroicFemaleSafeConfig.visibleStyleCount,
  );
  const roleGate =
    config.roleGate && typeof config.roleGate === "object"
      ? config.roleGate
      : defaultFigurineWorkflowConfig.roleGate;

  return {
    proofGenerationCount: clampInteger(
      config.proofGenerationCount,
      1,
      4,
      defaultFigurineWorkflowConfig.proofGenerationCount,
    ),
    baseProofPrompt:
      typeof config.baseProofPrompt === "string" &&
      config.baseProofPrompt.trim().length >= 20
        ? config.baseProofPrompt.trim()
        : defaultFigurineWorkflowConfig.baseProofPrompt,
    visibleStyleCount: publicStyleCount(publicSafeStyles),
    styles: publicSafeStyles,
    roleGate: {
      enabled: Boolean(roleGate.enabled),
      requiredRole:
        typeof roleGate.requiredRole === "string" && roleGate.requiredRole
          ? roleGate.requiredRole
          : defaultFigurineWorkflowConfig.roleGate.requiredRole,
      note:
        typeof roleGate.note === "string" && roleGate.note
          ? roleGate.note
          : defaultFigurineWorkflowConfig.roleGate.note,
    },
  };
}

export function visibleWorkflowStyles(
  config: FigurineWorkflowConfig,
): WorkflowStyleConfig[] {
  return config.styles.filter((style) => style.enabled);
}

export function normalizeFigurineWorkflowConfigResponse(
  rawResponse: unknown,
): FigurineWorkflowConfig {
  if (!rawResponse || typeof rawResponse !== "object") {
    return defaultFigurineWorkflowConfig;
  }

  const response = rawResponse as FigurineWorkflowConfigResponse;
  return normalizeFigurineWorkflowConfig(response.config ?? rawResponse);
}

export function normalizeStyleId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll("-", "_")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 80);
}

export function normalizeReferenceImageId(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
}

function normalizeWorkflowStyle(
  rawStyle: unknown,
  index: number,
): WorkflowStyleConfig | null {
  if (!rawStyle || typeof rawStyle !== "object") {
    return null;
  }

  const style = rawStyle as Partial<WorkflowStyleConfig>;
  const label =
    typeof style.label === "string" && style.label.trim()
      ? style.label.trim()
      : `Style ${index + 1}`;
  const prompt =
    typeof style.prompt === "string" && style.prompt.trim()
      ? style.prompt.trim()
      : "";
  const id = normalizeStyleId(
    typeof style.id === "string" && style.id.trim() ? style.id : label,
  );

  if (!id) {
    return null;
  }

  const generationWorkflow =
    style.generationWorkflow === "direct_multi_image_to_3d"
      ? "direct_multi_image_to_3d"
      : "creative_lab_figure";

  return {
    id,
    label,
    productType: style.productType === "poster" ? "poster" : "figurine",
    proofMode:
      style.proofMode === "template_face_swap"
        ? "template_face_swap"
        : "generated_options",
    generationWorkflow,
    ...(generationWorkflow === "direct_multi_image_to_3d"
      ? normalizeDirectMultiImageProviderSelection({
          provider: style.provider,
          providerModel: style.providerModel,
        })
      : {}),
    prompt,
    enabled: style.enabled !== false,
    referenceImages: Array.isArray(style.referenceImages)
      ? style.referenceImages
          .map(normalizeWorkflowStyleReferenceImage)
          .filter((image): image is WorkflowStyleReferenceImage =>
            Boolean(image),
          )
          .slice(0, maxWorkflowStyleReferenceImages)
      : [],
  };
}

function normalizeWorkflowStyleReferenceImage(
  rawImage: unknown,
  index: number,
): WorkflowStyleReferenceImage | null {
  if (!rawImage || typeof rawImage !== "object") {
    return null;
  }

  const image = rawImage as Partial<WorkflowStyleReferenceImage>;
  const storagePath =
    typeof image.storagePath === "string" ? image.storagePath.trim() : "";
  const mimeType = image.mimeType;

  if (
    !referenceImageStoragePathPattern.test(storagePath) ||
    (mimeType !== "image/jpeg" && mimeType !== "image/png")
  ) {
    return null;
  }

  const id = normalizeReferenceImageId(
    typeof image.id === "string" && image.id.trim()
      ? image.id
      : `reference_${index + 1}`,
  );

  if (!id) {
    return null;
  }

  return {
    id,
    label:
      typeof image.label === "string" && image.label.trim()
        ? image.label.trim().slice(0, 80)
        : `Reference ${index + 1}`,
    storagePath,
    mimeType,
    enabled: image.enabled !== false,
  };
}

function ensureApprovedChibiStyle(
  styles: WorkflowStyleConfig[],
  visibleStyleCount: number,
): { styles: WorkflowStyleConfig[]; visibleStyleCount: number } {
  const chibi = styles.find((style) => style.id === approvedChibiStyle.id);

  if (!chibi) {
    const withChibi = [
      ...styles.slice(0, 1),
      approvedChibiStyle,
      ...styles.slice(1),
    ].slice(0, 12);
    return {
      styles: withChibi,
      visibleStyleCount: Math.max(
        visibleStyleCount,
        Math.min(2, withChibi.length),
      ),
    };
  }

  const chibiVisibleIndex = styles
    .filter((style) => style.enabled)
    .findIndex((style) => style.id === approvedChibiStyle.id);
  if (!chibi.enabled || chibiVisibleIndex < visibleStyleCount) {
    return { styles, visibleStyleCount };
  }

  const withoutChibi = styles.filter(
    (style) => style.id !== approvedChibiStyle.id,
  );
  return {
    styles: [...withoutChibi.slice(0, 1), chibi, ...withoutChibi.slice(1)],
    visibleStyleCount: Math.max(visibleStyleCount, 2),
  };
}

function ensureApprovedChibiFemaleStyle(
  styles: WorkflowStyleConfig[],
  visibleStyleCount: number,
): { styles: WorkflowStyleConfig[]; visibleStyleCount: number } {
  const chibiFemale = styles.find(
    (style) => style.id === approvedChibiFemaleStyle.id,
  );

  if (!chibiFemale) {
    const chibiIndex = styles.findIndex(
      (style) => style.id === approvedChibiStyle.id,
    );
    const insertIndex =
      chibiIndex >= 0 ? chibiIndex + 1 : Math.min(2, styles.length);
    const withChibiFemale = [
      ...styles.slice(0, insertIndex),
      approvedChibiFemaleStyle,
      ...styles.slice(insertIndex),
    ].slice(0, 12);
    return {
      styles: withChibiFemale,
      visibleStyleCount: Math.max(
        visibleStyleCount,
        Math.min(insertIndex + 1, withChibiFemale.length),
      ),
    };
  }

  const chibiFemaleVisibleIndex = styles
    .filter((style) => style.enabled)
    .findIndex((style) => style.id === approvedChibiFemaleStyle.id);
  if (!chibiFemale.enabled || chibiFemaleVisibleIndex < visibleStyleCount) {
    return { styles, visibleStyleCount };
  }

  const withoutChibiFemale = styles.filter(
    (style) => style.id !== approvedChibiFemaleStyle.id,
  );
  const chibiIndex = withoutChibiFemale.findIndex(
    (style) => style.id === approvedChibiStyle.id,
  );
  const insertIndex =
    chibiIndex >= 0 ? chibiIndex + 1 : Math.min(2, withoutChibiFemale.length);

  return {
    styles: [
      ...withoutChibiFemale.slice(0, insertIndex),
      chibiFemale,
      ...withoutChibiFemale.slice(insertIndex),
    ],
    visibleStyleCount: Math.max(visibleStyleCount, insertIndex + 1),
  };
}

function ensureApprovedHeroicFantasyMaleStyle(
  styles: WorkflowStyleConfig[],
  visibleStyleCount: number,
): { styles: WorkflowStyleConfig[]; visibleStyleCount: number } {
  const heroic = styles.find(
    (style) => style.id === approvedHeroicFantasyMaleStyle.id,
  );

  if (!heroic) {
    const chibiFemaleIndex = styles.findIndex(
      (style) => style.id === approvedChibiFemaleStyle.id,
    );
    const chibiIndex = styles.findIndex(
      (style) => style.id === approvedChibiStyle.id,
    );
    const insertIndex =
      chibiFemaleIndex >= 0
        ? chibiFemaleIndex + 1
        : chibiIndex >= 0
          ? chibiIndex + 1
          : Math.min(2, styles.length);
    const withHeroic = [
      ...styles.slice(0, insertIndex),
      approvedHeroicFantasyMaleStyle,
      ...styles.slice(insertIndex),
    ].slice(0, 12);
    return {
      styles: withHeroic,
      visibleStyleCount: Math.max(
        visibleStyleCount,
        Math.min(insertIndex + 1, withHeroic.length),
      ),
    };
  }

  const heroicVisibleIndex = styles
    .filter((style) => style.enabled)
    .findIndex((style) => style.id === approvedHeroicFantasyMaleStyle.id);
  if (!heroic.enabled || heroicVisibleIndex < visibleStyleCount) {
    return { styles, visibleStyleCount };
  }

  const withoutHeroic = styles.filter(
    (style) => style.id !== approvedHeroicFantasyMaleStyle.id,
  );
  const chibiFemaleIndex = withoutHeroic.findIndex(
    (style) => style.id === approvedChibiFemaleStyle.id,
  );
  const chibiIndex = withoutHeroic.findIndex(
    (style) => style.id === approvedChibiStyle.id,
  );
  const insertIndex =
    chibiFemaleIndex >= 0
      ? chibiFemaleIndex + 1
      : chibiIndex >= 0
        ? chibiIndex + 1
        : Math.min(2, withoutHeroic.length);

  return {
    styles: [
      ...withoutHeroic.slice(0, insertIndex),
      heroic,
      ...withoutHeroic.slice(insertIndex),
    ],
    visibleStyleCount: Math.max(visibleStyleCount, insertIndex + 1),
  };
}

function ensureApprovedHeroicFantasyFemaleStyle(
  styles: WorkflowStyleConfig[],
  visibleStyleCount: number,
): { styles: WorkflowStyleConfig[]; visibleStyleCount: number } {
  const heroicFemale = styles.find(
    (style) => style.id === approvedHeroicFantasyFemaleStyle.id,
  );

  if (!heroicFemale) {
    const heroicMaleIndex = styles.findIndex(
      (style) => style.id === approvedHeroicFantasyMaleStyle.id,
    );
    const chibiFemaleIndex = styles.findIndex(
      (style) => style.id === approvedChibiFemaleStyle.id,
    );
    const chibiIndex = styles.findIndex(
      (style) => style.id === approvedChibiStyle.id,
    );
    const insertIndex =
      heroicMaleIndex >= 0
        ? heroicMaleIndex + 1
        : chibiFemaleIndex >= 0
          ? chibiFemaleIndex + 1
          : chibiIndex >= 0
            ? chibiIndex + 1
            : Math.min(2, styles.length);
    const withHeroicFemale = [
      ...styles.slice(0, insertIndex),
      approvedHeroicFantasyFemaleStyle,
      ...styles.slice(insertIndex),
    ].slice(0, 12);
    return {
      styles: withHeroicFemale,
      visibleStyleCount: Math.max(
        visibleStyleCount,
        Math.min(insertIndex + 1, withHeroicFemale.length),
      ),
    };
  }

  const heroicFemaleVisibleIndex = styles
    .filter((style) => style.enabled)
    .findIndex((style) => style.id === approvedHeroicFantasyFemaleStyle.id);
  if (!heroicFemale.enabled || heroicFemaleVisibleIndex < visibleStyleCount) {
    return { styles, visibleStyleCount };
  }

  const withoutHeroicFemale = styles.filter(
    (style) => style.id !== approvedHeroicFantasyFemaleStyle.id,
  );
  const heroicMaleIndex = withoutHeroicFemale.findIndex(
    (style) => style.id === approvedHeroicFantasyMaleStyle.id,
  );
  const chibiFemaleIndex = withoutHeroicFemale.findIndex(
    (style) => style.id === approvedChibiFemaleStyle.id,
  );
  const chibiIndex = withoutHeroicFemale.findIndex(
    (style) => style.id === approvedChibiStyle.id,
  );
  const insertIndex =
    heroicMaleIndex >= 0
      ? heroicMaleIndex + 1
      : chibiFemaleIndex >= 0
        ? chibiFemaleIndex + 1
        : chibiIndex >= 0
          ? chibiIndex + 1
          : Math.min(2, withoutHeroicFemale.length);

  return {
    styles: [
      ...withoutHeroicFemale.slice(0, insertIndex),
      heroicFemale,
      ...withoutHeroicFemale.slice(insertIndex),
    ],
    visibleStyleCount: Math.max(visibleStyleCount, insertIndex + 1),
  };
}

function applyLegacyVisibleStyleWindow(
  styles: WorkflowStyleConfig[],
  visibleStyleCount: number,
): WorkflowStyleConfig[] {
  const enabledIndexes = styles
    .map((style, index) => (style.enabled ? index : -1))
    .filter((index) => index >= 0);

  if (enabledIndexes.length <= visibleStyleCount) {
    return styles;
  }

  const publicIndexes = new Set(enabledIndexes.slice(0, visibleStyleCount));
  return styles.map((style, index) =>
    style.enabled && !publicIndexes.has(index)
      ? { ...style, enabled: false }
      : style,
  );
}

function publicStyleCount(styles: WorkflowStyleConfig[]): number {
  return styles.filter((style) => style.enabled).length;
}

function clampInteger(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  return Number.isInteger(value)
    ? Math.min(Math.max(value as number, min), max)
    : Math.min(Math.max(fallback, min), max);
}
