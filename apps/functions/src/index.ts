import { initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  getFirestore,
  Timestamp,
  type DocumentReference,
  type Query,
  type QuerySnapshot,
} from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import archiver from "archiver";
import { access, mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import path from "node:path";
import Stripe from "stripe";
import { z } from "zod";

import { createPosterAiProvider } from "./aiProvider.js";
import {
  figurinePreviewWarnings,
  isFigurineStyle,
} from "./figurineWorkflow.js";
import {
  buildCreativeLabFigurineFromPrototype,
  generateCreativeLabFigurinePreview,
  generateCreativeLabPrototypeConcept,
  MeshyProviderTaskError,
} from "./meshyFigurineProvider.js";
import { runMeshyFigurinePrintTooling } from "./meshyPrintTooling.js";
import { calculateJobCost } from "./jobCost.js";
import {
  buildJobSheet,
  customerFieldsFromSession,
  operatorTabStages,
  operatorTabs,
  sanitizeOperatorJobDetail,
  sanitizeOperatorJobSummary,
  selectBundleFiles,
} from "./operatorConsole.js";
import { canTransition, displayJobId } from "./pipeline.js";
import {
  adminSupportDevelopmentAccessReason,
  adminSupportIssueTypes,
  adminSupportStatuses,
  isAdminSupportAllowed,
  jobMatchesAdminSupportFilters,
  normalizeAdminSupportNoteBody,
  normalizeAdminSupportStatus,
  sanitizeAdminSupportJobDetail,
  sanitizeAdminSupportJobSummary,
  type AdminSupportFilters,
  type AdminSupportJobSummary,
} from "./adminSupport.js";
import {
  enabledWorkflowStyleReferenceImages,
  publicFigurineWorkflowConfig,
  readFigurineWorkflowConfig,
  resolveVisibleWorkflowStyle,
  saveFigurineWorkflowConfig as persistFigurineWorkflowConfig,
  validateFigurineWorkflowConfigInput,
  visibleWorkflowStyles,
} from "./figurineWorkflowConfig.js";

initializeApp();

const db = getFirestore();
const publicAppUrl = defineSecret("PUBLIC_APP_URL");
const appStorageBucket = defineSecret("APP_STORAGE_BUCKET");
const printFileGeneratorUrl = defineSecret("PRINT_FILE_GENERATOR_URL");
const aiProviderRoute = defineSecret("AI_PROVIDER_ROUTE");
const vertexProject = defineSecret("VERTEX_PROJECT");
const vertexLocation = defineSecret("VERTEX_LOCATION");
const vertexGcsBucket = defineSecret("VERTEX_GCS_BUCKET");
const vertexImageModel = defineSecret("VERTEX_IMAGE_MODEL");
const vertexMaxSourceImageBytes = defineSecret("VERTEX_MAX_SOURCE_IMAGE_BYTES");
const vertexApiKey = defineSecret("VERTEX_API_KEY");
const meshyApiKey = defineSecret("MESHY_API_KEY");
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");
const stripePosterPriceId = defineSecret("STRIPE_POSTER_PRICE_ID");
const stripeFigurinePaintedPriceId = defineSecret(
  "STRIPE_FIGURINE_PAINTED_PRICE_ID",
);
const stripeFigurineUnpaintedPriceId = defineSecret(
  "STRIPE_FIGURINE_UNPAINTED_PRICE_ID",
);
const adminSupportAllowlist = defineSecret("ADMIN_SUPPORT_ALLOWLIST");
const operatorAllowlist = defineSecret("OPERATOR_ALLOWLIST");

const figurineUnpaintedFallbackCents = 9900;
const figurinePaintedFallbackCents = 14900;

const vertexRuntimeSecrets = [
  aiProviderRoute,
  appStorageBucket,
  vertexProject,
  vertexLocation,
  vertexGcsBucket,
  vertexImageModel,
  vertexMaxSourceImageBytes,
  vertexApiKey,
];
const printFileRuntimeSecrets = [appStorageBucket, printFileGeneratorUrl];
const jobIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/);

const createJobSchema = z.object({
  jobId: jobIdSchema,
  sourceImagePath: z.string().min(1),
  selectedStyle: z.string().min(1),
  productType: z.enum(["poster", "figurine"]).optional(),
});

const checkoutSchema = z.object({
  jobId: jobIdSchema,
  paintOption: z.enum(["painted", "unpainted"]).optional(),
});

const adminSupportStatusSchema = z.enum(adminSupportStatuses);
const adminSupportIssueTypeSchema = z.enum(adminSupportIssueTypes);

const listAdminSupportJobsSchema = z.object({
  productType: z.enum(["poster", "figurine"]).optional(),
  jobStatus: z.string().trim().min(1).max(80).optional(),
  supportStatus: adminSupportStatusSchema.optional(),
  issueType: adminSupportIssueTypeSchema.optional(),
  search: z.string().trim().max(120).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).default(25),
  cursor: jobIdSchema.optional(),
});

const getAdminSupportJobSchema = z.object({
  jobId: jobIdSchema,
});

const getAdminJobPreviewSchema = z.object({
  jobId: jobIdSchema,
});

const listOperatorJobsSchema = z.object({
  tab: z.enum(operatorTabs),
});
const operatorJobIdSchema = z.object({
  jobId: jobIdSchema,
});

const operatorUpdateFulfillmentSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start_production"), jobId: jobIdSchema }),
  z.object({
    action: z.literal("set_production_substate"),
    jobId: jobIdSchema,
    subState: z.enum(["printing", "painting"]),
  }),
  z.object({
    action: z.literal("reject"),
    jobId: jobIdSchema,
    reason: z.string().min(5).max(2000),
  }),
  z.object({
    action: z.literal("ship"),
    jobId: jobIdSchema,
    carrier: z.string().min(2).max(60),
    trackingNumber: z.string().min(4).max(120),
  }),
]);

const addAdminSupportNoteSchema = z.object({
  jobId: jobIdSchema,
  body: z.string().trim().min(1).max(2000),
  status: adminSupportStatusSchema.optional(),
});

const approveGeneratedImageSchema = z.object({
  jobId: jobIdSchema,
  imagePath: z.string().min(1),
});

const defaultReliefSettings = {
  height_provider: "masked_depth_detail_blend",
  detail_source: "lithophane_baseline",
  detail_weight: 0.38,
  target_width_px: 400,
  geometry_analysis_width_px: 768,
  max_triangle_count: 1_000_000,
  max_binary_stl_bytes: 50_000_000,
} as const;

const defaultPhysicalDimensions = {
  target_width_mm: 139.7,
  target_height_mm: 190.5,
  image_window_width_mm: 127.0,
  image_window_height_mm: 177.8,
  border_mm: 6.35,
} as const;

const printFileGenerationTimeoutSeconds = 540;
const printFileGeneratorFetchTimeoutMs = 480_000;
const meshyModelDataUriByteLimit = 100 * 1024 * 1024;

type CheckoutSessionWebhookObject = {
  metadata?: { orderId?: string; jobId?: string; uid?: string } | null;
  payment_intent?: string | { id?: string } | null;
  customer_details?: { name?: string | null; email?: string | null } | null;
  shipping_details?: {
    name?: string | null;
    address?: Record<string, string | null> | null;
  } | null;
  collected_information?: {
    shipping_details?: {
      name?: string | null;
      address?: Record<string, string | null> | null;
    } | null;
  } | null;
};

type GeneratedImage = {
  storagePath?: string;
};

const printFileArtifactPathsSchema = z.object({
  model_stl: z.string().min(1),
  heightmap_png: z.string().min(1),
  preview_glb: z.string().min(1),
  metadata_json: z.string().min(1),
  full_color_3mf: z.string().min(1),
  full_color_obj: z.string().min(1),
  full_color_obj_mtl: z.string().min(1),
  full_color_texture_png: z.string().min(1),
  full_color_vrml: z.string().min(1),
  full_color_ply: z.string().min(1),
  filament_palette_json: z.string().min(1),
  filament_layer_swaps_txt: z.string().min(1),
  filament_print_settings_json: z.string().min(1),
  filament_preview_png: z.string().min(1),
  debug_artifacts: z.record(z.string(), z.string().min(1)).default({}),
});

const printFileGenerationResponseSchema = z.object({
  job_id: z.string().min(1),
  status: z.string().min(1),
  artifact_paths: printFileArtifactPathsSchema,
  printability: z.object({
    status: z.string().min(1),
    checks: z.array(z.string()),
    warnings: z.array(z.string()).default([]),
  }),
});

const providerAuditEntrySchema = z
  .object({
    succeeded: z.string().min(1),
    attempted: z.array(z.string()).default([]),
    fallback_reason: z.string().min(1).optional(),
    model_version: z.string().min(1).optional(),
  })
  .passthrough();

const segmentationStatusSchema = z
  .object({
    status: z.string().min(1),
    mask_coverage: z.number().optional(),
    foreground_labels: z.array(z.string()).optional(),
    raw_segment_count: z.number().optional(),
  })
  .passthrough();

