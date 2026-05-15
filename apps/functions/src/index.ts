import { initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  getFirestore,
  type DocumentReference,
} from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import Stripe from "stripe";
import { z } from "zod";

import { createPosterAiProvider } from "./aiProvider.js";

initializeApp();

const db = getFirestore();
const vertexApiKey = defineSecret("VERTEX_API_KEY");
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");
const jobIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/);

const createJobSchema = z.object({
  jobId: jobIdSchema,
  sourceImagePath: z.string().min(1),
  selectedStyle: z.string().min(1),
});

const checkoutSchema = z.object({
  jobId: jobIdSchema,
});

const approveGeneratedImageSchema = z.object({
  jobId: jobIdSchema,
  imagePath: z.string().min(1),
});

const defaultReliefSettings = {
  height_provider: "masked_depth_detail_blend",
  detail_source: "lithophane_baseline",
  target_width_px: 200,
} as const;

const defaultPhysicalDimensions = {
  target_width_mm: 139.7,
  target_height_mm: 190.5,
  image_window_width_mm: 127.0,
  image_window_height_mm: 177.8,
  border_mm: 6.35,
} as const;

type CheckoutSessionWebhookObject = {
  metadata?: Record<string, string> | null;
  payment_intent?: string | null | object;
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
    height_provider: z.string().min(1).optional(),
    height_provider_policy: z.string().min(1).optional(),
    height_provider_fallback_only: z.boolean().optional(),
    height_provider_target_quality_path: z.boolean().optional(),
    height_provider_checkout_default_allowed: z.boolean().optional(),
    provider_audit: z
      .record(z.string(), providerAuditEntrySchema)
      .optional(),
    segmentation_status: segmentationStatusSchema.optional(),
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
      providerAudit: Record<string, z.infer<typeof providerAuditEntrySchema>> | null;
      segmentationStatus: z.infer<typeof segmentationStatusSchema> | null;
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
      status: "skipped";
      reason: string;
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
    fullColorVrml: gcsUriToStoragePath(bucketName, artifactPaths.full_color_vrml),
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
  ];
}

function localMirrorIsEnabled(): boolean {
  return (
    process.env.FUNCTIONS_EMULATOR === "true" ||
    Boolean(process.env.PRINT_FILE_LOCAL_MIRROR_DIR?.trim())
  );
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

async function mirrorPrintFileArtifactsToLocalTmp(input: {
  bucketName: string;
  artifacts: PrintFileArtifacts;
}): Promise<PrintFileLocalMirror> {
  if (!localMirrorIsEnabled()) {
    return {
      status: "skipped",
      reason: "local_mirror_disabled",
    };
  }

  const mirrorRoot = await resolveLocalMirrorRoot();
  const bucket = getStorage().bucket(input.bucketName);
  const artifactPaths = listPrintFileArtifactPaths(input.artifacts);
  const mirroredArtifacts: MirroredArtifact[] = [];

  for (const storagePath of artifactPaths) {
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
      providerAudit: parsed.data.provider_audit ?? null,
      segmentationStatus: parsed.data.segmentation_status ?? null,
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
  const serviceUrl = resolveRequiredEnv("PRINT_FILE_GENERATOR_URL").replace(
    /\/$/,
    "",
  );
  const bucketName = resolveRequiredEnv("APP_STORAGE_BUCKET");
  const outputPrefix = `print-files/${input.uid}/${input.jobId}`;

  const response = await fetch(`${serviceUrl}/v1/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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
  const printFileLocalMirror = await mirrorPrintFileArtifactsToLocalTmp({
    bucketName,
    artifacts,
  });

  await input.jobRef.set(
    {
      printFileStatus: "generated",
      printFileOutputPrefix: outputPrefix,
      printFileArtifacts: artifacts,
      printability: parsed.data.printability,
      printFileAudit,
      printFileLocalMirror,
      printFileGeneration: {
        provider: "print-file-generator",
        status: parsed.data.status,
        completedAt: FieldValue.serverTimestamp(),
      },
      printFileError: null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await input.jobRef.collection("audit").doc("printFileGeneration").set(
    printFileAudit,
    { merge: true },
  );

  return artifacts;
}

export const createGenerationJob = onCall(
  {
    secrets: [vertexApiKey],
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

    const jobRef = db.collection("jobs").doc(parsed.data.jobId);
    const existingJob = await jobRef.get();
    if (existingJob.exists) {
      const existingJobData = existingJob.data();
      const isSameUpload =
        existingJobData?.uid === request.auth.uid &&
        existingJobData.sourceImagePath === parsed.data.sourceImagePath &&
        existingJobData.selectedStyle === parsed.data.selectedStyle;

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
      status: "generating",
      sourceImagePath: parsed.data.sourceImagePath,
      selectedStyle: parsed.data.selectedStyle,
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
        selectedStyle: parsed.data.selectedStyle,
      });
      const proofStoragePath =
        generation.status === "stubbed"
          ? parsed.data.sourceImagePath
          : generation.generatedImagePaths[0];

      if (!proofStoragePath) {
        throw new Error("AI provider returned no generated proof image path.");
      }

      await jobRef.set(
        {
          status: "preview_ready",
          generatedImages: [
            {
              id: "preview-1",
              label:
                generation.status === "stubbed"
                  ? "Source photo proof"
                  : "Generated poster proof",
              storagePath: proofStoragePath,
              status: "ready",
              isPlaceholder: generation.status === "stubbed",
            },
          ],
          aiGeneration: {
            provider: generation.provider,
            status: generation.status,
            generatedImagePaths: generation.generatedImagePaths,
            metadata: generation.metadata,
            completedAt: FieldValue.serverTimestamp(),
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

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

      throw new HttpsError(
        "internal",
        "Poster generation failed before a proof was ready.",
      );
    }
  },
);

export const approveGeneratedImage = onCall(async (request) => {
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

  await jobRef.set(
    {
      status: "approved",
      approvedImagePath: parsed.data.imagePath,
      approvedAt: FieldValue.serverTimestamp(),
      printFileStatus: "generating",
      printFileOutputPrefix: `print-files/${request.auth.uid}/${parsed.data.jobId}`,
      printFileError: null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  let printFileArtifacts: PrintFileArtifacts;
  try {
    printFileArtifacts = await generatePrintFilesForApprovedJob({
      jobRef,
      jobId: jobRef.id,
      uid: request.auth.uid,
      selectedImagePath: parsed.data.imagePath,
      selectedStyle:
        typeof jobData.selectedStyle === "string" ? jobData.selectedStyle : "",
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
});

export const createCheckoutSession = onCall(
  {
    secrets: [stripeSecretKey],
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
      jobData.printFileStatus !== "generated" ||
      typeof printFileArtifacts?.modelStl !== "string" ||
      typeof printFileArtifacts.previewGlb !== "string"
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
    ].join(":");

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        success_url: `${appUrl}/orders/${orderRef.id}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/jobs/${parsed.data.jobId}?checkout=cancelled`,
        shipping_address_collection: {
          allowed_countries: ["US", "CA"],
        },
        line_items: posterPriceId
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
            ],
        metadata: {
          uid: request.auth.uid,
          jobId: parsed.data.jobId,
          orderId: orderRef.id,
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
        priceSnapshot: {
          currency: "usd",
          unitAmount: 6000,
          stripePriceId: posterPriceId ?? null,
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

      if (orderId) {
        await db
          .collection("orders")
          .doc(orderId)
          .set(
            {
              status: "paid",
              paymentStatus: "paid",
              stripePaymentIntentId:
                typeof session.payment_intent === "string"
                  ? session.payment_intent
                  : null,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
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
