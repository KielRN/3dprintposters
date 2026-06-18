export type WorkflowProductType = "poster" | "figurine";

export type WorkflowStyleConfig = {
  id: string;
  label: string;
  productType: WorkflowProductType;
  prompt: string;
  enabled: boolean;
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

export const defaultFigurineWorkflowConfig: FigurineWorkflowConfig = {
  proofGenerationCount: 4,
  baseProofPrompt: [
    "Create a clean full-body 2D concept image for a personalized 3D printed figurine.",
    "Use the uploaded photo as the identity and outfit reference. Preserve recognizable facial likeness, broad head shape, glasses or facial hair if present, and the main clothing color impression.",
    "The result should feel like a product-ready figurine proof that can guide a later 3D model generation step.",
  ].join("\n"),
  visibleStyleCount: 1,
  styles: [
    {
      id: "creative_lab_figure",
      label: "Creative Lab Figure",
      productType: "figurine",
      prompt:
        "Smooth chibi or emoji/avatar vinyl toy character, simplified expressive face, friendly proportions, clean silhouette, and broad color regions.",
      enabled: true,
    },
    {
      id: "emoji_avatar",
      label: "Emoji Avatar",
      productType: "figurine",
      prompt:
        "Bright emoji-avatar character with a rounded head, expressive simple face, toy-like body, clean clothing shapes, and a friendly natural standing pose.",
      enabled: true,
    },
    {
      id: "chibi_figure",
      label: "Chibi Figure",
      productType: "figurine",
      prompt:
        "Cute chibi figurine proportions with a larger head, compact body, soft features, clean hands and shoes, and a balanced full-body stance.",
      enabled: true,
    },
    {
      id: "bobblehead",
      label: "Bobblehead",
      productType: "figurine",
      prompt:
        "Bobblehead-inspired proof with an oversized expressive head, smaller sturdy body, clear facial likeness, and feet placed flat for later base assembly.",
      enabled: true,
    },
    {
      id: "cartoon_figure",
      label: "Cartoon Figure",
      productType: "figurine",
      prompt:
        "Polished cartoon figurine with smooth simplified shapes, readable outfit colors, friendly expression, and a clean manufacturable silhouette.",
      enabled: true,
    },
  ],
  roleGate: {
    enabled: false,
    requiredRole: "admin",
    note:
      "Placeholder only during dev. The save callable requires a signed-in user, but custom-claim role enforcement is not active yet.",
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
    visibleStyleCount: clampInteger(
      config.visibleStyleCount,
      1,
      safeStyles.length,
      defaultFigurineWorkflowConfig.visibleStyleCount,
    ),
    styles: safeStyles,
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
  return config.styles
    .filter((style) => style.enabled)
    .slice(0, config.visibleStyleCount);
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

  if (!id || !prompt) {
    return null;
  }

  return {
    id,
    label,
    productType: style.productType === "poster" ? "poster" : "figurine",
    prompt,
    enabled: style.enabled !== false,
  };
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
