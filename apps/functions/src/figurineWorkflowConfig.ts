import {
  FieldValue,
  type Firestore,
} from "firebase-admin/firestore";
import { z } from "zod";

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

export const figurineWorkflowConfigCollection = "adminConfig";
export const figurineWorkflowConfigDocId = "figurineWorkflow";

const maxProofGenerationCount = 4;
const maxWorkflowStyles = 12;

const defaultBaseProofPrompt = [
  "Create a clean full-body 2D concept image for a personalized 3D printed figurine.",
  "Use the uploaded photo as the identity and outfit reference. Preserve recognizable facial likeness, broad head shape, glasses or facial hair if present, and the main clothing color impression.",
  "The result should feel like a product-ready figurine proof that can guide a later 3D model generation step.",
].join("\n");

const defaultStyles: WorkflowStyleConfig[] = [
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
];

export const defaultFigurineWorkflowConfig: FigurineWorkflowConfig = {
  proofGenerationCount: 4,
  baseProofPrompt: defaultBaseProofPrompt,
  visibleStyleCount: 1,
  styles: defaultStyles,
  roleGate: {
    enabled: false,
    requiredRole: "admin",
    note:
      "Placeholder only during dev. The save callable requires a signed-in user, but custom-claim role enforcement is not active yet.",
  },
};

const rawStyleSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  label: z.string().trim().min(1).max(80),
  productType: z.enum(["poster", "figurine"]).optional(),
  prompt: z.string().trim().min(1).max(4000),
  enabled: z.boolean().optional(),
});

const rawRoleGateSchema = z.object({
  enabled: z.boolean().optional(),
  requiredRole: z.string().trim().min(1).max(60).optional(),
  note: z.string().trim().max(240).optional(),
});

const rawWorkflowConfigSchema = z.object({
  proofGenerationCount: z.coerce.number().int().optional(),
  baseProofPrompt: z.string().trim().min(20).max(5000).optional(),
  visibleStyleCount: z.coerce.number().int().optional(),
  styles: z.array(rawStyleSchema).min(1).max(maxWorkflowStyles).optional(),
  roleGate: rawRoleGateSchema.optional(),
});

export function normalizeFigurineWorkflowConfig(
  rawConfig: unknown,
): FigurineWorkflowConfig {
  const parsed = rawWorkflowConfigSchema.safeParse(rawConfig ?? {});
  const source = parsed.success ? parsed.data : {};
  const sourceRoleGate = source.roleGate ?? {};
  const styles = (source.styles ?? defaultFigurineWorkflowConfig.styles)
    .map(normalizeWorkflowStyle)
    .filter((style): style is WorkflowStyleConfig => Boolean(style))
    .slice(0, maxWorkflowStyles);
  const safeStyles =
    styles.length > 0 ? styles : defaultFigurineWorkflowConfig.styles;

  return {
    proofGenerationCount: clampInteger(
      source.proofGenerationCount,
      1,
      maxProofGenerationCount,
      defaultFigurineWorkflowConfig.proofGenerationCount,
    ),
    baseProofPrompt:
      source.baseProofPrompt ?? defaultFigurineWorkflowConfig.baseProofPrompt,
    visibleStyleCount: clampInteger(
      source.visibleStyleCount,
      1,
      safeStyles.length,
      defaultFigurineWorkflowConfig.visibleStyleCount,
    ),
    styles: safeStyles,
    roleGate: {
      enabled:
        sourceRoleGate.enabled ??
        defaultFigurineWorkflowConfig.roleGate.enabled,
      requiredRole:
        sourceRoleGate.requiredRole ??
        defaultFigurineWorkflowConfig.roleGate.requiredRole,
      note: sourceRoleGate.note ?? defaultFigurineWorkflowConfig.roleGate.note,
    },
  };
}

export async function readFigurineWorkflowConfig(
  db: Firestore,
): Promise<FigurineWorkflowConfig> {
  const snapshot = await db
    .collection(figurineWorkflowConfigCollection)
    .doc(figurineWorkflowConfigDocId)
    .get();

  return normalizeFigurineWorkflowConfig(snapshot.data());
}

export async function saveFigurineWorkflowConfig(input: {
  db: Firestore;
  config: unknown;
  uid: string;
}): Promise<FigurineWorkflowConfig> {
  const config = normalizeFigurineWorkflowConfig(input.config);

  await input.db
    .collection(figurineWorkflowConfigCollection)
    .doc(figurineWorkflowConfigDocId)
    .set(
      {
        ...config,
        updatedAt: FieldValue.serverTimestamp(),
        updatedByUid: input.uid,
      },
      { merge: true },
    );

  return config;
}

export function visibleWorkflowStyles(
  config: FigurineWorkflowConfig,
): WorkflowStyleConfig[] {
  return config.styles
    .filter((style) => style.enabled)
    .slice(0, config.visibleStyleCount);
}

export function resolveVisibleWorkflowStyle(
  config: FigurineWorkflowConfig,
  selectedStyle: string,
): WorkflowStyleConfig | null {
  const normalizedStyle = normalizeStyleId(selectedStyle);
  return (
    visibleWorkflowStyles(config).find(
      (style) => normalizeStyleId(style.id) === normalizedStyle,
    ) ?? null
  );
}

function normalizeWorkflowStyle(
  rawStyle: z.infer<typeof rawStyleSchema>,
  index: number,
): WorkflowStyleConfig | null {
  const id = normalizeStyleId(rawStyle.id ?? rawStyle.label);
  const label = rawStyle.label.trim();
  const prompt = rawStyle.prompt.trim();

  if (!id || !label || !prompt) {
    return null;
  }

  return {
    id: id || `style_${index + 1}`,
    label,
    productType: rawStyle.productType ?? "figurine",
    prompt,
    enabled: rawStyle.enabled ?? true,
  };
}

function normalizeStyleId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll("-", "_")
    .replaceAll(/\s+/g, "_")
    .replaceAll(/[^a-z0-9_]/g, "")
    .slice(0, 80);
}

function clampInteger(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!Number.isInteger(value)) {
    return Math.min(Math.max(fallback, min), max);
  }

  return Math.min(Math.max(value as number, min), max);
}
