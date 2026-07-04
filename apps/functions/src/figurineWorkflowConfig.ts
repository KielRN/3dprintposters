import {
  FieldValue,
  type Firestore,
} from "firebase-admin/firestore";
import { z } from "zod";

export type WorkflowProductType = "poster" | "figurine";

// "generated_options": Vertex generates N proof options from the customer
// photo (legacy flow). "template_face_swap": the style's first enabled
// reference image is a fixed template; Vertex swaps the customer's face into
// it and the single swapped image feeds the 3D provider directly.
export type WorkflowProofMode = "generated_options" | "template_face_swap";

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

export const figurineWorkflowConfigCollection = "adminConfig";
export const figurineWorkflowConfigDocId = "figurineWorkflow";

const maxProofGenerationCount = 4;
const maxWorkflowStyles = 12;
export const maxWorkflowStyleReferenceImages = 4;
export const maxWorkflowStyleReferenceImageBytes = 5 * 1024 * 1024;
const referenceImageStoragePathPattern =
  /^admin\/workflow-style-references\/[a-z0-9_]{1,80}\/[a-zA-Z0-9_-]{8,80}\.(?:jpe?g|png)$/;

const defaultBaseProofPrompt = [
  "Create a clean full-body 2D concept image for a personalized 3D printed figurine.",
  "Use the uploaded photo as the identity and outfit reference. Preserve recognizable facial likeness, broad head shape, glasses or facial hair if present, and the main clothing color impression.",
  "The result should feel like a product-ready figurine proof that can guide a later 3D model generation step.",
].join("\n");

// User-approved product style (2026-07-03, Experiment 011): Creative Lab builds
// its best chibi figures from a decisively stylized 2D proof, so this prompt
// must force a fully stylized illustration rather than a photorealistic render.
export const approvedChibiStyle: WorkflowStyleConfig = {
  id: "chibi_figure",
  label: "Chibi",
  productType: "figurine",
  proofMode: "generated_options",
  prompt:
    "Fully stylized chibi character, never photorealistic: oversized head about one third of the total height, compact rounded body, large expressive eyes, a simplified friendly face that keeps the subject clearly recognizable, chunky simplified hands and shoes, smooth vinyl-toy surfaces, and broad clean color regions. The proof must read as a finished stylized character illustration, not a photo of a person.",
  enabled: true,
  referenceImages: [],
};

const defaultStyles: WorkflowStyleConfig[] = [
  {
    id: "creative_lab_figure",
    label: "Creative Lab Figure",
    productType: "figurine",
    proofMode: "generated_options",
    prompt:
      "Smooth chibi or emoji/avatar vinyl toy character, simplified expressive face, friendly proportions, clean silhouette, and broad color regions.",
    enabled: true,
    referenceImages: [],
  },
  approvedChibiStyle,
  {
    id: "emoji_avatar",
    label: "Emoji Avatar",
    productType: "figurine",
    proofMode: "generated_options",
    prompt:
      "Bright emoji-avatar character with a rounded head, expressive simple face, toy-like body, clean clothing shapes, and a friendly natural standing pose.",
    enabled: true,
    referenceImages: [],
  },
  {
    id: "bobblehead",
    label: "Bobblehead",
    productType: "figurine",
    proofMode: "generated_options",
    prompt:
      "Bobblehead-inspired proof with an oversized expressive head, smaller sturdy body, clear facial likeness, and feet placed flat for later base assembly.",
    enabled: true,
    referenceImages: [],
  },
  {
    id: "cartoon_figure",
    label: "Cartoon Figure",
    productType: "figurine",
    proofMode: "generated_options",
    prompt:
      "Polished cartoon figurine with smooth simplified shapes, readable outfit colors, friendly expression, and a clean manufacturable silhouette.",
    enabled: true,
    referenceImages: [],
  },
];

export const defaultFigurineWorkflowConfig: FigurineWorkflowConfig = {
  proofGenerationCount: 4,
  baseProofPrompt: defaultBaseProofPrompt,
  visibleStyleCount: 2,
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
  proofMode: z.enum(["generated_options", "template_face_swap"]).optional(),
  prompt: z.string().trim().min(1).max(4000),
  enabled: z.boolean().optional(),
  referenceImages: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(80).optional(),
        label: z.string().trim().max(80).optional(),
        storagePath: z.string().trim().min(1).max(500),
        mimeType: z.string().trim().min(1).max(120),
        enabled: z.boolean().optional(),
      }),
    )
    .optional(),
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