const printFileMetadataAuditSchema = z
  .object({
    normalized_width_px: z.number().optional(),
    normalized_height_px: z.number().optional(),
    geometry_analysis_width_px: z.number().optional(),
    geometry_analysis_height_px: z.number().optional(),
    height_provider: z.string().min(1).optional(),
    height_provider_policy: z.string().min(1).optional(),
    height_provider_fallback_only: z.boolean().optional(),
    height_provider_target_quality_path: z.boolean().optional(),
    height_provider_checkout_default_allowed: z.boolean().optional(),
    provider_audit: z.record(z.string(), providerAuditEntrySchema).optional(),
    segmentation_status: segmentationStatusSchema.optional(),
    face_analysis_status: z.record(z.string(), z.unknown()).optional(),
    surface_intent_status: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

type PrintFileArtifacts = {
  modelStl: string;
  heightmapPng: string;
  previewGlb: string;
  metadataJson: string;
  fullColor3mf: string;
  fullColorObj: string;
  fullColorObjMtl: string;
  fullColorTexturePng: string;
  fullColorVrml: string;
  fullColorPly: string;
  filamentPaletteJson: string;
  filamentLayerSwapsTxt: string;
  filamentPrintSettingsJson: string;
  filamentPreviewPng: string;
  debugArtifacts: Record<string, string>;
};

type MirroredArtifact = {
  storagePath: string;
  localPath: string;
};

type PrintFileAudit =
  | {
      status: "captured";
      metadataJson: string;
      heightProvider: string | null;
      heightProviderPolicy: string | null;
      heightProviderFallbackOnly: boolean | null;
      heightProviderTargetQualityPath: boolean | null;
      heightProviderCheckoutDefaultAllowed: boolean | null;
      normalizedWidthPx: number | null;
      normalizedHeightPx: number | null;
      geometryAnalysisWidthPx: number | null;
      geometryAnalysisHeightPx: number | null;
      providerAudit: Record<
        string,
        z.infer<typeof providerAuditEntrySchema>
      > | null;
      segmentationStatus: z.infer<typeof segmentationStatusSchema> | null;
      faceAnalysisStatus: Record<string, unknown> | null;
      surfaceIntentStatus: Record<string, unknown> | null;
      capturedAt: FieldValue;
    }
  | {
      status: "unavailable";
      metadataJson: string;
      reason: string;
      capturedAt: FieldValue;
    };

type PrintFileLocalMirror =
  | {
      status: "mirrored";
      root: string;
      artifactCount: number;
      artifacts: MirroredArtifact[];
      completedAt: FieldValue;
    }
  | {
      status: "pending";
      reason: string;
      startedAt: FieldValue;
    }
  | {
      status: "skipped";
      reason: string;
    };

type ExistingFigurinePreviewAsset = {
  previewGlb: string;
  thumbnailPath: string | null;
  metadataPath: string;
  prototypeTaskId: string;
  buildTaskId: string;
  availableFormats: string[];
  consumedCredits: number | null;
};

function buildGenerationError(error: unknown) {
  return {
    message:
      error instanceof Error
        ? error.message
        : "Poster generation did not complete.",
    stage: "ai_generation",
  };
}

function buildPrintFileError(error: unknown) {
  return {
    message:
      error instanceof Error
        ? error.message
        : "3D print file generation did not complete.",
    stage: "print_file_generation",
  };
}

function buildFigurineGenerationError(error: unknown) {
  let message = "Figurine preview generation did not complete.";
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    message =
      cause instanceof Error
        ? `${error.message} (cause: ${cause.message})`
        : error.message;
  }
  if (error instanceof MeshyProviderTaskError) {
    return {
      message,
      stage: "figurine_preview_generation",
      provider: error.provider,
      providerTask: {
        taskId: error.taskId,
        label: error.label,
        status: error.status,
        progress: error.progress,
        consumedCredits: error.consumedCredits,
        taskError: error.taskError,
      },
    };
  }
  return {
    message,
    stage: "figurine_preview_generation",
  };
}

function buildLocalMirrorError(error: unknown): PrintFileLocalMirror {
  const message =
    error instanceof Error ? error.message : "local_mirror_failed";
  return {
    status: "skipped",
    reason: `local_mirror_failed: ${message.slice(0, 240)}`,
  };
}

async function refreshJobCostFromFirestore(
  jobRef: DocumentReference,
  reason: string,
): Promise<void> {
  try {
    const jobSnap = await jobRef.get();
    const jobData = jobSnap.data() as Record<string, unknown> | undefined;
    if (!jobSnap.exists || !jobData || !jobDataIsFigurine(jobData)) {
      return;
    }

    const jobCost = firestoreSafeValue(calculateJobCost(jobData)) as Record<
      string,
      unknown
    >;
    jobCost.updatedAt = FieldValue.serverTimestamp();
    await jobRef.set(
      {
        jobCost,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("job cost refresh failed", {
      jobId: jobRef.id,
      reason,
      error: message,
    });
    await jobRef.set(
      {
        jobCost: {
          status: "partial",
          currency: "USD",
          updatedAt: FieldValue.serverTimestamp(),
          calculationError: {
            reason,
            message: message.slice(0, 300),
          },
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
}

function resolveRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function storagePathToGcsUri(bucketName: string, storagePath: string): string {
  if (storagePath.startsWith("gs://")) {
    return storagePath;
  }

  return `gs://${bucketName}/${storagePath.replace(/^\/+/, "")}`;
}

function gcsUriToStoragePath(bucketName: string, gcsUri: string): string {
  const prefix = `gs://${bucketName}/`;
  return gcsUri.startsWith(prefix) ? gcsUri.slice(prefix.length) : gcsUri;
}

function normalizePrintFileArtifacts(
  bucketName: string,
  artifactPaths: z.infer<typeof printFileArtifactPathsSchema>,
): PrintFileArtifacts {
  return {
    modelStl: gcsUriToStoragePath(bucketName, artifactPaths.model_stl),
    heightmapPng: gcsUriToStoragePath(bucketName, artifactPaths.heightmap_png),
    previewGlb: gcsUriToStoragePath(bucketName, artifactPaths.preview_glb),
    metadataJson: gcsUriToStoragePath(bucketName, artifactPaths.metadata_json),
    fullColor3mf: gcsUriToStoragePath(bucketName, artifactPaths.full_color_3mf),
    fullColorObj: gcsUriToStoragePath(bucketName, artifactPaths.full_color_obj),
    fullColorObjMtl: gcsUriToStoragePath(
      bucketName,
      artifactPaths.full_color_obj_mtl,
    ),
    fullColorTexturePng: gcsUriToStoragePath(
      bucketName,
      artifactPaths.full_color_texture_png,
    ),
    fullColorVrml: gcsUriToStoragePath(
      bucketName,
      artifactPaths.full_color_vrml,
    ),
    fullColorPly: gcsUriToStoragePath(bucketName, artifactPaths.full_color_ply),
    filamentPaletteJson: gcsUriToStoragePath(
      bucketName,
      artifactPaths.filament_palette_json,
    ),
    filamentLayerSwapsTxt: gcsUriToStoragePath(
      bucketName,
      artifactPaths.filament_layer_swaps_txt,
    ),
    filamentPrintSettingsJson: gcsUriToStoragePath(
      bucketName,
      artifactPaths.filament_print_settings_json,
    ),
    filamentPreviewPng: gcsUriToStoragePath(
      bucketName,
      artifactPaths.filament_preview_png,
    ),
    debugArtifacts: Object.fromEntries(
      Object.entries(artifactPaths.debug_artifacts).map(
        ([name, artifactPath]) => [
          name,
          gcsUriToStoragePath(bucketName, artifactPath),
        ],
      ),
    ),
  };
}

function listPrintFileArtifactPaths(artifacts: PrintFileArtifacts): string[] {
  return [
    artifacts.modelStl,
    artifacts.previewGlb,
    artifacts.heightmapPng,
    artifacts.metadataJson,
    artifacts.fullColor3mf,
    artifacts.fullColorObj,
    artifacts.fullColorObjMtl,
    artifacts.fullColorTexturePng,
    artifacts.fullColorVrml,
    artifacts.fullColorPly,
    artifacts.filamentPaletteJson,
    artifacts.filamentLayerSwapsTxt,
    artifacts.filamentPrintSettingsJson,
    artifacts.filamentPreviewPng,
    ...Object.values(artifacts.debugArtifacts),
  ];
}

function listFigurinePreviewArtifactPaths(input: {
  previewGlb: string;
  metadataPath: string;
  thumbnailPath: string | null;
}): string[] {
  return [input.previewGlb, input.metadataPath, input.thumbnailPath].filter(
    (artifactPath): artifactPath is string => Boolean(artifactPath),
  );
}

function localMirrorIsEnabled(): boolean {
  return (
    process.env.FUNCTIONS_EMULATOR === "true" ||
    Boolean(process.env.PRINT_FILE_LOCAL_MIRROR_DIR?.trim())
  );
}

function initialPrintFileLocalMirror(): PrintFileLocalMirror {
  if (!localMirrorIsEnabled()) {
    return {
      status: "skipped",
      reason: "local_mirror_disabled",
    };
  }

  return {
    status: "pending",
    reason: "local_mirror_in_progress",
    startedAt: FieldValue.serverTimestamp(),
  };
}

function safeStoragePathSegments(storagePath: string): string[] {
  const segments = storagePath
    .split(/[\\/]/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (
    segments.length === 0 ||
    path.isAbsolute(storagePath) ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error(`Unsafe artifact storage path: ${storagePath}`);
  }

  return segments;
}

async function findWorkspaceRoot(): Promise<string> {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "..", ".."),
    path.resolve(process.cwd(), "..", "..", ".."),
  ];

  for (const candidate of candidates) {
    try {
      await Promise.all([
        access(path.join(candidate, "AGENTS.md")),
        access(path.join(candidate, "apps", "functions", "src", "index.ts")),
      ]);
      return candidate;
    } catch {
      // Keep walking up from the emulator working directory.
    }
  }

  return process.cwd();
}

async function resolveLocalMirrorRoot(): Promise<{
  absoluteRoot: string;
  displayRoot: string;
}> {
  const configuredRoot = process.env.PRINT_FILE_LOCAL_MIRROR_DIR?.trim();
  if (configuredRoot) {
    return {
      absoluteRoot: path.isAbsolute(configuredRoot)
        ? configuredRoot
        : path.resolve(process.cwd(), configuredRoot),
      displayRoot: configuredRoot,
    };
  }

  return {
    absoluteRoot: path.join(await findWorkspaceRoot(), ".tmp"),
    displayRoot: ".tmp",
  };
}

async function mirrorStoragePathsToLocalTmp(input: {
  bucketName: string;
  storagePaths: string[];
}): Promise<PrintFileLocalMirror> {
  if (!localMirrorIsEnabled()) {
    return {
      status: "skipped",
      reason: "local_mirror_disabled",
    };
  }

  const mirrorRoot = await resolveLocalMirrorRoot();
  const bucket = getStorage().bucket(input.bucketName);
  const mirroredArtifacts: MirroredArtifact[] = [];

  for (const storagePath of input.storagePaths) {
    const safeSegments = safeStoragePathSegments(storagePath);
    const [artifactBytes] = await bucket.file(storagePath).download();
    const localPath = path.join(mirrorRoot.absoluteRoot, ...safeSegments);
    await mkdir(path.dirname(localPath), { recursive: true });
    await writeFile(localPath, artifactBytes);
    mirroredArtifacts.push({
      storagePath,
      localPath: path.posix.join(
        mirrorRoot.displayRoot.replaceAll("\\", "/"),
        ...safeSegments,
      ),
    });
  }

  return {
    status: "mirrored",
    root: mirrorRoot.displayRoot,
    artifactCount: mirroredArtifacts.length,
    artifacts: mirroredArtifacts,
    completedAt: FieldValue.serverTimestamp(),
  };
}

async function mirrorPrintFileArtifactsToLocalTmp(input: {
  bucketName: string;
  artifacts: PrintFileArtifacts;
}): Promise<PrintFileLocalMirror> {
  return mirrorStoragePathsToLocalTmp({
    bucketName: input.bucketName,
    storagePaths: listPrintFileArtifactPaths(input.artifacts),
  });
}

async function mirrorFigurinePreviewToLocalTmp(input: {
  bucketName: string;
  generation: {
    previewGlb: string;
    metadataPath: string;
    thumbnailPath: string | null;
  };
}): Promise<PrintFileLocalMirror> {
  return mirrorStoragePathsToLocalTmp({
    bucketName: input.bucketName,
    storagePaths: listFigurinePreviewArtifactPaths(input.generation),
  });
}

async function readPrintFileAudit(input: {
  bucketName: string;
  metadataJsonPath: string;
}): Promise<PrintFileAudit> {
  try {
    const [metadataBytes] = await getStorage()
      .bucket(input.bucketName)
      .file(input.metadataJsonPath)
      .download();
    const metadata = JSON.parse(metadataBytes.toString("utf8")) as unknown;
    const parsed = printFileMetadataAuditSchema.safeParse(metadata);
    if (!parsed.success) {
      return {
        status: "unavailable",
        metadataJson: input.metadataJsonPath,
        reason: "metadata_schema_mismatch",
        capturedAt: FieldValue.serverTimestamp(),
      };
    }

    return {
      status: "captured",
      metadataJson: input.metadataJsonPath,
      heightProvider: parsed.data.height_provider ?? null,
      heightProviderPolicy: parsed.data.height_provider_policy ?? null,
      heightProviderFallbackOnly:
        parsed.data.height_provider_fallback_only ?? null,
      heightProviderTargetQualityPath:
        parsed.data.height_provider_target_quality_path ?? null,
      heightProviderCheckoutDefaultAllowed:
        parsed.data.height_provider_checkout_default_allowed ?? null,
      normalizedWidthPx: parsed.data.normalized_width_px ?? null,
      normalizedHeightPx: parsed.data.normalized_height_px ?? null,
      geometryAnalysisWidthPx: parsed.data.geometry_analysis_width_px ?? null,
      geometryAnalysisHeightPx: parsed.data.geometry_analysis_height_px ?? null,
      providerAudit: parsed.data.provider_audit ?? null,
      segmentationStatus: parsed.data.segmentation_status ?? null,
      faceAnalysisStatus: parsed.data.face_analysis_status ?? null,
      surfaceIntentStatus: parsed.data.surface_intent_status ?? null,
      capturedAt: FieldValue.serverTimestamp(),
    };
  } catch (error) {
    return {
      status: "unavailable",
      metadataJson: input.metadataJsonPath,
      reason:
        error instanceof Error
          ? error.message.slice(0, 300)
          : "metadata_read_failed",
      capturedAt: FieldValue.serverTimestamp(),
    };
  }
}

async function generatePrintFilesForApprovedJob(input: {
  jobRef: DocumentReference;
  jobId: string;
  uid: string;
  selectedImagePath: string;
  selectedStyle: string;
}): Promise<PrintFileArtifacts> {
  const startedAt = Date.now();
  const serviceUrl = resolveRequiredEnv("PRINT_FILE_GENERATOR_URL").replace(
    /\/$/,
    "",
  );
  const bucketName = resolveRequiredEnv("APP_STORAGE_BUCKET");
  const outputPrefix = `print-files/${input.uid}/${input.jobId}`;

  console.info("print-file generation request started", {
    jobId: input.jobId,
    outputPrefix,
  });

  const response = await fetch(`${serviceUrl}/v1/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(printFileGeneratorFetchTimeoutMs),
    body: JSON.stringify({
      job_id: input.jobId,
      uid: input.uid,
      selected_image_path: storagePathToGcsUri(
        bucketName,
        input.selectedImagePath,
      ),
      output_prefix: storagePathToGcsUri(bucketName, outputPrefix),
      dimensions: defaultPhysicalDimensions,
      relief: defaultReliefSettings,
      style_metadata: {
        selectedStyle: input.selectedStyle,
      },
    }),
  });

  console.info("print-file generator responded", {
    jobId: input.jobId,
    status: response.status,
    elapsedMs: Date.now() - startedAt,
  });

  if (!response.ok) {
    throw new Error(
      `Print file generator failed with HTTP ${response.status}: ${(await response.text()).slice(0, 1000)}`,
    );
  }

  const parsed = printFileGenerationResponseSchema.safeParse(
    await response.json(),
  );
  if (!parsed.success) {
    throw new Error("Print file generator returned an invalid response.");
  }

  const artifacts = normalizePrintFileArtifacts(
    bucketName,
    parsed.data.artifact_paths,
  );
  const printFileAudit = await readPrintFileAudit({
    bucketName,
    metadataJsonPath: artifacts.metadataJson,
  });

  await input.jobRef.set(
    {
      printFileStatus: "generated",
      printFileOutputPrefix: outputPrefix,
      printFileArtifacts: artifacts,
      printability: parsed.data.printability,
      printFileAudit,
      printFileGeneration: {
        provider: "print-file-generator",
        status: parsed.data.status,
        completedAt: FieldValue.serverTimestamp(),
      },
      printFileLocalMirror: initialPrintFileLocalMirror(),
      printFileError: null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await input.jobRef
    .collection("audit")
    .doc("printFileGeneration")
    .set(printFileAudit, { merge: true });

  console.info("print-file job marked generated", {
    jobId: input.jobId,
    elapsedMs: Date.now() - startedAt,
  });

  try {
    const printFileLocalMirror = await mirrorPrintFileArtifactsToLocalTmp({
      bucketName,
      artifacts,
    });
    await input.jobRef.set(
      {
        printFileLocalMirror,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    console.info("print-file local mirror completed", {
      jobId: input.jobId,
      status: printFileLocalMirror.status,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    await input.jobRef.set(
      {
        printFileLocalMirror: buildLocalMirrorError(error),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    console.warn("print-file local mirror failed", {
      jobId: input.jobId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return artifacts;
}

async function tryReadExistingFigurinePreviewAsset(input: {
  bucketName: string;
  outputPrefix: string;
}): Promise<ExistingFigurinePreviewAsset | null> {
  const bucket = getStorage().bucket(input.bucketName);
  const previewGlb = `${input.outputPrefix}/model.glb`;
  const metadataPath = `${input.outputPrefix}/metadata.json`;
  const [glbExists] = await bucket.file(previewGlb).exists();
  const [metadataExists] = await bucket.file(metadataPath).exists();

  if (!glbExists || !metadataExists) {
    return null;
  }

  try {
    const [metadataBytes] = await bucket.file(metadataPath).download();
    const metadata = JSON.parse(metadataBytes.toString("utf8")) as {
      thumbnailPath?: unknown;
      prototypeTask?: { id?: unknown; consumed_credits?: unknown };
      buildTask?: { id?: unknown; consumed_credits?: unknown };
      availableFormats?: unknown;
    };
    const availableFormats = Array.isArray(metadata.availableFormats)
      ? metadata.availableFormats.filter(
          (format): format is string => typeof format === "string",
        )
      : ["glb"];
    const prototypeCredits =
      typeof metadata.prototypeTask?.consumed_credits === "number"
        ? metadata.prototypeTask.consumed_credits
        : 0;
    const buildCredits =
      typeof metadata.buildTask?.consumed_credits === "number"
        ? metadata.buildTask.consumed_credits
        : 0;

    return {
      previewGlb,
      thumbnailPath:
        typeof metadata.thumbnailPath === "string"
          ? metadata.thumbnailPath
          : null,
      metadataPath,
      prototypeTaskId:
        typeof metadata.prototypeTask?.id === "string"
          ? metadata.prototypeTask.id
          : "recovered-existing-prototype",
      buildTaskId:
        typeof metadata.buildTask?.id === "string"
          ? metadata.buildTask.id
          : "recovered-existing-build",
      availableFormats,
      consumedCredits:
        prototypeCredits || buildCredits
          ? prototypeCredits + buildCredits
          : null,
    };
  } catch (error) {
    console.warn("existing figurine preview metadata could not be read", {
      outputPrefix: input.outputPrefix,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      previewGlb,
      thumbnailPath: null,
      metadataPath,
      prototypeTaskId: "recovered-existing-prototype",
      buildTaskId: "recovered-existing-build",
      availableFormats: ["glb"],
      consumedCredits: null,
    };
  }
}

function resolveMeshyApiKeyForFigurine(): string {
  if (process.env.MESHY_FIGURINE_PROVIDER_MODE === "fixture") {
    return process.env.MESHY_API_KEY ?? "fixture";
  }

  const value = meshyApiKey.value()?.trim();
  if (!value) {
    throw new Error(
      "MESHY_API_KEY is required for figurine preview generation.",
    );
  }

  return value;
}

async function generateFigurinePreviewForApprovedJob(input: {
  jobRef: DocumentReference;
  jobId: string;
  uid: string;
  selectedImagePath: string;
  prototypeTaskId?: string;
}): Promise<Awaited<ReturnType<typeof generateCreativeLabFigurinePreview>>> {
  const startedAt = Date.now();
  const modelId = "creative-lab-original";
  const outputPrefix = `print-files/${input.uid}/${input.jobId}/figurine/${modelId}`;
  const bucketName = resolveRequiredEnv("APP_STORAGE_BUCKET");

  console.info("figurine preview generation request started", {
    jobId: input.jobId,
    outputPrefix,
  });

  await input.jobRef.set(
    {
      productType: "figurine",
      figurinePreview: {
        status: "generating",
        previewGlb: null,
        printReadiness: "needs_review",
        warnings: figurinePreviewWarnings,
      },
      figurineGeneration: {
        provider: "meshy",
        workflow: "creative_lab_figure",
        modelId,
        outputPrefix,
        status: "generating",
        startedAt: FieldValue.serverTimestamp(),
      },
      printFileStatus: "not_applicable",
      printFileArtifacts: null,
      printability: null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const existingAsset = await tryReadExistingFigurinePreviewAsset({
    bucketName,
    outputPrefix,
  });
  const generation = existingAsset
    ? {
        provider: "meshy" as const,
        workflow: "creative_lab_figure" as const,
        modelId,
        previewGlb: existingAsset.previewGlb,
        thumbnailPath: existingAsset.thumbnailPath,
        metadataPath: existingAsset.metadataPath,
        prototypeTaskId: existingAsset.prototypeTaskId,
        buildTaskId: existingAsset.buildTaskId,
        availableFormats: existingAsset.availableFormats,
        consumedCredits: existingAsset.consumedCredits,
        status: "preview_ready" as const,
      }
    : input.prototypeTaskId
      ? await buildCreativeLabFigurineFromPrototype({
          jobId: input.jobId,
          uid: input.uid,
          sourceImagePath: input.selectedImagePath,
          outputPrefix,
          modelId,
          apiKey: resolveMeshyApiKeyForFigurine(),
          prototypeTaskId: input.prototypeTaskId,
        })
      : await generateCreativeLabFigurinePreview({
          jobId: input.jobId,
          uid: input.uid,
          sourceImagePath: input.selectedImagePath,
          outputPrefix,
          modelId,
          apiKey: resolveMeshyApiKeyForFigurine(),
        });

  await input.jobRef.set(
    {
      status: "approved",
      productType: "figurine",
      postureMode: "natural",
      conceptSource: "approved_2d_proof",
      generated3dProvider: generation.provider,
      generated3dWorkflow: generation.workflow,
      canonicalUpstreamAsset: "model.glb",
      selectedModelId: generation.modelId,
      readinessStatus: "preview_ready",
      checkoutEligibility: {
        eligible: false,
        reason:
          "Figurine checkout is locked until printability and slicer review are complete.",
      },
      models: [
        {
          modelId: generation.modelId,
          provider: generation.provider,
          providerTaskId: generation.buildTaskId,
          prototypeTaskId: generation.prototypeTaskId,
          status: "preview_ready",
          requestedFormats: ["glb"],
          availableFormats: generation.availableFormats,
          storagePaths: {
            previewGlb: generation.previewGlb,
            thumbnail: generation.thumbnailPath,
            metadataJson: generation.metadataPath,
          },
          warnings: figurinePreviewWarnings,
          consumedCredits: generation.consumedCredits,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      figurinePreview: {
        status: "preview_ready",
        previewGlb: generation.previewGlb,
        printReadiness: "needs_review",
        warnings: figurinePreviewWarnings,
        provider: generation.provider,
        workflow: generation.workflow,
        modelId: generation.modelId,
        metadataJson: generation.metadataPath,
        thumbnail: generation.thumbnailPath,
        updatedAt: FieldValue.serverTimestamp(),
      },
      figurineGeneration: {
        provider: generation.provider,
        workflow: generation.workflow,
        modelId: generation.modelId,
        status: existingAsset
          ? "recovered_existing_preview"
          : generation.status,
        outputPrefix,
        prototypeTaskId: generation.prototypeTaskId,
        buildTaskId: generation.buildTaskId,
        availableFormats: generation.availableFormats,
        consumedCredits: generation.consumedCredits,
        completedAt: FieldValue.serverTimestamp(),
      },
      printFileStatus: "not_applicable",
      printFileArtifacts: null,
      printability: {
        status: "needs_review",
        checks: ["Creative Lab original textured GLB stored for preview only."],
        warnings: figurinePreviewWarnings,
      },
      printFileError: null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await refreshJobCostFromFirestore(
    input.jobRef,
    "figurine_preview_completed",
  );

  try {
    const figurinePreviewLocalMirror = await mirrorFigurinePreviewToLocalTmp({
      bucketName,
      generation,
    });
    await input.jobRef.set(
      {
        figurinePreviewLocalMirror,
        figurineGeneration: {
          localMirror: figurinePreviewLocalMirror,
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    console.info("figurine preview local mirror completed", {
      jobId: input.jobId,
      status: figurinePreviewLocalMirror.status,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    const figurinePreviewLocalMirror = buildLocalMirrorError(error);
    await input.jobRef.set(
      {
        figurinePreviewLocalMirror,
        figurineGeneration: {
          localMirror: figurinePreviewLocalMirror,
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    console.warn("figurine preview local mirror failed", {
      jobId: input.jobId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  console.info("figurine preview generation marked preview_ready", {
    jobId: input.jobId,
    elapsedMs: Date.now() - startedAt,
  });

  return generation;
}

export const getFigurineWorkflowConfig = onCall(async () => {
  const config = await readFigurineWorkflowConfig(db);
  const publicConfig = publicFigurineWorkflowConfig(config);

  return {
    config: publicConfig,
    visibleStyles: visibleWorkflowStyles(publicConfig),
    roleGate: {
      active: false,
      ...config.roleGate,
    },
  };
});

export const getAdminFigurineWorkflowConfig = onCall(
  {
    secrets: [adminSupportAllowlist],
  },
  async (request) => {
    requireAdminSupport(request);
    const config = await readFigurineWorkflowConfig(db);

    return {
      config,
      visibleStyles: visibleWorkflowStyles(config),
      roleGate: {
        active: true,
        ...config.roleGate,
      },
    };
  },
);

export const saveFigurineWorkflowConfig = onCall(
  {
    secrets: [adminSupportAllowlist],
  },
  async (request) => {
    const admin = requireAdminSupport(request);
    const requestedConfig =
      request.data &&
      typeof request.data === "object" &&
      "config" in request.data
        ? (request.data as { config?: unknown }).config
        : request.data;

    const validationError =
      validateFigurineWorkflowConfigInput(requestedConfig);
    if (validationError) {
      throw new HttpsError(
        "invalid-argument",
        `Workflow config was not saved because the payload is invalid: ${validationError}`,
      );
    }

    const config = await persistFigurineWorkflowConfig({
      db,
      config: requestedConfig,
      uid: admin.uid,
    });

    return {
      config,
      visibleStyles: visibleWorkflowStyles(config),
      roleGate: {
        active: true,
        ...config.roleGate,
      },
    };
  },
);

export const createGenerationJob = onCall(
  {
    secrets: [...vertexRuntimeSecrets, meshyApiKey],
    timeoutSeconds: printFileGenerationTimeoutSeconds,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in before creating a poster.",
      );
    }

    const parsed = createJobSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError(
        "invalid-argument",
        "jobId, sourceImagePath, and selectedStyle are required.",
      );
    }

    const expectedUploadPrefix = `uploads/${request.auth.uid}/${parsed.data.jobId}/`;
    const allowedImagePath = /\.(jpe?g|png)$/i.test(
      parsed.data.sourceImagePath,
    );
    if (
      !parsed.data.sourceImagePath.startsWith(expectedUploadPrefix) ||
      !allowedImagePath
    ) {
      throw new HttpsError(
        "permission-denied",
        "Source image must be an uploaded JPG or PNG under the signed-in user path.",
      );
    }

    const workflowConfig = await readFigurineWorkflowConfig(db);
    const workflowStyle = resolveVisibleWorkflowStyle(
      workflowConfig,
      parsed.data.selectedStyle,
    );

    if (!workflowStyle) {
      throw new HttpsError(
        "invalid-argument",
        "Selected style is not available in the current workflow configuration.",
      );
    }

    const productType =
      parsed.data.productType === "figurine" ||
      workflowStyle.productType === "figurine" ||
      isFigurineStyle(workflowStyle.id)
        ? "figurine"
        : "poster";
    const styleReferenceImages =
      enabledWorkflowStyleReferenceImages(workflowStyle);
    const jobRef = db.collection("jobs").doc(parsed.data.jobId);
    const existingJob = await jobRef.get();
    if (existingJob.exists) {
      const existingJobData = existingJob.data();
      const isSameUpload =
        existingJobData?.uid === request.auth.uid &&
        existingJobData.sourceImagePath === parsed.data.sourceImagePath &&
        existingJobData.selectedStyle === workflowStyle.id &&
        (existingJobData.productType ?? "poster") === productType;

      if (isSameUpload) {
        return {
          jobId: jobRef.id,
          status:
            typeof existingJobData.status === "string"
              ? existingJobData.status
              : "unknown",
          idempotent: true,
        };
      }

      throw new HttpsError("already-exists", "A different job uses this id.");
    }

    await jobRef.set({
      uid: request.auth.uid,
      productType,
      status: "generating",
      sourceImagePath: parsed.data.sourceImagePath,
      selectedStyle: workflowStyle.id,
      selectedStyleLabel: workflowStyle.label,
      workflowConfig: {
        configPath: "adminConfig/figurineWorkflow",
        proofGenerationCount: workflowConfig.proofGenerationCount,
        visibleStyleCount: workflowConfig.visibleStyleCount,
        roleGateEnabled: workflowConfig.roleGate.enabled,
        styleReferenceImageCount: styleReferenceImages.length,
        styleReferenceImageIds: styleReferenceImages.map((image) => image.id),
      },
      ...(productType === "figurine"
        ? {
            figurineStyle: workflowStyle.id,
            postureMode: "natural",
            conceptSource: "generated_2d_proof",
            generated3dProvider: "meshy",
            generated3dWorkflow: "creative_lab_figure",
            readinessStatus: "concept_generating",
            checkoutEligibility: {
              eligible: false,
              reason: "Figurine preview is not generated yet.",
            },
            figurinePreview: {
              status: "not_started",
              previewGlb: null,
              printReadiness: "needs_review",
              warnings: figurinePreviewWarnings,
            },
          }
        : {}),
      generatedImages: [],
      approvedImagePath: null,
      printFileStatus: "not_started",
      printFileArtifacts: null,
      printFileOutputPrefix: null,
      aiGeneration: {
        provider: null,
        status: "queued",
        startedAt: FieldValue.serverTimestamp(),
      },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    try {
      const aiProvider = createPosterAiProvider();
      const generation = await aiProvider.generatePosterConcept({
        jobId: jobRef.id,
        uid: request.auth.uid,
        sourceImagePath: parsed.data.sourceImagePath,
        selectedStyle: workflowStyle.id,
        selectedStyleLabel: workflowStyle.label,
        productType,
        proofGenerationCount: workflowConfig.proofGenerationCount,
        baseProofPrompt: workflowConfig.baseProofPrompt,
        stylePrompt: workflowStyle.prompt,
        proofMode: workflowStyle.proofMode,
        referenceImages: styleReferenceImages,
      });
      const proofStoragePaths =
        generation.status === "stubbed"
          ? Array.from(
              {
                length:
                  generation.generatedImagePaths.length ||
                  workflowConfig.proofGenerationCount,
              },
              () => parsed.data.sourceImagePath,
            )
          : generation.generatedImagePaths;

      if (proofStoragePaths.length === 0) {
        throw new Error("AI provider returned no generated proof image path.");
      }

      // Template-face-swap styles skip the multi-proof review: the swapped
      // image goes straight to a Meshy prototype, and the customer reviews
      // Meshy's own figure concept before the build-phase credits are spent.
      if (
        productType === "figurine" &&
        workflowStyle.proofMode === "template_face_swap" &&
        generation.status !== "stubbed"
      ) {
        const faceSwapImagePath = proofStoragePaths[0];
        const concept = await generateCreativeLabPrototypeConcept({
          jobId: jobRef.id,
          uid: request.auth.uid,
          sourceImagePath: faceSwapImagePath,
          conceptOutputPrefix: `generated/${request.auth.uid}/${jobRef.id}`,
          modelId: "creative-lab-original",
          apiKey: resolveMeshyApiKeyForFigurine(),
        });

        await jobRef.set(
          {
            status: "preview_ready",
            generatedImages: concept.conceptImagePaths.map(
              (conceptImagePath, index) => ({
                id: `meshy-concept-${index + 1}`,
                label: `${workflowStyle.label} figure concept`,
                storagePath: conceptImagePath,
                status: "ready",
                isPlaceholder: false,
              }),
            ),
            conceptSource: "meshy_prototype_concept",
            figurineConcept: {
              provider: concept.provider,
              workflow: concept.workflow,
              prototypeTaskId: concept.prototypeTaskId,
              conceptImagePaths: concept.conceptImagePaths,
              faceSwapImagePath,
              consumedCredits: concept.consumedCredits,
              status: concept.status,
              createdAt: FieldValue.serverTimestamp(),
            },
            aiGeneration: {
              provider: generation.provider,
              status: generation.status,
              generatedImagePaths: generation.generatedImagePaths,
              metadata: generation.metadata,
              completedAt: FieldValue.serverTimestamp(),
            },
            readinessStatus: "concept_ready",
            checkoutEligibility: {
              eligible: false,
              reason:
                "Generate the 3D figurine from the approved concept before checkout can be considered.",
            },
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        await refreshJobCostFromFirestore(jobRef, "proof_generation_completed");

        return {
          jobId: jobRef.id,
          status: "preview_ready",
        };
      }

      await jobRef.set(
        {
          status: "preview_ready",
          generatedImages: proofStoragePaths.map((proofStoragePath, index) => ({
            id: `preview-${index + 1}`,
            label:
              generation.status === "stubbed"
                ? `Source photo proof ${index + 1}`
                : productType === "figurine"
                  ? `Figurine proof ${index + 1}`
                  : `Poster proof ${index + 1}`,
            storagePath: proofStoragePath,
            status: "ready",
            isPlaceholder: generation.status === "stubbed",
          })),
          aiGeneration: {
            provider: generation.provider,
            status: generation.status,
            generatedImagePaths: generation.generatedImagePaths,
            metadata: generation.metadata,
            completedAt: FieldValue.serverTimestamp(),
          },
          ...(productType === "figurine"
            ? {
                readinessStatus: "concept_ready",
                checkoutEligibility: {
                  eligible: false,
                  reason:
                    "Approve the 2D proof before generating the figurine preview.",
                },
              }
            : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await refreshJobCostFromFirestore(jobRef, "proof_generation_completed");

      return {
        jobId: jobRef.id,
        status: "preview_ready",
      };
    } catch (error) {
      await jobRef.set(
        {
          status: "failed",
          error: buildGenerationError(error),
          aiGeneration: {
            status: "failed",
            failedAt: FieldValue.serverTimestamp(),
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await refreshJobCostFromFirestore(jobRef, "proof_generation_failed");

      throw new HttpsError(
        "internal",
        "Poster generation failed before a proof was ready.",
      );
    }
  },
);

export const approveGeneratedImage = onCall(
  {
    secrets: [appStorageBucket, printFileGeneratorUrl, meshyApiKey],
    timeoutSeconds: printFileGenerationTimeoutSeconds,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in before approving a proof.",
      );
    }

    const parsed = approveGeneratedImageSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError(
        "invalid-argument",
        "jobId and imagePath are required.",
      );
    }

    const jobRef = db.collection("jobs").doc(parsed.data.jobId);
    const jobSnap = await jobRef.get();
    const jobData = jobSnap.data();

    if (!jobSnap.exists || jobData?.uid !== request.auth.uid) {
      throw new HttpsError("not-found", "Job not found.");
    }

    const generatedImages = Array.isArray(jobData.generatedImages)
      ? (jobData.generatedImages as GeneratedImage[])
      : [];
    const canApproveImage = generatedImages.some(
      (image) => image.storagePath === parsed.data.imagePath,
    );

    if (!canApproveImage) {
      throw new HttpsError(
        "permission-denied",
        "The approved proof must belong to this job.",
      );
    }

    const isFigurineJob =
      jobData.productType === "figurine" ||
      (typeof jobData.selectedStyle === "string" &&
        isFigurineStyle(jobData.selectedStyle));
    const existingFigurinePreview = jobData.figurinePreview as
      | {
          status?: string;
          previewGlb?: string;
          metadataJson?: string;
          thumbnail?: string | null;
        }
      | undefined;
    if (
      isFigurineJob &&
      jobData.approvedImagePath === parsed.data.imagePath &&
      existingFigurinePreview?.status === "preview_ready" &&
      existingFigurinePreview.previewGlb
    ) {
      try {
        const existingMirror = await mirrorFigurinePreviewToLocalTmp({
          bucketName: resolveRequiredEnv("APP_STORAGE_BUCKET"),
          generation: {
            previewGlb: existingFigurinePreview.previewGlb,
            metadataPath:
              existingFigurinePreview.metadataJson ??
              existingFigurinePreview.previewGlb.replace(
                /\/model\.glb$/,
                "/metadata.json",
              ),
            thumbnailPath: existingFigurinePreview.thumbnail ?? null,
          },
        });
        await jobRef.set(
          {
            figurinePreviewLocalMirror: existingMirror,
            figurineGeneration: {
              localMirror: existingMirror,
            },
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      } catch (error) {
        const existingMirror = buildLocalMirrorError(error);
        await jobRef.set(
          {
            figurinePreviewLocalMirror: existingMirror,
            figurineGeneration: {
              localMirror: existingMirror,
            },
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
      await refreshJobCostFromFirestore(
        jobRef,
        "figurine_preview_existing",
      );

      return {
        jobId: jobRef.id,
        status: "approved",
        approvedImagePath: parsed.data.imagePath,
        productType: "figurine",
        figurinePreview: existingFigurinePreview,
      };
    }

    await jobRef.set(
      {
        status: "approved",
        productType: isFigurineJob
          ? "figurine"
          : (jobData.productType ?? "poster"),
        approvedImagePath: parsed.data.imagePath,
        approvedAt: FieldValue.serverTimestamp(),
        printFileStatus: isFigurineJob ? "not_applicable" : "generating",
        printFileOutputPrefix: isFigurineJob
          ? null
          : `print-files/${request.auth.uid}/${parsed.data.jobId}`,
        printFileError: null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    if (isFigurineJob) {
      try {
        const figurineConcept = jobData.figurineConcept as
          | { prototypeTaskId?: unknown }
          | undefined;
        const storedPrototypeTaskId =
          typeof figurineConcept?.prototypeTaskId === "string" &&
          figurineConcept.prototypeTaskId
            ? figurineConcept.prototypeTaskId
            : undefined;
        const figurinePreview = await generateFigurinePreviewForApprovedJob({
          jobRef,
          jobId: jobRef.id,
          uid: request.auth.uid,
          selectedImagePath: parsed.data.imagePath,
          prototypeTaskId: storedPrototypeTaskId,
        });

        return {
          jobId: jobRef.id,
          status: "approved",
          approvedImagePath: parsed.data.imagePath,
          productType: "figurine",
          figurinePreview,
        };
      } catch (error) {
        const generationError = buildFigurineGenerationError(error);
        console.error("figurine preview generation failed", {
          jobId: jobRef.id,
          error: generationError.message,
          providerTask: "providerTask" in generationError
            ? generationError.providerTask
            : undefined,
          stack: error instanceof Error ? error.stack : undefined,
        });
        await jobRef.set(
          {
            figurinePreview: {
              status: "failed",
              previewGlb: null,
              printReadiness: "needs_review",
              warnings: figurinePreviewWarnings,
            },
            figurineGeneration: {
              provider: "meshy",
              workflow: "creative_lab_figure",
              status: "failed",
              failedAt: FieldValue.serverTimestamp(),
            },
            error: generationError,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        await refreshJobCostFromFirestore(
          jobRef,
          "figurine_preview_failed",
        );

        throw new HttpsError(
          "failed-precondition",
          "Proof approved, but figurine preview generation failed. Check the Functions emulator logs before retrying.",
        );
      }
    }

    let printFileArtifacts: PrintFileArtifacts;
    try {
      printFileArtifacts = await generatePrintFilesForApprovedJob({
        jobRef,
        jobId: jobRef.id,
        uid: request.auth.uid,
        selectedImagePath: parsed.data.imagePath,
        selectedStyle:
          typeof jobData.selectedStyle === "string"
            ? jobData.selectedStyle
            : "",
      });
    } catch (error) {
      await jobRef.set(
        {
          printFileStatus: "failed",
          printFileError: buildPrintFileError(error),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      throw new HttpsError(
        "failed-precondition",
        "Proof approved, but 3D preview generation failed. Check the Functions emulator and print-file generator logs.",
      );
    }

    return {
      jobId: jobRef.id,
      status: "approved",
      approvedImagePath: parsed.data.imagePath,
      printFileStatus: "generated",
      printFileArtifacts,
    };
  },
);

export const createCheckoutSession = onCall(
  {
    secrets: [
      publicAppUrl,
      stripePosterPriceId,
      stripeFigurinePaintedPriceId,
      stripeFigurineUnpaintedPriceId,
      stripeSecretKey,
    ],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in before checkout.");
    }

    const parsed = checkoutSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", "jobId is required.");
    }

    const jobSnap = await db.collection("jobs").doc(parsed.data.jobId).get();
    const jobData = jobSnap.data();
    if (!jobSnap.exists || jobData?.uid !== request.auth.uid) {
      throw new HttpsError("not-found", "Job not found.");
    }

    const isFigurine = jobData.productType === "figurine";
    const paintOption = isFigurine
      ? (parsed.data.paintOption ?? "unpainted")
      : null;
    if (isFigurine) {
      const eligibility = jobData.checkoutEligibility as
        | { eligible?: unknown; reason?: unknown }
        | undefined;
      if (eligibility?.eligible !== true) {
        throw new HttpsError(
          "failed-precondition",
          typeof eligibility?.reason === "string"
            ? eligibility.reason
            : "Figurine checkout is locked until print readiness review is complete.",
        );
      }
    }

    if (jobData.status !== "approved" || !jobData.approvedImagePath) {
      throw new HttpsError(
        "failed-precondition",
        "Approve a generated proof before checkout.",
      );
    }

    const printFileArtifacts = jobData.printFileArtifacts as
      | Partial<PrintFileArtifacts>
      | undefined;
    if (
      !isFigurine &&
      (jobData.printFileStatus !== "generated" ||
        typeof printFileArtifacts?.modelStl !== "string" ||
        typeof printFileArtifacts.previewGlb !== "string")
    ) {
      throw new HttpsError(
        "failed-precondition",
        "3D print file generation must finish before checkout.",
      );
    }

    const orderRef = db.collection("orders").doc(parsed.data.jobId);
    const existingOrder = await orderRef.get();
    const existingOrderData = existingOrder.data();
    if (
      existingOrder.exists &&
      (existingOrderData?.uid !== request.auth.uid ||
        existingOrderData.jobId !== parsed.data.jobId)
    ) {
      throw new HttpsError("already-exists", "A different order uses this id.");
    }

    if (
      existingOrderData?.status === "paid" ||
      existingOrderData?.paymentStatus === "paid"
    ) {
      throw new HttpsError(
        "failed-precondition",
        "This poster order has already been paid.",
      );
    }

    const stripe = new Stripe(stripeSecretKey.value());
    const appUrl = process.env.PUBLIC_APP_URL ?? "http://localhost:3000";
    const posterPriceId = process.env.STRIPE_POSTER_PRICE_ID;
    const previousCheckoutAttempt =
      typeof existingOrderData?.checkoutAttempt === "number"
        ? existingOrderData.checkoutAttempt
        : 0;
    const startingAfterExpiredCheckout =
      existingOrderData?.status === "checkout_expired" ||
      existingOrderData?.paymentStatus === "expired";
    const checkoutAttempt =
      existingOrder.exists && startingAfterExpiredCheckout
        ? previousCheckoutAttempt + 1
        : Math.max(previousCheckoutAttempt, 1);
    const checkoutIdempotencyKey = [
      "checkout",
      request.auth.uid,
      parsed.data.jobId,
      String(jobData.approvedImagePath),
      checkoutAttempt,
      paintOption ?? "none",
    ].join(":");

    const figurinePriceId =
      paintOption === "painted"
        ? stripeFigurinePaintedPriceId.value() ||
          process.env.STRIPE_FIGURINE_PAINTED_PRICE_ID
        : stripeFigurineUnpaintedPriceId.value() ||
          process.env.STRIPE_FIGURINE_UNPAINTED_PRICE_ID;
    const figurineFallbackAmount =
      paintOption === "painted"
        ? figurinePaintedFallbackCents
        : figurineUnpaintedFallbackCents;
    const lineItems = isFigurine
      ? figurinePriceId
        ? [
            {
              quantity: 1,
              price: figurinePriceId,
            },
          ]
        : [
            {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: figurineFallbackAmount,
                product_data: {
                  name:
                    paintOption === "painted"
                      ? "Custom 3D Printed Figurine (painted)"
                      : "Custom 3D Printed Figurine (unpainted)",
                  description: "Custom figurine from your photo",
                },
              },
            },
          ]
      : posterPriceId
        ? [
            {
              quantity: 1,
              price: posterPriceId,
            },
          ]
        : [
            {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: 6000,
                product_data: {
                  name: "Custom 3D Print Poster",
                  description: "5in x 7in physical relief poster",
                },
              },
            },
          ];

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        success_url: `${appUrl}/orders/${orderRef.id}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/jobs/${parsed.data.jobId}?checkout=cancelled`,
        shipping_address_collection: {
          allowed_countries: ["US", "CA"],
        },
        line_items: lineItems,
        metadata: {
          uid: request.auth.uid,
          jobId: parsed.data.jobId,
          orderId: orderRef.id,
          paintOption: paintOption ?? "",
        },
      },
      {
        idempotencyKey: checkoutIdempotencyKey,
      },
    );

    await orderRef.set(
      {
        uid: request.auth.uid,
        jobId: parsed.data.jobId,
        approvedImagePath: jobData.approvedImagePath,
        printFileOutputPrefix: jobData.printFileOutputPrefix ?? null,
        printFileArtifacts,
        printFileAudit: jobData.printFileAudit ?? null,
        printability: jobData.printability ?? null,
        status: "checkout_created",
        paymentStatus: "pending",
        fulfillmentStatus: "not_started",
        stripeCheckoutSessionId: session.id,
        provider: null,
        providerOrderId: null,
        checkoutAttempt,
        checkoutIdempotencyKey,
        paintOption,
        productType: jobData.productType ?? "poster",
        priceSnapshot: {
          currency: "usd",
          unitAmount: isFigurine ? figurineFallbackAmount : 6000,
          stripePriceId: (isFigurine ? figurinePriceId : posterPriceId) ?? null,
        },
        ...(existingOrder.exists
          ? {}
          : { createdAt: FieldValue.serverTimestamp() }),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return {
      orderId: orderRef.id,
      checkoutUrl: session.url,
    };
  },
);

export const stripeWebhook = onRequest(
  {
    secrets: [stripeSecretKey, stripeWebhookSecret],
  },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).send("Method not allowed");
      return;
    }

    const signature = request.header("stripe-signature");
    if (!signature) {
      response.status(400).send("Missing Stripe signature");
      return;
    }

    const stripe = new Stripe(stripeSecretKey.value());
    let event: ReturnType<typeof stripe.webhooks.constructEvent>;

    try {
      event = stripe.webhooks.constructEvent(
        request.rawBody,
        signature,
        stripeWebhookSecret.value(),
      );
    } catch (error) {
      response
        .status(400)
        .send(`Webhook signature verification failed: ${String(error)}`);
      return;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as CheckoutSessionWebhookObject;
      const orderId = session.metadata?.orderId;
      const jobId = session.metadata?.jobId ?? orderId;

      if (orderId) {
        const customerFields = customerFieldsFromSession(
          session as Record<string, unknown>,
        );
        const paidAt = FieldValue.serverTimestamp();
        const batch = db.batch();
        batch.set(
          db.collection("orders").doc(orderId),
          {
            status: "paid",
            paymentStatus: "paid",
            stripePaymentIntentId:
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : null,
            customerName: customerFields.customerName,
            customerEmail: customerFields.customerEmail,
            shippingAddress: customerFields.shippingAddress,
            fulfillment: {
              stage: "paid",
              productionSubState: null,
              acceptedAt: null,
              acceptedBy: null,
              rejection: null,
              tracking: null,
              refund: null,
              history: FieldValue.arrayUnion({
                stage: "paid",
                at: Timestamp.now(),
                by: "stripe_webhook",
              }),
            },
            updatedAt: paidAt,
          },
          { merge: true },
        );
        if (jobId) {
          batch.set(
            db.collection("jobs").doc(jobId),
            {
              pipelineStage: "paid",
              pipelineUpdatedAt: paidAt,
              updatedAt: paidAt,
            },
            { merge: true },
          );
        }
        await batch.commit();
      }
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object as CheckoutSessionWebhookObject;
      const orderId = session.metadata?.orderId;

      if (orderId) {
        await db.collection("orders").doc(orderId).set(
          {
            status: "checkout_expired",
            paymentStatus: "expired",
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
    }

    response.json({ received: true });
  },
);

const figurineBaseIds = ["figurine-square-v1"] as const;
const figurineSignNameMaxCharacters = 12;
const figurineSignNamePattern = /^[A-Za-z0-9][A-Za-z0-9 .'-]*$/;

const updateFigurineBaseConfigSchema = z.object({
  jobId: jobIdSchema,
  baseShape: z.enum(["square"]).default("square"),
  baseId: z.enum(figurineBaseIds).default("figurine-square-v1"),
  signEnabled: z.boolean(),
  signText: z.string().max(64).optional(),
});

const figurineNamedBaseResponseSchema = z.object({
  job_id: z.string().min(1),
  status: z.string().min(1),
  base_id: z.string().min(1),
  normalized_name: z.string().min(1),
  artifact_paths: z.record(z.string(), z.string()),
  lettering: z.record(z.string(), z.unknown()),
  composed: z.record(z.string(), z.unknown()),
  warnings: z.array(z.string()).default([]),
});

const generateFigurineAssemblySchema = z.object({
  jobId: jobIdSchema,
});

const runFigurinePrintToolingSchema = z.object({
  jobId: jobIdSchema,
});

const figurineAssemblyResponseSchema = z.object({
  job_id: z.string().min(1),
  status: z.string().min(1),
  assembly_id: z.string().min(1),
  base_id: z.string().min(1),
  source_preview_glb: z.string().min(1),
  named_base_revision: z.string().min(1),
  artifact_paths: z.record(z.string(), z.string()),
  metrics: z.record(z.string(), z.unknown()),
  warnings: z.array(z.string()).default([]),
});

function normalizeFigurineSignText(raw: string): string {
  const collapsed = raw.trim().replace(/\s+/g, " ");
  if (!collapsed) {
    throw new HttpsError(
      "invalid-argument",
      "Sign name is required when the sign is enabled.",
    );
  }
  if (collapsed.length > figurineSignNameMaxCharacters) {
    throw new HttpsError(
      "invalid-argument",
      `Sign name must be ${figurineSignNameMaxCharacters} characters or fewer.`,
    );
  }
  if (!figurineSignNamePattern.test(collapsed)) {
    throw new HttpsError(
      "invalid-argument",
      "Sign name may only use letters, numbers, spaces, hyphens, " +
        "apostrophes, and periods, and must start with a letter or number.",
    );
  }
  return collapsed;
}

async function generateFigurineNamedBaseForJob(input: {
  jobRef: DocumentReference;
  jobId: string;
  uid: string;
  baseId: string;
  signText: string;
}): Promise<{
  outputPrefix: string;
  normalizedName: string;
  artifacts: Record<string, string>;
  lettering: Record<string, unknown>;
  composed: Record<string, unknown>;
}> {
  const serviceUrl = resolveRequiredEnv("PRINT_FILE_GENERATOR_URL").replace(
    /\/$/,
    "",
  );
  const bucketName = resolveRequiredEnv("APP_STORAGE_BUCKET");
  const generationId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const outputPrefix =
    `print-files/${input.uid}/${input.jobId}/figurine/named-base/` +
    `${input.baseId}/${generationId}`;

  console.info("figurine named-base generation started", {
    jobId: input.jobId,
    baseId: input.baseId,
    outputPrefix,
  });

  const response = await fetch(`${serviceUrl}/v1/figurine/named-base`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(printFileGeneratorFetchTimeoutMs),
    body: JSON.stringify({
      job_id: input.jobId,
      customer_name: input.signText,
      base_id: input.baseId,
      output_prefix: storagePathToGcsUri(bucketName, outputPrefix),
    }),
  });

  if (response.status === 422 || response.status === 400) {
    const detail = (await response.text()).slice(0, 300);
    throw new HttpsError(
      "invalid-argument",
      `The sign name could not be generated: ${detail}`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `Named-base generator failed with HTTP ${response.status}: ${(await response.text()).slice(0, 1000)}`,
    );
  }

  const parsed = figurineNamedBaseResponseSchema.safeParse(
    await response.json(),
  );
  if (!parsed.success) {
    throw new Error("Named-base generator returned an invalid response.");
  }

  const artifacts: Record<string, string> = {};
  for (const [key, gcsUri] of Object.entries(parsed.data.artifact_paths)) {
    artifacts[key] = gcsUriToStoragePath(bucketName, gcsUri);
  }

  // Firestore rejects arrays nested directly inside arrays, so reshape the
  // generator's boundsMm ([[min...],[max...]]) into a map before persisting.
  const composedRaw = parsed.data.composed;
  const boundsMm = Array.isArray(composedRaw.boundsMm)
    ? { min: composedRaw.boundsMm[0] ?? null, max: composedRaw.boundsMm[1] ?? null }
    : null;
  const composedForFirestore: Record<string, unknown> = {
    ...composedRaw,
    boundsMm,
  };

  await input.jobRef.set(
    {
      figurineNamedBase: {
        status: "generated",
        baseId: parsed.data.base_id,
        normalizedName: parsed.data.normalized_name,
        outputPrefix,
        artifacts,
        lettering: parsed.data.lettering,
        composed: composedForFirestore,
        warnings: parsed.data.warnings,
        generatedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  try {
    const localMirror = await mirrorStoragePathsToLocalTmp({
      bucketName,
      storagePaths: Object.values(artifacts),
    });
    await input.jobRef.set(
      {
        figurineNamedBase: { localMirror },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    await input.jobRef.set(
      {
        figurineNamedBase: { localMirror: buildLocalMirrorError(error) },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    console.warn("figurine named-base local mirror failed", {
      jobId: input.jobId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    outputPrefix,
    normalizedName: parsed.data.normalized_name,
    artifacts,
    lettering: parsed.data.lettering,
    composed: parsed.data.composed,
  };
}

function jobDataIsFigurine(jobData: Record<string, unknown> | undefined): boolean {
  return (
    jobData?.productType === "figurine" ||
    (typeof jobData?.selectedStyle === "string" &&
      isFigurineStyle(jobData.selectedStyle))
  );
}

function firestoreSafeValue(value: unknown, insideArray = false): unknown {
  if (value === undefined) {
    return null;
  }
  if (Array.isArray(value)) {
    const safeArray = value.map((item) => firestoreSafeValue(item, true));
    return insideArray ? { items: safeArray } : safeArray;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, firestoreSafeValue(entryValue)]),
    );
  }
  return value;
}

function requireAdminSupport(request: {
  auth?: { uid: string; token?: Record<string, unknown> };
}): { uid: string; email: string | null } {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Sign in with an admin account first.",
    );
  }

  const email =
    typeof request.auth.token?.email === "string"
      ? request.auth.token.email
      : null;
  const principal = {
    uid: request.auth.uid,
    email,
  };
  const developmentAccessReason = adminSupportDevelopmentAccessReason(
    process.env,
  );
  if (developmentAccessReason) {
    return principal;
  }

  const secretAllowlist = adminSupportAllowlist.value()?.trim();
  const allowlist =
    secretAllowlist || process.env.ADMIN_SUPPORT_ALLOWLIST?.trim() || "";

  if (
    !isAdminSupportAllowed({ allowlist, principal })
  ) {
    throw new HttpsError(
      "permission-denied",
      "This account is not allowed to use admin/support tools.",
    );
  }

  return principal;
}

function consolePrincipal(request: {
  auth?: { uid: string; token?: Record<string, unknown> };
}): { uid: string; email: string | null } {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }
  return {
    uid: request.auth.uid,
    email:
      typeof request.auth.token?.email === "string"
        ? request.auth.token.email
        : null,
  };
}

function consoleRoles(request: {
  auth?: { uid: string; token?: Record<string, unknown> };
}): { principal: { uid: string; email: string | null }; isAdmin: boolean; isOperator: boolean } {
  const principal = consolePrincipal(request);
  if (adminSupportDevelopmentAccessReason(process.env)) {
    return { principal, isAdmin: true, isOperator: true };
  }
  const adminList =
    adminSupportAllowlist.value()?.trim() ||
    process.env.ADMIN_SUPPORT_ALLOWLIST?.trim() ||
    "";
  const operatorList =
    operatorAllowlist.value()?.trim() ||
    process.env.OPERATOR_ALLOWLIST?.trim() ||
    "";
  const isAdmin = isAdminSupportAllowed({ allowlist: adminList, principal });
  // Admins are implicitly operators so the owner can exercise the operator view.
  const isOperator =
    isAdmin || isAdminSupportAllowed({ allowlist: operatorList, principal });
  return { principal, isAdmin, isOperator };
}

function requireOperator(request: {
  auth?: { uid: string; token?: Record<string, unknown> };
}): { uid: string; email: string | null } {
  const roles = consoleRoles(request);
  if (!roles.isOperator) {
    throw new HttpsError(
      "permission-denied",
      "This account is not on the operator allowlist.",
    );
  }
  return roles.principal;
}

function buildAdminSupportFilters(
  data: z.infer<typeof listAdminSupportJobsSchema>,
): AdminSupportFilters {
  return {
    ...(data.productType ? { productType: data.productType } : {}),
    ...(data.jobStatus ? { jobStatus: data.jobStatus } : {}),
    ...(data.supportStatus ? { supportStatus: data.supportStatus } : {}),
    ...(data.issueType ? { issueType: data.issueType } : {}),
  };
}

function applyPrimaryAdminSupportFilter(
  query: Query,
  filters: AdminSupportFilters,
): Query {
  if (filters.productType) {
    return query.where("productType", "==", filters.productType);
  }
  if (filters.jobStatus) {
    return query.where("status", "==", filters.jobStatus);
  }
  if (filters.supportStatus && filters.supportStatus !== "open") {
    return query.where("supportSummary.status", "==", filters.supportStatus);
  }
  return query;
}

function isFirestoreMissingIndexError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as {
    code?: unknown;
    details?: unknown;
    message?: unknown;
  };
  const code = candidate.code;
  const text = [candidate.details, candidate.message]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return (
    (code === 9 || code === "9" || code === "failed-precondition") &&
    text.includes("requires an index")
  );
}

function rethrowAdminSupportListError(error: unknown): never {
  if (error instanceof HttpsError) {
    throw error;
  }
  if (isFirestoreMissingIndexError(error)) {
    throw new HttpsError(
      "failed-precondition",
      "Admin support job filters need a Firestore index. Deploy the repo's Firestore indexes to the dev project, then retry after the index finishes building.",
    );
  }
  throw error;
}

function orderHasPaymentIssue(orderData: Record<string, unknown> | undefined) {
  if (!orderData) {
    return false;
  }
  return (
    orderData.status === "checkout_expired" ||
    orderData.paymentStatus === "expired" ||
    orderData.paymentStatus === "failed" ||
    orderData.status === "payment_failed"
  );
}

function addPaymentIssue<T extends AdminSupportJobSummary>(
  summary: T,
  orderData: Record<string, unknown> | undefined,
): T {
  if (
    orderHasPaymentIssue(orderData) &&
    !summary.issueTypes.includes("payment")
  ) {
    return {
      ...summary,
      issueTypes: [...summary.issueTypes, "payment"],
    } as T;
  }

  return summary;
}

async function adminSupportSummaryForJobDoc(input: {
  jobId: string;
  jobData: Record<string, unknown>;
}): Promise<AdminSupportJobSummary> {
  const orderSnap = await db.collection("orders").doc(input.jobId).get();
  const orderData = orderSnap.data() as Record<string, unknown> | undefined;
  return addPaymentIssue(
    sanitizeAdminSupportJobSummary({
      jobId: input.jobId,
      jobData: input.jobData,
    }),
    orderData,
  );
}

async function adminSupportDetailForJob(input: {
  jobId: string;
  jobData: Record<string, unknown>;
}) {
  const jobRef = db.collection("jobs").doc(input.jobId);
  const [orderSnap, printFileAuditSnap, supportNotesSnap] = await Promise.all([
    db.collection("orders").doc(input.jobId).get(),
    jobRef.collection("audit").doc("printFileGeneration").get(),
    jobRef
      .collection("supportNotes")
      .orderBy("createdAt", "desc")
      .limit(25)
      .get(),
  ]);
  const orderData = orderSnap.data() as Record<string, unknown> | undefined;
  const detail = sanitizeAdminSupportJobDetail({
    jobId: input.jobId,
    jobData: input.jobData,
    orderData,
    printFileAuditData:
      (printFileAuditSnap.data() as Record<string, unknown> | undefined) ??
      null,
    supportNotes: supportNotesSnap.docs.map((noteSnap) => ({
      id: noteSnap.id,
      data: noteSnap.data() as Record<string, unknown>,
    })),
  });

  return addPaymentIssue(detail, orderData);
}

export const listAdminSupportJobs = onCall(
  {
    secrets: [adminSupportAllowlist],
  },
  async (request) => {
    try {
      requireAdminSupport(request);
      const parsed = listAdminSupportJobsSchema.safeParse(request.data ?? {});
      if (!parsed.success) {
        throw new HttpsError(
          "invalid-argument",
          "Support job filters are invalid.",
        );
      }

      const filters = buildAdminSupportFilters(parsed.data);
      const search = parsed.data.search?.trim();
      if (search) {
        const snapshots = new Map<string, Record<string, unknown>>();
        const directJob = await db.collection("jobs").doc(search).get();
        if (directJob.exists) {
          snapshots.set(
            directJob.id,
            directJob.data() as Record<string, unknown>,
          );
        }

        const uidMatches = await db
          .collection("jobs")
          .where("uid", "==", search)
          .limit(parsed.data.pageSize)
          .get();
        for (const jobSnap of uidMatches.docs) {
          snapshots.set(jobSnap.id, jobSnap.data() as Record<string, unknown>);
        }

        const summaries = await Promise.all(
          Array.from(snapshots.entries()).map(([jobId, jobData]) =>
            adminSupportSummaryForJobDoc({ jobId, jobData }),
          ),
        );
        return {
          items: summaries
            .filter((summary) => jobMatchesAdminSupportFilters(summary, filters))
            .slice(0, parsed.data.pageSize),
          nextCursor: null,
        };
      }

      const scanLimit =
        Object.keys(filters).length > 0
          ? Math.min(parsed.data.pageSize * 5, 250)
          : parsed.data.pageSize;
      let query = applyPrimaryAdminSupportFilter(
        db.collection("jobs").orderBy("updatedAt", "desc"),
        filters,
      );
      if (parsed.data.cursor) {
        const cursorSnap = await db
          .collection("jobs")
          .doc(parsed.data.cursor)
          .get();
        if (cursorSnap.exists) {
          query = query.startAfter(cursorSnap);
        }
      }

      let jobsSnap: QuerySnapshot;
      try {
        jobsSnap = await query.limit(scanLimit).get();
      } catch (error) {
        if (!isFirestoreMissingIndexError(error)) {
          throw error;
        }
        console.warn(
          "admin support indexed query missing index; falling back to recent scan",
          { filters },
        );
        let fallbackQuery = db.collection("jobs").orderBy("updatedAt", "desc");
        if (parsed.data.cursor) {
          const cursorSnap = await db
            .collection("jobs")
            .doc(parsed.data.cursor)
            .get();
          if (cursorSnap.exists) {
            fallbackQuery = fallbackQuery.startAfter(cursorSnap);
          }
        }
        jobsSnap = await fallbackQuery.limit(scanLimit).get();
      }
      const summaries = await Promise.all(
        jobsSnap.docs.map((jobSnap) =>
          adminSupportSummaryForJobDoc({
            jobId: jobSnap.id,
            jobData: jobSnap.data() as Record<string, unknown>,
          }),
        ),
      );
      const filteredSummaries = summaries
        .filter((summary) => jobMatchesAdminSupportFilters(summary, filters))
        .slice(0, parsed.data.pageSize);

      return {
        items: filteredSummaries,
        nextCursor:
          jobsSnap.docs.length === scanLimit
            ? jobsSnap.docs[jobsSnap.docs.length - 1]?.id ?? null
            : null,
      };
    } catch (error) {
      rethrowAdminSupportListError(error);
    }
  },
);

export const getAdminSupportJob = onCall(
  {
    secrets: [adminSupportAllowlist],
  },
  async (request) => {
    requireAdminSupport(request);
    const parsed = getAdminSupportJobSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", "jobId is required.");
    }

    const jobSnap = await db.collection("jobs").doc(parsed.data.jobId).get();
    const jobData = jobSnap.data() as Record<string, unknown> | undefined;
    if (!jobSnap.exists || !jobData) {
      throw new HttpsError("not-found", "Job not found.");
    }

    return {
      job: await adminSupportDetailForJob({
        jobId: parsed.data.jobId,
        jobData,
      }),
    };
  },
);

export const getAdminJobPreview = onCall(
  {
    secrets: [adminSupportAllowlist, appStorageBucket],
  },
  async (request) => {
    requireAdminSupport(request);
    const parsed = getAdminJobPreviewSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", "jobId is required.");
    }

    const jobSnap = await db.collection("jobs").doc(parsed.data.jobId).get();
    const jobData = jobSnap.data() as Record<string, unknown> | undefined;
    if (!jobSnap.exists || !jobData) {
      throw new HttpsError("not-found", "Job not found.");
    }

    const job = sanitizeOperatorJobDocument(jobData);
    const bucketName = resolveRequiredEnv("APP_STORAGE_BUCKET");
    const assetUrls = await operatorAssetUrls({
      bucketName,
      storagePaths: Array.from(new Set(collectStoragePaths(job))),
    });

    return {
      jobId: parsed.data.jobId,
      job,
      assetUrls,
    };
  },
);

export const addAdminSupportNote = onCall(
  {
    secrets: [adminSupportAllowlist],
  },
  async (request) => {
    const admin = requireAdminSupport(request);
    const parsed = addAdminSupportNoteSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError(
        "invalid-argument",
        "jobId and note body are required.",
      );
    }

    const body = normalizeAdminSupportNoteBody(parsed.data.body);
    if (!body) {
      throw new HttpsError("invalid-argument", "Support note cannot be empty.");
    }

    const jobRef = db.collection("jobs").doc(parsed.data.jobId);
    const jobSnap = await jobRef.get();
    const jobData = jobSnap.data() as Record<string, unknown> | undefined;
    if (!jobSnap.exists || !jobData) {
      throw new HttpsError("not-found", "Job not found.");
    }

    const currentSupportSummary = jobData.supportSummary as
      | { status?: unknown }
      | undefined;
    const nextStatus =
      parsed.data.status ??
      normalizeAdminSupportStatus(currentSupportSummary?.status) ??
      "open";
    const noteRef = jobRef.collection("supportNotes").doc();
    const batch = db.batch();
    batch.set(noteRef, {
      body,
      statusChange: parsed.data.status ?? null,
      createdAt: FieldValue.serverTimestamp(),
      createdByUid: admin.uid,
      createdByEmail: admin.email,
    });
    batch.set(
      jobRef,
      {
        supportSummary: {
          status: nextStatus,
          noteCount: FieldValue.increment(1),
          lastNoteAt: FieldValue.serverTimestamp(),
          lastNoteByUid: admin.uid,
          lastNoteByEmail: admin.email,
          lastNotePreview: body.slice(0, 160),
          updatedAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    await batch.commit();

    const updatedJobSnap = await jobRef.get();
    const updatedJobData = updatedJobSnap.data() as Record<string, unknown>;
    return {
      job: await adminSupportDetailForJob({
        jobId: parsed.data.jobId,
        jobData: updatedJobData,
      }),
    };
  },
);

export const getConsoleRole = onCall(
  {
    secrets: [adminSupportAllowlist, operatorAllowlist],
  },
  async (request) => {
    const roles = consoleRoles(request);
    return { isAdmin: roles.isAdmin, isOperator: roles.isOperator };
  },
);

export const listOperatorJobs = onCall(
  {
    secrets: [adminSupportAllowlist, operatorAllowlist],
  },
  async (request) => {
    requireOperator(request);
    const parsed = listOperatorJobsSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", "A valid tab is required.");
    }

    const stages = operatorTabStages[parsed.data.tab];
    const jobsSnap = await db
      .collection("jobs")
      .where("pipelineStage", "in", stages)
      .limit(200)
      .get();

    const items = await Promise.all(
      jobsSnap.docs.map(async (jobDoc) => {
        const orderSnap = await db.collection("orders").doc(jobDoc.id).get();
        return sanitizeOperatorJobSummary({
          jobId: jobDoc.id,
          jobData: jobDoc.data() as Record<string, unknown>,
          orderData: (orderSnap.data() ?? {}) as Record<string, unknown>,
        });
      }),
    );
    items.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    return { items };
  },
);

const operatorPreviewJobFields = [
  "uid",
  "productType",
  "status",
  "sourceImagePath",
  "selectedStyle",
  "selectedStyleLabel",
  "conceptSource",
  "generatedImages",
  "approvedImagePath",
  "figurinePreview",
  "baseConfig",
  "figurineNamedBase",
  "figurineAssembly",
  "figurinePrintTooling",
  "figurineReview",
  "jobCost",
  "printFileStatus",
  "printFileArtifacts",
  "printability",
  "printFileError",
] as const;

const storagePathPrefixes = ["uploads/", "generated/", "print-files/", "stl/"];

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFirestoreTimestamp(value: unknown): value is { toDate: () => Date } {
  return isPlainRecord(value) && typeof value.toDate === "function";
}

function callableSafeValue(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }
  if (isFirestoreTimestamp(value)) {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => callableSafeValue(item));
  }
  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, callableSafeValue(entryValue)]),
    );
  }
  return value;
}

function sanitizeOperatorJobDocument(
  jobData: Record<string, unknown>,
): Record<string, unknown> {
  const selected = Object.fromEntries(
    operatorPreviewJobFields.map((field) => [field, jobData[field]]),
  );
  return callableSafeValue(selected) as Record<string, unknown>;
}

function isStoragePath(value: string): boolean {
  return storagePathPrefixes.some((prefix) => value.startsWith(prefix));
}

function isLikelyStorageFilePath(value: string): boolean {
  const fileName = value.split("/").pop() ?? "";
  return isStoragePath(value) && fileName.includes(".");
}

function firebaseDownloadUrl(input: {
  bucketName: string;
  storagePath: string;
  token: string;
}): string {
  return (
    `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(input.bucketName)}` +
    `/o/${encodeURIComponent(input.storagePath)}?alt=media&token=${encodeURIComponent(input.token)}`
  );
}

function metadataDownloadToken(metadata: Record<string, unknown>): string | null {
  const rawToken = metadata.firebaseStorageDownloadTokens;
  if (typeof rawToken !== "string" || rawToken.trim().length === 0) {
    return null;
  }
  return rawToken.split(",")[0]?.trim() || null;
}

async function operatorAssetUrls(input: {
  bucketName: string;
  storagePaths: string[];
}): Promise<Record<string, string>> {
  const entries = await Promise.all(
    input.storagePaths.map(async (storagePath) => {
      const file = getStorage().bucket(input.bucketName).file(storagePath);
      try {
        const [metadata] = await file.getMetadata();
        const customMetadata =
          (metadata.metadata as Record<string, unknown> | undefined) ?? {};
        const existingToken = metadataDownloadToken(customMetadata);
        if (existingToken) {
          return [
            storagePath,
            firebaseDownloadUrl({
              bucketName: input.bucketName,
              storagePath,
              token: existingToken,
            }),
          ] as const;
        }

        const token = randomUUID();
        await file.setMetadata({
          metadata: {
            ...customMetadata,
            firebaseStorageDownloadTokens: token,
          },
        });
        return [
          storagePath,
          firebaseDownloadUrl({
            bucketName: input.bucketName,
            storagePath,
            token,
          }),
        ] as const;
      } catch (error) {
        console.warn("operator storage asset URL failed", {
          storagePath,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    }),
  );

  return Object.fromEntries(
    entries.filter(
      (entry): entry is readonly [string, string] => entry !== null,
    ),
  );
}

function collectStoragePaths(value: unknown): string[] {
  if (typeof value === "string") {
    return isLikelyStorageFilePath(value) ? [value] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStoragePaths(item));
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((item) =>
      collectStoragePaths(item),
    );
  }
  return [];
}

function resolveMeshyApiKeyForPrintTooling(): string {
  const value = meshyApiKey.value()?.trim();
  if (!value) {
    throw new Error("MESHY_API_KEY is required for figurine print tooling.");
  }
  return value;
}

async function generateFigurineAssemblyForJob(input: {
  jobRef: DocumentReference;
  jobId: string;
  uid: string;
  jobData: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const figurinePreview = input.jobData.figurinePreview as
    | { previewGlb?: unknown; status?: unknown }
    | undefined;
  const baseConfig = input.jobData.baseConfig as
    | { baseId?: unknown }
    | undefined;
  const namedBase = input.jobData.figurineNamedBase as
    | {
        status?: unknown;
        outputPrefix?: unknown;
        artifacts?: Record<string, unknown>;
      }
    | undefined;
  const sourcePreviewGlb = figurinePreview?.previewGlb;
  const namedBaseStl = namedBase?.artifacts?.stl;
  const baseId = baseConfig?.baseId ?? "figurine-square-v1";

  if (figurinePreview?.status !== "preview_ready" || typeof sourcePreviewGlb !== "string") {
    throw new HttpsError(
      "failed-precondition",
      "Generate the Creative Lab figurine preview before assembly.",
    );
  }
  if (namedBase?.status !== "generated" || typeof namedBaseStl !== "string") {
    throw new HttpsError(
      "failed-precondition",
      "Generate the named base before assembly.",
    );
  }
  if (baseId !== "figurine-square-v1") {
    throw new HttpsError(
      "failed-precondition",
      "Only figurine-square-v1 assembly is enabled for this review path.",
    );
  }

  const serviceUrl = resolveRequiredEnv("PRINT_FILE_GENERATOR_URL").replace(
    /\/$/,
    "",
  );
  const bucketName = resolveRequiredEnv("APP_STORAGE_BUCKET");
  const assemblyId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const outputPrefix =
    `print-files/${input.uid}/${input.jobId}/figurine/assembled/${assemblyId}`;
  const namedBaseRevision =
    typeof namedBase.outputPrefix === "string"
      ? namedBase.outputPrefix
      : namedBaseStl;

  await input.jobRef.set(
    {
      figurineAssembly: {
        status: "assembling",
        assemblyId,
        sourcePreviewGlb,
        namedBaseRevision,
        startedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const response = await fetch(`${serviceUrl}/v1/figurine/assemble`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(printFileGeneratorFetchTimeoutMs),
    body: JSON.stringify({
      job_id: input.jobId,
      uid: input.uid,
      source_preview_glb_path: storagePathToGcsUri(bucketName, sourcePreviewGlb),
      named_base_stl_path: storagePathToGcsUri(bucketName, namedBaseStl),
      base_id: baseId,
      named_base_revision: namedBaseRevision,
      output_prefix: storagePathToGcsUri(bucketName, outputPrefix),
      target_body_height_mm: 150.0,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Figurine assembly failed with HTTP ${response.status}: ${(await response.text()).slice(0, 1000)}`,
    );
  }

  const parsed = figurineAssemblyResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("Figurine assembly service returned an invalid response.");
  }

  const artifacts: Record<string, string> = {};
  for (const [key, gcsUri] of Object.entries(parsed.data.artifact_paths)) {
    artifacts[key] = gcsUriToStoragePath(bucketName, gcsUri);
  }
  const assembly = {
    status: "assembled",
    assemblyId: parsed.data.assembly_id,
    baseId: parsed.data.base_id,
    sourcePreviewGlb: gcsUriToStoragePath(
      bucketName,
      parsed.data.source_preview_glb,
    ),
    namedBaseRevision: parsed.data.named_base_revision,
    outputPrefix,
    artifacts,
    metrics: parsed.data.metrics,
    warnings: parsed.data.warnings,
    completedAt: FieldValue.serverTimestamp(),
  };

  await input.jobRef.set(
    {
      figurineAssembly: firestoreSafeValue(assembly),
      figurineReview: {
        status: "needs_review",
        decision: null,
        notes: null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      figurinePreview: {
        printReadiness: "needs_review",
      },
      checkoutEligibility: {
        eligible: false,
        reason:
          "Figurine checkout is locked until printability and slicer review are complete.",
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await refreshJobCostFromFirestore(
    input.jobRef,
    "figurine_assembly_completed",
  );

  try {
    const localMirror = await mirrorStoragePathsToLocalTmp({
      bucketName,
      storagePaths: Object.values(artifacts),
    });
    await input.jobRef.set(
      {
        figurineAssembly: { localMirror },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    await input.jobRef.set(
      {
        figurineAssembly: { localMirror: buildLocalMirrorError(error) },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  return assembly;
}

type ModelUrlSource = "signed_storage_url" | "data_uri";

function isFunctionsEmulator(): boolean {
  return process.env.FUNCTIONS_EMULATOR === "true";
}

function isMissingClientEmailSigningError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("Cannot sign data without `client_email`")
  );
}

async function storageModelDataUri(input: {
  bucketName: string;
  storagePath: string;
}): Promise<{ source: ModelUrlSource; url: string }> {
  const file = getStorage().bucket(input.bucketName).file(input.storagePath);
  const [buffer] = await file.download();

  if (buffer.byteLength > meshyModelDataUriByteLimit) {
    throw new Error(
      `Assembled model is ${buffer.byteLength} bytes, which exceeds Meshy's ${meshyModelDataUriByteLimit} byte data URL limit for local print tooling.`,
    );
  }

  return {
    source: "data_uri",
    url: `data:model/gltf-binary;base64,${buffer.toString("base64")}`,
  };
}

async function signedModelUrl(input: {
  bucketName: string;
  storagePath: string;
}): Promise<{ source: ModelUrlSource; url: string }> {
  const file = getStorage().bucket(input.bucketName).file(input.storagePath);

  try {
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 60 * 60 * 1000,
    });
    return { source: "signed_storage_url", url };
  } catch (error) {
    if (!isFunctionsEmulator() || !isMissingClientEmailSigningError(error)) {
      throw error;
    }

    console.warn(
      "falling back to data URL model input for local print tooling",
      {
        storagePath: input.storagePath,
      },
    );
    return storageModelDataUri(input);
  }
}

async function loadOperatorJobDocs(jobId: string) {
  const jobRef = db.collection("jobs").doc(jobId);
  const orderRef = db.collection("orders").doc(jobId);
  const [jobSnap, orderSnap] = await Promise.all([jobRef.get(), orderRef.get()]);
  const jobData = jobSnap.data() as Record<string, unknown> | undefined;
  if (!jobSnap.exists || !jobData) {
    throw new HttpsError("not-found", "Job not found.");
  }
  return {
    jobRef,
    orderRef,
    jobData,
    orderData: (orderSnap.data() ?? {}) as Record<string, unknown>,
  };
}

async function operatorJobDetailPayload(jobId: string) {
  const { jobData, orderData } = await loadOperatorJobDocs(jobId);
  const detail = sanitizeOperatorJobDetail({ jobId, jobData, orderData });

  const bucketName = resolveRequiredEnv("APP_STORAGE_BUCKET");
  let previewUrl: string | null = null;
  const thumbnailPath =
    (jobData.figurinePreview as { thumbnailPath?: string } | undefined)
      ?.thumbnailPath ??
    (typeof jobData.approvedImagePath === "string"
      ? jobData.approvedImagePath
      : null);
  if (thumbnailPath) {
    try {
      const signed = await signedModelUrl({ bucketName, storagePath: thumbnailPath });
      previewUrl = signed.url;
    } catch {
      previewUrl = null;
    }
  }

  let bundleUrl: string | null = null;
  if (detail.bundle.status === "ready" && detail.bundle.storagePath) {
    try {
      const signed = await signedModelUrl({
        bucketName,
        storagePath: detail.bundle.storagePath,
      });
      bundleUrl = signed.url;
    } catch {
      bundleUrl = null;
    }
  }

  const extraFiles = await Promise.all(
    selectBundleFiles({ jobId, jobData }).map(async (file) => {
      try {
        const signed = await signedModelUrl({ bucketName, storagePath: file.storagePath });
        return { name: file.name, url: signed.url };
      } catch {
        return { name: file.name, url: null };
      }
    }),
  );

  return { job: { ...detail, previewUrl, bundleUrl, files: extraFiles } };
}

export const getOperatorJob = onCall(
  {
    secrets: [adminSupportAllowlist, operatorAllowlist, appStorageBucket],
  },
  async (request) => {
    requireOperator(request);
    const parsed = operatorJobIdSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", "jobId is required.");
    }
    return operatorJobDetailPayload(parsed.data.jobId);
  },
);

async function applyFulfillmentTransition(input: {
  jobId: string;
  toStage: string;
  by: { uid: string; email: string | null };
  note?: string;
  extraOrderFields?: Record<string, unknown>;
}) {
  const jobRef = db.collection("jobs").doc(input.jobId);
  const orderRef = db.collection("orders").doc(input.jobId);

  await db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    const orderData = orderSnap.data();
    if (!orderSnap.exists || !orderData) {
      throw new HttpsError("failed-precondition", "This job has no paid order.");
    }
    const currentStage = (orderData.fulfillment as { stage?: unknown } | undefined)
      ?.stage;
    if (!canTransition(currentStage, input.toStage)) {
      throw new HttpsError(
        "failed-precondition",
        `Cannot move this job from "${String(currentStage)}" to "${input.toStage}".`,
      );
    }
    const now = FieldValue.serverTimestamp();
    const extra = (input.extraOrderFields ?? {}) as Record<string, unknown>;
    const extraFulfillment = (extra.fulfillment ?? {}) as Record<string, unknown>;
    const { fulfillment: _ignored, ...extraTopLevel } = extra;
    const previousFulfillment = (orderData.fulfillment ?? {}) as Record<string, unknown>;
    tx.set(
      orderRef,
      {
        fulfillment: {
          ...previousFulfillment,
          stage: input.toStage,
          ...extraFulfillment,
          history: FieldValue.arrayUnion({
            stage: input.toStage,
            at: Timestamp.now(),
            by: input.by.email ?? input.by.uid,
            ...(input.note ? { note: input.note } : {}),
          }),
        },
        ...extraTopLevel,
        updatedAt: now,
      },
      { merge: true },
    );
    tx.set(
      jobRef,
      { pipelineStage: input.toStage, pipelineUpdatedAt: now, updatedAt: now },
      { merge: true },
    );
  });
}

async function buildPrintBundle(input: { jobId: string }): Promise<void> {
  const orderRef = db.collection("orders").doc(input.jobId);
  try {
    const { jobData, orderData } = await loadOperatorJobDocs(input.jobId);
    const files = selectBundleFiles({ jobId: input.jobId, jobData });
    if (files.length === 0) {
      throw new Error("No print artifacts found for this job.");
    }
    const bucketName = resolveRequiredEnv("APP_STORAGE_BUCKET");
    const bucket = getStorage().bucket(bucketName);
    const uid = typeof jobData.uid === "string" ? jobData.uid : "unknown";
    const bundlePath = `print-files/${uid}/${input.jobId}/operator/print-bundle-${displayJobId(input.jobId).toLowerCase()}.zip`;

    const archive = archiver("zip", { zlib: { level: 6 } });
    const passthrough = new PassThrough();
    const upload = bucket.file(bundlePath).save(passthrough, {
      contentType: "application/zip",
      resumable: false,
    });
    archive.on("error", (archiveError) => {
      passthrough.destroy(archiveError);
    });
    archive.pipe(passthrough);

    archive.append(
      buildJobSheet({ jobId: input.jobId, jobData, orderData }),
      { name: "job-sheet.txt" },
    );
    for (const file of files) {
      const [buffer] = await bucket.file(file.storagePath).download();
      archive.append(buffer, { name: file.name });
    }
    await archive.finalize();
    await upload;

    await orderRef.set(
      {
        printBundle: {
          status: "ready",
          storagePath: bundlePath,
          error: null,
          builtAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );
  } catch (error) {
    console.error("buildPrintBundle failed", { jobId: input.jobId, error });
    await orderRef.set(
      {
        printBundle: {
          status: "failed",
          error: String(error).slice(0, 500),
          builtAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );
  }
}

export const operatorAcceptJob = onCall(
  {
    secrets: [adminSupportAllowlist, operatorAllowlist, appStorageBucket],
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  async (request) => {
    const operator = requireOperator(request);
    const parsed = operatorJobIdSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", "jobId is required.");
    }

    await applyFulfillmentTransition({
      jobId: parsed.data.jobId,
      toStage: "accepted",
      by: operator,
      extraOrderFields: {
        fulfillment: {
          stage: "accepted",
          acceptedAt: FieldValue.serverTimestamp(),
          acceptedBy: { uid: operator.uid, email: operator.email },
        },
        printBundle: { status: "building", error: null },
      },
    });

    await buildPrintBundle({ jobId: parsed.data.jobId });
    return operatorJobDetailPayload(parsed.data.jobId);
  },
);

export const operatorUpdateFulfillment = onCall(
  {
    secrets: [adminSupportAllowlist, operatorAllowlist, appStorageBucket],
  },
  async (request) => {
    const operator = requireOperator(request);
    const parsed = operatorUpdateFulfillmentSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", "Invalid fulfillment action.");
    }
    const data = parsed.data;

    if (data.action === "start_production") {
      await applyFulfillmentTransition({
        jobId: data.jobId,
        toStage: "in_production",
        by: operator,
        extraOrderFields: {
          fulfillment: { stage: "in_production", productionSubState: "printing" },
        },
      });
    } else if (data.action === "set_production_substate") {
      const { orderRef, orderData } = await loadOperatorJobDocs(data.jobId);
      const stage = (orderData.fulfillment as { stage?: unknown } | undefined)?.stage;
      if (stage !== "in_production") {
        throw new HttpsError(
          "failed-precondition",
          "Sub-state can only change while the job is in production.",
        );
      }
      // Same-stage substate toggle (no stage-machine invariant at risk); intentionally
      // non-transactional — the frontend disables this control while a request is in flight.
      const previousFulfillment = (orderData.fulfillment ?? {}) as Record<string, unknown>;
      await orderRef.set(
        {
          fulfillment: { ...previousFulfillment, productionSubState: data.subState },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    } else if (data.action === "reject") {
      await applyFulfillmentTransition({
        jobId: data.jobId,
        toStage: "rejected_by_operator",
        by: operator,
        note: data.reason,
        extraOrderFields: {
          fulfillment: {
            stage: "rejected_by_operator",
            rejection: {
              reason: data.reason,
              at: Timestamp.now(),
              by: operator.email ?? operator.uid,
            },
          },
        },
      });
      // Surface the rejection in the existing admin-support workflow.
      const jobRef = db.collection("jobs").doc(data.jobId);
      const noteRef = jobRef.collection("supportNotes").doc();
      const batch = db.batch();
      batch.set(noteRef, {
        body: `Print service rejected this job: ${data.reason}`,
        statusChange: "open",
        createdAt: FieldValue.serverTimestamp(),
        createdByUid: operator.uid,
        createdByEmail: operator.email,
      });
      batch.set(
        jobRef,
        {
          supportSummary: {
            status: "open",
            noteCount: FieldValue.increment(1),
            lastNoteAt: FieldValue.serverTimestamp(),
            lastNoteByUid: operator.uid,
            lastNoteByEmail: operator.email,
            lastNotePreview: `Print service rejected: ${data.reason}`.slice(0, 160),
            updatedAt: FieldValue.serverTimestamp(),
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await batch.commit();
    } else {
      await applyFulfillmentTransition({
        jobId: data.jobId,
        toStage: "shipped",
        by: operator,
        extraOrderFields: {
          fulfillment: {
            stage: "shipped",
            tracking: {
              carrier: data.carrier,
              number: data.trackingNumber,
              at: Timestamp.now(),
            },
          },
        },
      });
    }

    return operatorJobDetailPayload(data.jobId);
  },
);

async function runFigurinePrintToolingForJob(input: {
  jobRef: DocumentReference;
  jobId: string;
  uid: string;
  jobData: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const assembly = input.jobData.figurineAssembly as
    | {
        status?: unknown;
        assemblyId?: unknown;
        artifacts?: Record<string, unknown>;
      }
    | undefined;
  const assemblyId = assembly?.assemblyId;
  const assembledPreviewGlb = assembly?.artifacts?.assembledPreviewGlb;

  if (assembly?.status !== "assembled" || typeof assemblyId !== "string") {
    throw new HttpsError(
      "failed-precondition",
      "Assemble the figurine package before running print tooling.",
    );
  }
  if (typeof assembledPreviewGlb !== "string") {
    throw new HttpsError(
      "failed-precondition",
      "The assembled GLB artifact is missing.",
    );
  }

  const bucketName = resolveRequiredEnv("APP_STORAGE_BUCKET");
  const toolingId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const outputPrefix =
    `print-files/${input.uid}/${input.jobId}/figurine/print-tooling/` +
    `${assemblyId}/${toolingId}`;

  await input.jobRef.set(
    {
      figurinePrintTooling: {
        status: "running",
        toolingId,
        inputAssemblyId: assemblyId,
        inputArtifact: assembledPreviewGlb,
        startedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const inputModelUrl = await signedModelUrl({
    bucketName,
    storagePath: assembledPreviewGlb,
  });
  const result = await runMeshyFigurinePrintTooling({
    apiKey: resolveMeshyApiKeyForPrintTooling(),
    modelUrl: inputModelUrl.url,
    modelUrlSource: inputModelUrl.source,
    outputPrefix,
    jobId: input.jobId,
    uid: input.uid,
    remeshTopology: "quad",
    remeshTargetPolycount: 100_000,
    remeshTargetFormats: ["glb", "stl", "3mf"],
  });
  const tooling = firestoreSafeValue({
    ...result,
    toolingId,
    inputAssemblyId: assemblyId,
    inputArtifact: assembledPreviewGlb,
    outputPrefix,
    completedAt: FieldValue.serverTimestamp(),
  }) as Record<string, unknown>;

  await input.jobRef.set(
    {
      figurinePrintTooling: tooling,
      figurineReview: {
        status: "needs_review",
        decision: null,
        notes: null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      figurinePreview: {
        printReadiness: "needs_review",
      },
      checkoutEligibility: {
        eligible: false,
        reason:
          "Figurine checkout is locked until printability and slicer review are complete.",
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await refreshJobCostFromFirestore(
    input.jobRef,
    "figurine_print_tooling_completed",
  );

  try {
    const localMirror = await mirrorStoragePathsToLocalTmp({
      bucketName,
      storagePaths: Array.from(new Set(collectStoragePaths(tooling))),
    });
    await input.jobRef.set(
      {
        figurinePrintTooling: { localMirror },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    await input.jobRef.set(
      {
        figurinePrintTooling: { localMirror: buildLocalMirrorError(error) },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  return tooling;
}

export const updateFigurineBaseConfig = onCall(
  {
    secrets: printFileRuntimeSecrets,
    timeoutSeconds: 540,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in before editing the figurine base.",
      );
    }

    const parsed = updateFigurineBaseConfigSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError(
        "invalid-argument",
        "jobId, signEnabled, and a supported base are required.",
      );
    }

    const jobRef = db.collection("jobs").doc(parsed.data.jobId);
    const jobSnap = await jobRef.get();
    const jobData = jobSnap.data();

    if (!jobSnap.exists || jobData?.uid !== request.auth.uid) {
      throw new HttpsError("not-found", "Job not found.");
    }

    const isFigurineJob =
      jobData.productType === "figurine" ||
      (typeof jobData.selectedStyle === "string" &&
        isFigurineStyle(jobData.selectedStyle));
    if (!isFigurineJob) {
      throw new HttpsError(
        "failed-precondition",
        "Base sign configuration is only available for figurine jobs.",
      );
    }

    const signText = parsed.data.signEnabled
      ? normalizeFigurineSignText(parsed.data.signText ?? "")
      : null;

    const baseConfig = {
      shape: parsed.data.baseShape,
      baseId: parsed.data.baseId,
      sign: {
        enabled: parsed.data.signEnabled,
        text: signText,
      },
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (!parsed.data.signEnabled || !signText) {
      await jobRef.set(
        {
          baseConfig,
          figurineNamedBase: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      return {
        jobId: parsed.data.jobId,
        status: "saved",
        baseConfig: {
          shape: parsed.data.baseShape,
          baseId: parsed.data.baseId,
          sign: { enabled: false, text: null },
        },
        namedBase: null,
      };
    }

    await jobRef.set(
      {
        baseConfig,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    let namedBase: Awaited<ReturnType<typeof generateFigurineNamedBaseForJob>>;
    try {
      namedBase = await generateFigurineNamedBaseForJob({
        jobRef,
        jobId: parsed.data.jobId,
        uid: request.auth.uid,
        baseId: parsed.data.baseId,
        signText,
      });
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error("figurine named-base generation failed", {
        jobId: parsed.data.jobId,
        error: message,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new HttpsError(
        "internal",
        `Base sign generation failed: ${message.slice(0, 200)}`,
      );
    }

    let assembly: Record<string, unknown>;
    try {
      assembly = await generateFigurineAssemblyForJob({
        jobRef,
        jobId: parsed.data.jobId,
        uid: request.auth.uid,
        jobData: {
          ...jobData,
          baseConfig,
          figurineNamedBase: {
            status: "generated",
            baseId: parsed.data.baseId,
            outputPrefix: namedBase.outputPrefix,
            artifacts: namedBase.artifacts,
          },
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("figurine automatic assembly failed", {
        jobId: parsed.data.jobId,
        error: message,
        stack: error instanceof Error ? error.stack : undefined,
      });
      await jobRef.set(
        {
          figurineAssembly: {
            status: "failed",
            error: { message: message.slice(0, 500) },
            failedAt: FieldValue.serverTimestamp(),
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await refreshJobCostFromFirestore(jobRef, "figurine_assembly_failed");
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        "internal",
        `Figurine assembly failed: ${message.slice(0, 200)}`,
      );
    }

    return {
      jobId: parsed.data.jobId,
      status: "assembled",
      baseConfig: {
        shape: parsed.data.baseShape,
        baseId: parsed.data.baseId,
        sign: { enabled: true, text: namedBase.normalizedName },
      },
      namedBase: {
        baseId: parsed.data.baseId,
        normalizedName: namedBase.normalizedName,
        outputPrefix: namedBase.outputPrefix,
        artifacts: namedBase.artifacts,
        lettering: namedBase.lettering,
      },
      assembly,
    };
  },
);

export const generateFigurineAssembly = onCall(
  {
    secrets: printFileRuntimeSecrets,
    timeoutSeconds: 540,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in before assembling the figurine package.",
      );
    }

    const parsed = generateFigurineAssemblySchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", "jobId is required.");
    }

    const jobRef = db.collection("jobs").doc(parsed.data.jobId);
    const jobSnap = await jobRef.get();
    const jobData = jobSnap.data() as Record<string, unknown> | undefined;
    if (!jobSnap.exists || jobData?.uid !== request.auth.uid) {
      throw new HttpsError("not-found", "Job not found.");
    }
    if (!jobDataIsFigurine(jobData)) {
      throw new HttpsError(
        "failed-precondition",
        "Figurine assembly is only available for figurine jobs.",
      );
    }

    try {
      const assembly = await generateFigurineAssemblyForJob({
        jobRef,
        jobId: parsed.data.jobId,
        uid: request.auth.uid,
        jobData,
      });
      return {
        jobId: parsed.data.jobId,
        status: "assembled",
        assembly,
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error("figurine assembly failed", {
        jobId: parsed.data.jobId,
        error: message,
        stack: error instanceof Error ? error.stack : undefined,
      });
      await jobRef.set(
        {
          figurineAssembly: {
            status: "failed",
            error: { message: message.slice(0, 500) },
            failedAt: FieldValue.serverTimestamp(),
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await refreshJobCostFromFirestore(jobRef, "figurine_assembly_failed");
      throw new HttpsError(
        "internal",
        `Figurine assembly failed: ${message.slice(0, 200)}`,
      );
    }
  },
);

export const runFigurinePrintTooling = onCall(
  {
    secrets: [appStorageBucket, meshyApiKey, adminSupportAllowlist],
    timeoutSeconds: 540,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in before running figurine print tooling.",
      );
    }

    const parsed = runFigurinePrintToolingSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", "jobId is required.");
    }

    const jobRef = db.collection("jobs").doc(parsed.data.jobId);
    const jobSnap = await jobRef.get();
    const jobData = jobSnap.data() as Record<string, unknown> | undefined;
    if (!jobSnap.exists || !jobData) {
      throw new HttpsError("not-found", "Job not found.");
    }
    const jobUid = typeof jobData.uid === "string" ? jobData.uid : null;
    if (jobUid !== request.auth.uid) {
      requireAdminSupport(request);
    }
    if (!jobDataIsFigurine(jobData)) {
      throw new HttpsError(
        "failed-precondition",
        "Print tooling is only available for figurine jobs.",
      );
    }

    try {
      const tooling = await runFigurinePrintToolingForJob({
        jobRef,
        jobId: parsed.data.jobId,
        uid: jobUid ?? request.auth.uid,
        jobData,
      });
      return {
        jobId: parsed.data.jobId,
        status: "completed",
        tooling,
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error("figurine print tooling failed", {
        jobId: parsed.data.jobId,
        error: message,
        stack: error instanceof Error ? error.stack : undefined,
      });
      await jobRef.set(
        {
          figurinePrintTooling: {
            status: "failed",
            error: { message: message.slice(0, 500) },
            failedAt: FieldValue.serverTimestamp(),
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await refreshJobCostFromFirestore(
        jobRef,
        "figurine_print_tooling_failed",
      );
      throw new HttpsError(
        "internal",
        `Figurine print tooling failed: ${message.slice(0, 200)}`,
      );
    }
  },
);
