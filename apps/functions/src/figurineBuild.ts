import {
  FieldValue,
  getFirestore,
  type DocumentReference,
} from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  figurinePreviewWarningsForWorkflow,
  isFigurineStyle,
} from "./figurineWorkflow.js";
import {
  buildCreativeLabFigurineFromPrototype,
  generateDirectMultiImageFigurinePreview,
  generateCreativeLabFigurinePreview,
  MeshyProviderTaskError,
} from "./meshyFigurineProvider.js";
import {
  generateHi3dDirectImageFigurinePreview,
  Hi3dProviderTaskError,
} from "./hi3dFigurineProvider.js";
import { calculateJobCost } from "./jobCost.js";
import {
  normalizeDirectMultiImageProviderSelection,
  type WorkflowFigurineProvider,
  type WorkflowGenerationWorkflow,
} from "./figurineWorkflowConfig.js";

export type FigurineBuildStatus = "queued" | "running" | "ready" | "failed";

export type FigurineBuildRecord = {
  status: FigurineBuildStatus;
  queuedAt?: unknown;
  startedAt?: unknown;
  completedAt?: unknown;
  failedAt?: unknown;
  attempts?: number;
  error?: { message: string; stage: string } | null;
};

export type MirroredArtifact = {
  storagePath: string;
  localPath: string;
};

export type PrintFileLocalMirror =
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
  workflow?: WorkflowGenerationWorkflow;
  prototypeTaskId?: string;
  buildTaskId?: string;
  modelTaskId?: string;
  printabilityTaskId?: string;
  printabilityStatus?: string;
  availableFormats: string[];
  consumedCredits: number | null;
};

function figurineBuildStatus(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const status = (value as { status?: unknown }).status;
  return typeof status === "string" ? status : null;
}

export function jobDataIsFigurine(
  jobData: Record<string, unknown> | undefined,
): boolean {
  return (
    jobData?.productType === "figurine" ||
    (typeof jobData?.selectedStyle === "string" &&
      isFigurineStyle(jobData.selectedStyle))
  );
}

// The trigger writes the doc it watches, so it must gate strictly on the
// transition INTO "queued": echo writes (queued -> running, running -> ready)
// and unrelated job updates while queued must not re-enter the build.
export function shouldRunFigurineBuild(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): boolean {
  if (!after || !jobDataIsFigurine(after)) {
    return false;
  }
  return (
    figurineBuildStatus(after.figurineBuild) === "queued" &&
    figurineBuildStatus(before?.figurineBuild) !== "queued"
  );
}

// Base/body assembly needs the built figurine GLB. Under the funded-build
// inversion that body exists only post-payment, so pre-payment base naming
// must skip assembly instead of failing the callable.
export function figurinePreviewReadyForAssembly(
  jobData: Record<string, unknown>,
): boolean {
  const figurinePreview = jobData.figurinePreview as
    | { previewGlb?: unknown; status?: unknown }
    | null
    | undefined;
  return (
    figurinePreview?.status === "preview_ready" &&
    typeof figurinePreview.previewGlb === "string" &&
    figurinePreview.previewGlb.length > 0
  );
}

// Transaction payload claiming queued -> running. This claim is the only
// thing standing between a duplicate Stripe delivery and a double provider
// spend, so it must refuse every non-queued state.
export function claimFigurineBuildUpdate(
  figurineBuild: unknown,
): Record<string, unknown> | null {
  if (figurineBuildStatus(figurineBuild) !== "queued") {
    return null;
  }
  return {
    status: "running",
    startedAt: FieldValue.serverTimestamp(),
  };
}

export function requeueFigurineBuildUpdate(
  figurineBuild: unknown,
): Record<string, unknown> | null {
  if (figurineBuildStatus(figurineBuild) !== "failed") {
    return null;
  }
  const attempts =
    typeof (figurineBuild as { attempts?: unknown }).attempts === "number"
      ? (figurineBuild as { attempts: number }).attempts
      : 0;
  return {
    status: "queued",
    queuedAt: FieldValue.serverTimestamp(),
    attempts: attempts + 1,
    error: null,
  };
}

// Stripe redelivers webhooks. Stamping "queued" over an existing record would
// reset a running/finished build back to queued and double-build, so the
// stamp only applies when no figurineBuild record exists at all.
export function shouldQueueFigurineBuildOnPayment(
  jobData: Record<string, unknown> | undefined,
): boolean {
  if (!jobData || !jobDataIsFigurine(jobData)) {
    return false;
  }
  return jobData.figurineBuild === undefined || jobData.figurineBuild === null;
}