// The save path must NOT inherit normalize's lenient defaults-fallback: a
// payload that fails validation would silently overwrite the saved config
// with defaults. Returns a short issue summary, or null when valid.
export function validateFigurineWorkflowConfigInput(
  rawConfig: unknown,
): string | null {
  const parsed = rawWorkflowConfigSchema.safeParse(rawConfig ?? {});
  if (parsed.success) {
    return null;
  }

  return parsed.error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`)
    .join("; ");
}

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
  const normalizedStyles =
    styles.length > 0 ? styles : defaultFigurineWorkflowConfig.styles;
  const { styles: safeStyles, visibleStyleCount } = ensureApprovedChibiStyle(
    normalizedStyles,
    clampInteger(
      source.visibleStyleCount,
      1,
      normalizedStyles.length,
      defaultFigurineWorkflowConfig.visibleStyleCount,
    ),
  );

  return {
    proofGenerationCount: clampInteger(
      source.proofGenerationCount,
      1,
      maxProofGenerationCount,
      defaultFigurineWorkflowConfig.proofGenerationCount,
    ),
    baseProofPrompt:
      source.baseProofPrompt ?? defaultFigurineWorkflowConfig.baseProofPrompt,
    visibleStyleCount,
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

export function enabledWorkflowStyleReferenceImages(
  style: WorkflowStyleConfig,
): WorkflowStyleReferenceImage[] {
  return style.referenceImages
    .filter((image) => image.enabled)
    .slice(0, maxWorkflowStyleReferenceImages);
}

export function publicFigurineWorkflowConfig(
  config: FigurineWorkflowConfig,
): FigurineWorkflowConfig {
  return {
    ...config,
    baseProofPrompt: "Server-managed proof prompt.",
    styles: config.styles.map((style) => ({
      id: style.id,
      label: style.label,
      productType: style.productType,
      proofMode: style.proofMode,
      prompt: "Server-managed style prompt.",
      enabled: style.enabled,
      referenceImages: [],
    })),
  };
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

// Chibi is a user-approved product style (2026-07-03), so saved configs must
// keep offering it: a missing style is reinserted, and an enabled style buried
// outside the visible window is moved into view right after the lead style.
// Admins hide it through the style's `enabled` flag, not by deleting or
// burying it.
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
    ].slice(0, maxWorkflowStyles);
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
    proofMode: rawStyle.proofMode ?? "generated_options",
    prompt,
    enabled: rawStyle.enabled ?? true,
    referenceImages: (rawStyle.referenceImages ?? [])
      .map(normalizeWorkflowStyleReferenceImage)
      .filter((image): image is WorkflowStyleReferenceImage => Boolean(image))
      .slice(0, maxWorkflowStyleReferenceImages),
  };
}

function normalizeWorkflowStyleReferenceImage(
  rawImage: NonNullable<
    z.infer<typeof rawStyleSchema>["referenceImages"]
  >[number],
  index: number,
): WorkflowStyleReferenceImage | null {
  const storagePath = rawImage.storagePath.trim();
  if (!referenceImageStoragePathPattern.test(storagePath)) {
    return null;
  }
  const mimeType = normalizeReferenceImageMimeType(rawImage.mimeType);
  if (!mimeType) {
    return null;
  }

  const id = normalizeReferenceImageId(rawImage.id ?? `reference_${index + 1}`);
  if (!id) {
    return null;
  }

  const label = rawImage.label?.trim() || `Reference ${index + 1}`;

  return {
    id,
    label,
    storagePath,
    mimeType,
    enabled: rawImage.enabled ?? true,
  };
}

function normalizeReferenceImageMimeType(
  value: string,
): WorkflowStyleReferenceImage["mimeType"] | null {
  if (value === "image/jpeg" || value === "image/png") {
    return value;
  }

  return null;
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

function normalizeReferenceImageId(value: string): string {
  return value
    .trim()
    .replaceAll(/\s+/g, "_")
    .replaceAll(/[^a-zA-Z0-9_-]/g, "")
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