export function buildFigurineGenerationError(error: unknown) {
  let message = "Figurine preview generation did not complete.";
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    message =
      cause instanceof Error
        ? `${error.message} (cause: ${cause.message})`
        : error.message;
  }
  if (
    error instanceof MeshyProviderTaskError ||
    error instanceof Hi3dProviderTaskError
  ) {
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

export function buildLocalMirrorError(error: unknown): PrintFileLocalMirror {
  const message =
    error instanceof Error ? error.message : "local_mirror_failed";
  return {
    status: "skipped",
    reason: `local_mirror_failed: ${message.slice(0, 240)}`,
  };
}

export async function refreshJobCostFromFirestore(
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

export function resolveRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

export function firestoreSafeValue(
  value: unknown,
  insideArray = false,
): unknown {
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

function listFigurinePreviewArtifactPaths(input: {
  previewGlb: string;
  metadataPath: string;
  thumbnailPath: string | null;
}): string[] {
  return [input.previewGlb, input.metadataPath, input.thumbnailPath].filter(
    (artifactPath): artifactPath is string => Boolean(artifactPath),
  );
}

export function localMirrorIsEnabled(): boolean {
  return (
    process.env.FUNCTIONS_EMULATOR === "true" ||
    Boolean(process.env.PRINT_FILE_LOCAL_MIRROR_DIR?.trim())
  );
}

export function initialPrintFileLocalMirror(): PrintFileLocalMirror {
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

export async function mirrorStoragePathsToLocalTmp(input: {
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

export async function mirrorFigurinePreviewToLocalTmp(input: {
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
      workflow?: unknown;
      thumbnailPath?: unknown;
      prototypeTask?: { id?: unknown; consumed_credits?: unknown };
      buildTask?: { id?: unknown; consumed_credits?: unknown };
      modelTask?: { id?: unknown; consumed_credits?: unknown };
      printabilityTask?: {
        id?: unknown;
        consumed_credits?: unknown;
        printability?: { status?: unknown };
      };
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
    const modelCredits =
      typeof metadata.modelTask?.consumed_credits === "number"
        ? metadata.modelTask.consumed_credits
        : 0;
    const printabilityCredits =
      typeof metadata.printabilityTask?.consumed_credits === "number"
        ? metadata.printabilityTask.consumed_credits
        : 0;
    const workflow =
      metadata.workflow === "direct_multi_image_to_3d"
        ? "direct_multi_image_to_3d"
        : "creative_lab_figure";

    return {
      previewGlb,
      thumbnailPath:
        typeof metadata.thumbnailPath === "string"
          ? metadata.thumbnailPath
          : null,
      metadataPath,
      workflow,
      prototypeTaskId:
        typeof metadata.prototypeTask?.id === "string"
          ? metadata.prototypeTask.id
          : undefined,
      buildTaskId:
        typeof metadata.buildTask?.id === "string"
          ? metadata.buildTask.id
          : undefined,
      modelTaskId:
        typeof metadata.modelTask?.id === "string"
          ? metadata.modelTask.id
          : undefined,
      printabilityTaskId:
        typeof metadata.printabilityTask?.id === "string"
          ? metadata.printabilityTask.id
          : undefined,
      printabilityStatus:
        typeof metadata.printabilityTask?.printability?.status === "string"
          ? metadata.printabilityTask.printability.status
          : undefined,
      availableFormats,
      consumedCredits:
        prototypeCredits || buildCredits || modelCredits || printabilityCredits
          ? prototypeCredits + buildCredits + modelCredits + printabilityCredits
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
      workflow: "creative_lab_figure",
      availableFormats: ["glb"],
      consumedCredits: null,
    };
  }
}

// Secret-backed values are injected into process.env at runtime for the
// functions that declare them (defineSecret().value() reads the same env),
// so these resolvers are behaviorally identical to the pre-extraction ones.
export function resolveMeshyApiKeyForFigurine(): string {
  if (process.env.MESHY_FIGURINE_PROVIDER_MODE === "fixture") {
    return process.env.MESHY_API_KEY ?? "fixture";
  }

  const value = process.env.MESHY_API_KEY?.trim();
  if (!value) {
    throw new Error(
      "MESHY_API_KEY is required for figurine preview generation.",
    );
  }

  return value;
}

function resolveHi3dCredentialsForFigurine(): {
  accessKey: string;
  secretKey: string;
} {
  const accessKey = process.env.HI3D_ACCESS_KEY?.trim();
  const secretKey = process.env.HI3D_SECRET_KEY?.trim();
  if (!accessKey || !secretKey) {
    throw new Error(
      "HI3D_ACCESS_KEY and HI3D_SECRET_KEY are required for Hi3D figurine preview generation.",
    );
  }

  return { accessKey, secretKey };
}

// The funded figurine 3D build: the exact provider path the approval flow ran
// before the funded-build inversion (plan §4b), extracted unchanged. Routes on
// the provider fields stamped at job creation, stores print-files/… artifacts,
// figurinePreview fields, and jobCost rows.
export async function runFigurineBuild(input: {
  jobRef: DocumentReference;
  jobId: string;
  uid: string;
  selectedImagePath: string;
  generationWorkflow: WorkflowGenerationWorkflow;
  provider: WorkflowFigurineProvider;
  providerModel: string;
  prototypeTaskId?: string;
}): Promise<Awaited<ReturnType<typeof generateCreativeLabFigurinePreview>>> {
  const startedAt = Date.now();
  // Fixture mode always runs through the Meshy fixture generator so emulator
  // and test flows never call a paid provider.
  const useHi3dDirect =
    input.generationWorkflow === "direct_multi_image_to_3d" &&
    input.provider === "hi3d" &&
    process.env.MESHY_FIGURINE_PROVIDER_MODE !== "fixture";
  const modelId =
    input.generationWorkflow === "direct_multi_image_to_3d"
      ? useHi3dDirect
        ? "hi3d-direct-original"
        : "direct-multi-image-original"
      : "creative-lab-original";
  const outputPrefix = `print-files/${input.uid}/${input.jobId}/figurine/${modelId}`;
  const bucketName = resolveRequiredEnv("APP_STORAGE_BUCKET");
  const requestWarnings = figurinePreviewWarningsForWorkflow(
    input.generationWorkflow,
  );

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
        warnings: requestWarnings,
      },
      figurineGeneration: {
        provider: useHi3dDirect ? "hi3d" : "meshy",
        workflow: input.generationWorkflow,
        modelId,
        ...(input.generationWorkflow === "direct_multi_image_to_3d"
          ? { providerModel: input.providerModel }
          : {}),
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
        provider: (useHi3dDirect ? "hi3d" : "meshy") as "meshy" | "hi3d",
        workflow: existingAsset.workflow ?? input.generationWorkflow,
        modelId,
        previewGlb: existingAsset.previewGlb,
        thumbnailPath: existingAsset.thumbnailPath,
        metadataPath: existingAsset.metadataPath,
        prototypeTaskId: existingAsset.prototypeTaskId,
        buildTaskId: existingAsset.buildTaskId,
        modelTaskId: existingAsset.modelTaskId,
        printabilityTaskId: existingAsset.printabilityTaskId,
        printabilityStatus: existingAsset.printabilityStatus,
        availableFormats: existingAsset.availableFormats,
        consumedCredits: existingAsset.consumedCredits,
        status: "preview_ready" as const,
      }
    : useHi3dDirect
      ? await generateHi3dDirectImageFigurinePreview({
          jobId: input.jobId,
          uid: input.uid,
          sourceImagePath: input.selectedImagePath,
          outputPrefix,
          modelId,
          providerModel: input.providerModel,
          ...resolveHi3dCredentialsForFigurine(),
        })
      : input.generationWorkflow === "direct_multi_image_to_3d"
        ? await generateDirectMultiImageFigurinePreview({
            jobId: input.jobId,
            uid: input.uid,
            sourceImagePath: input.selectedImagePath,
            outputPrefix,
            modelId,
            apiKey: resolveMeshyApiKeyForFigurine(),
          })
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

  const generationWarnings = figurinePreviewWarningsForWorkflow(
    generation.workflow,
  );
  const modelRecord = {
    modelId: generation.modelId,
    provider: generation.provider,
    workflow: generation.workflow,
    ...(generation.buildTaskId
      ? { providerTaskId: generation.buildTaskId }
      : generation.modelTaskId
        ? { providerTaskId: generation.modelTaskId }
        : {}),
    ...(generation.prototypeTaskId
      ? { prototypeTaskId: generation.prototypeTaskId }
      : {}),
    ...(generation.modelTaskId ? { modelTaskId: generation.modelTaskId } : {}),
    ...(generation.printabilityTaskId
      ? { printabilityTaskId: generation.printabilityTaskId }
      : {}),
    ...(generation.printabilityStatus
      ? { printabilityStatus: generation.printabilityStatus }
      : {}),
    status: "preview_ready",
    requestedFormats:
      generation.workflow === "direct_multi_image_to_3d"
        ? generation.provider === "hi3d"
          ? ["glb"]
          : ["glb", "stl", "3mf"]
        : ["glb"],
    availableFormats: generation.availableFormats,
    storagePaths: {
      previewGlb: generation.previewGlb,
      thumbnail: generation.thumbnailPath,
      metadataJson: generation.metadataPath,
    },
    warnings: generationWarnings,
    consumedCredits: generation.consumedCredits,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const figurineGeneration = {
    provider: generation.provider,
    workflow: generation.workflow,
    modelId: generation.modelId,
    status: existingAsset ? "recovered_existing_preview" : generation.status,
    outputPrefix,
    ...(generation.prototypeTaskId
      ? { prototypeTaskId: generation.prototypeTaskId }
      : {}),
    ...(generation.buildTaskId ? { buildTaskId: generation.buildTaskId } : {}),
    ...(generation.modelTaskId ? { modelTaskId: generation.modelTaskId } : {}),
    ...(generation.printabilityTaskId
      ? { printabilityTaskId: generation.printabilityTaskId }
      : {}),
    ...(generation.printabilityStatus
      ? { printabilityStatus: generation.printabilityStatus }
      : {}),
    availableFormats: generation.availableFormats,
    consumedCredits: generation.consumedCredits,
    completedAt: FieldValue.serverTimestamp(),
  };

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
      models: [modelRecord],
      figurinePreview: {
        status: "preview_ready",
        previewGlb: generation.previewGlb,
        printReadiness: "needs_review",
        warnings: generationWarnings,
        provider: generation.provider,
        workflow: generation.workflow,
        modelId: generation.modelId,
        metadataJson: generation.metadataPath,
        thumbnail: generation.thumbnailPath,
        updatedAt: FieldValue.serverTimestamp(),
      },
      figurineGeneration,
      printFileStatus: "not_applicable",
      printFileArtifacts: null,
      printability: {
        status: "needs_review",
        checks: [
          generation.workflow === "direct_multi_image_to_3d"
            ? "Direct Multi-Image-to-3D textured GLB stored for preview only."
            : "Creative Lab original textured GLB stored for preview only.",
        ],
        warnings: generationWarnings,
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

type FigurineBuildJobInputs = {
  uid: string;
  approvedImagePath: string;
  generationWorkflow: WorkflowGenerationWorkflow;
  provider: WorkflowFigurineProvider;
  providerModel: string;
  prototypeTaskId?: string;
};

// Mirrors the input assembly the approval path used before the funded-build
// inversion (jobs created before provider selection existed resolve to the
// current default through the normalizer).
function resolveFigurineBuildInputs(
  jobData: Record<string, unknown>,
): FigurineBuildJobInputs {
  const uid = typeof jobData.uid === "string" ? jobData.uid : "";
  const approvedImagePath =
    typeof jobData.approvedImagePath === "string"
      ? jobData.approvedImagePath
      : "";
  if (!uid || !approvedImagePath) {
    throw new Error(
      "Funded figurine build is missing uid or approvedImagePath on the job document.",
    );
  }
  const generationWorkflow: WorkflowGenerationWorkflow =
    jobData.generated3dWorkflow === "direct_multi_image_to_3d"
      ? "direct_multi_image_to_3d"
      : "creative_lab_figure";
  const providerSelection =
    generationWorkflow === "direct_multi_image_to_3d"
      ? normalizeDirectMultiImageProviderSelection({
          provider: jobData.generated3dProvider,
          providerModel: jobData.generated3dProviderModel,
        })
      : { provider: "meshy" as const, providerModel: "" };
  const figurineConcept = jobData.figurineConcept as
    | { prototypeTaskId?: unknown }
    | undefined;
  const storedPrototypeTaskId =
    typeof figurineConcept?.prototypeTaskId === "string" &&
    figurineConcept.prototypeTaskId
      ? figurineConcept.prototypeTaskId
      : undefined;
  return {
    uid,
    approvedImagePath,
    generationWorkflow,
    provider: providerSelection.provider,
    providerModel: providerSelection.providerModel,
    prototypeTaskId: storedPrototypeTaskId,
  };
}

async function recordFigurineBuildFailure(input: {
  jobRef: DocumentReference;
  jobId: string;
  error: unknown;
}): Promise<void> {
  const db = getFirestore();
  const generationError = buildFigurineGenerationError(input.error);
  console.error("funded figurine build failed", {
    jobId: input.jobId,
    error: generationError.message,
    providerTask:
      "providerTask" in generationError
        ? generationError.providerTask
        : undefined,
    stack: input.error instanceof Error ? input.error.stack : undefined,
  });

  // Money has been taken; this failure must surface loudly (admin support +
  // order production state) and stay re-queueable. It must NOT surface
  // through customer-facing channels (job.error / status) — the customer
  // keeps seeing their order in production while support handles it.
  const noteBody =
    `Funded figurine build failed: ${generationError.message}`.slice(0, 2000);
  const noteRef = input.jobRef.collection("supportNotes").doc();
  const batch = db.batch();
  batch.set(noteRef, {
    body: noteBody,
    statusChange: "open",
    createdAt: FieldValue.serverTimestamp(),
    createdByUid: "system:onFigurineBuildQueued",
    createdByEmail: null,
  });
  batch.set(
    input.jobRef,
    {
      figurineBuild: {
        status: "failed",
        failedAt: FieldValue.serverTimestamp(),
        error: {
          message: generationError.message.slice(0, 300),
          stage: generationError.stage,
        },
      },
      figurinePreview: {
        status: "failed",
        previewGlb: null,
        printReadiness: "needs_review",
      },
      figurineGeneration: {
        status: "failed",
        failedAt: FieldValue.serverTimestamp(),
      },
      supportSummary: {
        status: "open",
        noteCount: FieldValue.increment(1),
        lastNoteAt: FieldValue.serverTimestamp(),
        lastNoteByUid: "system:onFigurineBuildQueued",
        lastNoteByEmail: null,
        lastNotePreview: noteBody.slice(0, 160),
        updatedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  batch.set(
    db.collection("orders").doc(input.jobId),
    {
      fulfillment: {
        productionSubState: "build_failed",
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await batch.commit();
  await refreshJobCostFromFirestore(
    input.jobRef,
    "funded_figurine_build_failed",
  );
}

// Runs the post-payment figurine 3D build. The Stripe webhook (or the admin
// requeue callable) stamps figurineBuild "queued"; this trigger claims
// queued -> running in a transaction — the idempotency guard against
// duplicate Stripe deliveries and against the echo writes this trigger
// itself makes to the document it watches — then executes the same provider
// path approval used to run before the funded-build inversion.
export const onFigurineBuildQueued = onDocumentWritten(
  {
    document: "jobs/{jobId}",
    // Hi3D runs ~7-8 minutes plus asset transfer; 1800s leaves margin.
    timeoutSeconds: 1800,
    secrets: [
      "APP_STORAGE_BUCKET",
      "MESHY_API_KEY",
      "HI3D_ACCESS_KEY",
      "HI3D_SECRET_KEY",
    ],
  },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!shouldRunFigurineBuild(before, after)) {
      return;
    }

    const jobId = event.params.jobId;
    const db = getFirestore();
    const jobRef = db.collection("jobs").doc(jobId);

    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(jobRef);
      const jobData = snap.data();
      const claim = claimFigurineBuildUpdate(jobData?.figurineBuild);
      if (!snap.exists || !jobData || !claim) {
        return null;
      }
      tx.set(
        jobRef,
        {
          figurineBuild: claim,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return jobData;
    });

    if (!claimed) {
      console.info(
        "figurine build not claimed (already claimed or not queued)",
        { jobId },
      );
      return;
    }

    console.info("figurine build claimed", { jobId });

    try {
      const inputs = resolveFigurineBuildInputs(claimed);
      await runFigurineBuild({
        jobRef,
        jobId,
        uid: inputs.uid,
        selectedImagePath: inputs.approvedImagePath,
        generationWorkflow: inputs.generationWorkflow,
        provider: inputs.provider,
        providerModel: inputs.providerModel,
        prototypeTaskId: inputs.prototypeTaskId,
      });
      await jobRef.set(
        {
          figurineBuild: {
            status: "ready",
            completedAt: FieldValue.serverTimestamp(),
            error: null,
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      console.info("funded figurine build ready", { jobId });
    } catch (error) {
      await recordFigurineBuildFailure({ jobRef, jobId, error });
    }
  },
);
