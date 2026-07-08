import { readFile } from "node:fs/promises";

import { getStorage } from "firebase-admin/storage";

const meshyOpenApiRoot = "https://api.meshy.ai/openapi";
const meshyOpenApiV1Root = `${meshyOpenApiRoot}/v1`;
const terminalStatuses = new Set(["SUCCEEDED", "FAILED", "CANCELED", "EXPIRED"]);
const defaultPollIntervalMs = 10_000;
const defaultTimeoutMs = 60 * 60 * 1000;
const defaultSourceImageByteLimit = 8 * 1024 * 1024;

type MeshyTask = {
  id?: string;
  type?: string;
  status?: string;
  progress?: number;
  created_at?: string;
  started_at?: string;
  finished_at?: string;
  expires_at?: string;
  consumed_credits?: number;
  preceding_tasks?: string[];
  task_error?: unknown;
  model_urls?: Record<string, string | undefined>;
  thumbnail_url?: string;
  texture_urls?: Array<Record<string, string | undefined>>;
  image_urls?: string[];
  printability?: unknown;
};

type MeshyJsonResponse = {
  result?: string;
  message?: string;
  error?: string;
};

type MeshyApiVersion = "base" | "v1";

export type SanitizedMeshyTaskError = string | number | boolean | null | {
  [key: string]: SanitizedMeshyTaskError;
} | SanitizedMeshyTaskError[];

export class MeshyProviderTaskError extends Error {
  readonly provider = "meshy";
  readonly taskId: string;
  readonly label: string;
  readonly status: string | null;
  readonly progress: number | null;
  readonly consumedCredits: number | null;
  readonly taskError: SanitizedMeshyTaskError;

  constructor(input: {
    taskId: string;
    label: string;
    task: MeshyTask;
  }) {
    const status = input.task.status ?? "unknown";
    const taskError = sanitizeMeshyTaskError(input.task.task_error);
    const providerDetail = formatSanitizedTaskError(taskError);
    super(
      `Meshy ${input.label} task ${input.taskId} ended with status ${status}` +
        (providerDetail ? `. Provider error: ${providerDetail}` : "."),
    );
    this.name = "MeshyProviderTaskError";
    this.taskId = input.taskId;
    this.label = input.label;
    this.status = input.task.status ?? null;
    this.progress =
      typeof input.task.progress === "number" ? input.task.progress : null;
    this.consumedCredits =
      typeof input.task.consumed_credits === "number"
        ? input.task.consumed_credits
        : null;
    this.taskError = taskError;
  }
}

export type FigurineProviderInput = {
  jobId: string;
  uid: string;
  sourceImagePath: string;
  outputPrefix: string;
  modelId: string;
  apiKey: string;
};

export type FigurineProviderOutput = {
  provider: "meshy" | "hi3d";
  workflow: "creative_lab_figure" | "direct_multi_image_to_3d";
  modelId: string;
  previewGlb: string;
  thumbnailPath: string | null;
  metadataPath: string;
  prototypeTaskId?: string;
  buildTaskId?: string;
  modelTaskId?: string;
  printabilityTaskId?: string;
  printabilityStatus?: string;
  availableFormats: string[];
  consumedCredits: number | null;
  status: "preview_ready";
};

export type DirectMultiImageTo3dRequest = {
  image_urls: string[];
  ai_model: "meshy-6";
  should_texture: true;
  enable_pbr: false;
  should_remesh: true;
  image_enhancement: true;
  remove_lighting: true;
  moderation: true;
  target_formats: ["glb", "stl", "3mf"];
  target_polycount: 100000;
  save_pre_remeshed_model: true;
};

export async function generateCreativeLabFigurinePreview(
  input: FigurineProviderInput,
): Promise<FigurineProviderOutput> {
  if (process.env.MESHY_FIGURINE_PROVIDER_MODE === "fixture") {
    return generateFixtureFigurinePreview(input);
  }

  const sourceImage = await readStorageImage(input.sourceImagePath);
  const imageByteLimit = resolvePositiveIntegerEnv(
    "MESHY_MAX_SOURCE_IMAGE_BYTES",
    defaultSourceImageByteLimit,
  );
  if (sourceImage.buffer.byteLength > imageByteLimit) {
    throw new Error(
      `Figurine source image is ${sourceImage.buffer.byteLength} bytes, which exceeds the configured Meshy inline image limit of ${imageByteLimit} bytes.`,
    );
  }

  const imageUrl = `data:${sourceImage.contentType};base64,${sourceImage.buffer.toString("base64")}`;
  const { prototypeTaskId, prototypeTask } = await runPrototypePhase({
    apiKey: input.apiKey,
    imageUrl,
    name: `job-${input.jobId}`.slice(0, 120),
  });

  return runBuildPhase(input, prototypeTaskId, prototypeTask);
}

export function buildDirectMultiImageTo3dRequest(
  imageUrls: string[],
): DirectMultiImageTo3dRequest {
  return {
    image_urls: imageUrls,
    ai_model: "meshy-6",
    should_texture: true,
    enable_pbr: false,
    should_remesh: true,
    image_enhancement: true,
    remove_lighting: true,
    moderation: true,
    target_formats: ["glb", "stl", "3mf"],
    target_polycount: 100000,
    save_pre_remeshed_model: true,
  };
}

export function buildMeshyOpenApiUrl(
  endpoint: string,
  input: { apiVersion?: MeshyApiVersion } = {},
): string {
  const root = input.apiVersion === "v1" ? meshyOpenApiV1Root : meshyOpenApiRoot;
  return `${root}${endpoint}`;
}

export async function generateDirectMultiImageFigurinePreview(
  input: FigurineProviderInput,
): Promise<FigurineProviderOutput> {
  if (process.env.MESHY_FIGURINE_PROVIDER_MODE === "fixture") {
    return generateFixtureFigurinePreview(input, "direct_multi_image_to_3d");
  }

  const sourceImage = await readStorageImage(input.sourceImagePath);
  const imageByteLimit = resolvePositiveIntegerEnv(
    "MESHY_MAX_SOURCE_IMAGE_BYTES",
    defaultSourceImageByteLimit,
  );
  if (sourceImage.buffer.byteLength > imageByteLimit) {
    throw new Error(
      `Figurine source image is ${sourceImage.buffer.byteLength} bytes, which exceeds the configured Meshy inline image limit of ${imageByteLimit} bytes.`,
    );
  }

  const imageUrl = `data:${sourceImage.contentType};base64,${sourceImage.buffer.toString("base64")}`;
  const modelTaskId = await createDirectMultiImageTo3dTask({
    apiKey: input.apiKey,
    imageUrls: [imageUrl],
  });
  const modelTask = await pollMeshyTask({
    apiKey: input.apiKey,
    endpoint: "/multi-image-to-3d",
    apiVersion: "v1",
    taskId: modelTaskId,
    label: "direct multi-image-to-3d",
  });

  if (modelTask.status !== "SUCCEEDED") {
    throw new MeshyProviderTaskError({
      taskId: modelTaskId,
      label: "direct multi-image-to-3d",
      task: modelTask,
    });
  }

  const glbUrl = modelTask.model_urls?.glb;
  if (!glbUrl) {
    throw new Error("Meshy direct Multi-Image-to-3D returned no GLB model URL.");
  }

  const savedAssets = await saveDirectModelTaskAssets(input, modelTask);
  let printabilityTaskId: string | undefined;
  let printabilityTask: MeshyTask | undefined;
  try {
    printabilityTaskId = await createPrintabilityTask({
      apiKey: input.apiKey,
      inputTaskId: modelTaskId,
    });
    printabilityTask = await pollMeshyTask({
      apiKey: input.apiKey,
      endpoint: "/print/analyze",
      apiVersion: "v1",
      taskId: printabilityTaskId,
      label: "direct multi-image printability",
    });
  } catch (error) {
    console.warn("Meshy direct Multi-Image-to-3D printability analysis failed", {
      jobId: input.jobId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const previewGlb = `${input.outputPrefix}/model.glb`;
  const metadataPath = `${input.outputPrefix}/metadata.json`;
  const bucket = getConfiguredStorageBucket();
  const availableFormats = Object.entries(modelTask.model_urls ?? {})
    .filter(([, url]) => Boolean(url))
    .map(([format]) => format);
  const providerMetadata = {
    provider: "meshy",
    workflow: "direct_multi_image_to_3d",
    modelId: input.modelId,
    sourceImagePath: input.sourceImagePath,
    previewGlb,
    thumbnailPath: savedAssets.thumbnailPath,
    modelTask: sanitizeTask(modelTask),
    printabilityTask: printabilityTask ? sanitizePrintabilityTask(printabilityTask) : null,
    availableFormats,
    savedAssets: savedAssets.assets,
    canonicalUpstreamAsset: "model.glb",
    downstreamPrintTooling: "not_run",
    printReadiness: "needs_review",
    createdAt: new Date().toISOString(),
  };
  await bucket.file(metadataPath).save(JSON.stringify(providerMetadata, null, 2), {
    resumable: false,
    metadata: {
      contentType: "application/json",
      cacheControl: "private, max-age=3600",
      metadata: storageMetadata(input, "direct-multi-image-metadata", "direct_multi_image_to_3d"),
    },
  });

  return {
    provider: "meshy",
    workflow: "direct_multi_image_to_3d",
    modelId: input.modelId,
    previewGlb,
    thumbnailPath: savedAssets.thumbnailPath,
    metadataPath,
    modelTaskId,
    printabilityTaskId,
    printabilityStatus: printabilityStatus(printabilityTask),
    availableFormats,
    consumedCredits: sumConsumedCredits(
      modelTask,
      ...(printabilityTask ? [printabilityTask] : []),
    ),
    status: "preview_ready",
  };
}

async function runPrototypePhase(input: {
  apiKey: string;
  imageUrl: string;
  name: string;
}): Promise<{ prototypeTaskId: string; prototypeTask: MeshyTask }> {
  const prototypeTaskId = await createPrototypeTask({
    apiKey: input.apiKey,
    imageUrl: input.imageUrl,
    name: input.name,
  });
  const prototypeTask = await pollMeshyTask({
    apiKey: input.apiKey,
    endpoint: "/creative-lab/figure/v1/prototype",
    taskId: prototypeTaskId,
    label: "figure prototype",
  });

  if (prototypeTask.status !== "SUCCEEDED") {
    throw new MeshyProviderTaskError({
      taskId: prototypeTaskId,
      label: "figure prototype",
      task: prototypeTask,
    });
  }

  return { prototypeTaskId, prototypeTask };
}

async function runBuildPhase(
  input: {
    jobId: string;
    uid: string;
    sourceImagePath?: string;
    outputPrefix: string;
    modelId: string;
    apiKey: string;
  },
  prototypeTaskId: string,
  prototypeTask: MeshyTask,
): Promise<FigurineProviderOutput> {
  const name = `job-${input.jobId}`.slice(0, 120);
  const buildTaskId = await createBuildTask({
    apiKey: input.apiKey,
    prototypeTaskId,
    name,
  });
  const buildTask = await pollMeshyTask({
    apiKey: input.apiKey,
    endpoint: "/creative-lab/figure/v1/build",
    taskId: buildTaskId,
    label: "figure build",
  });

  if (buildTask.status !== "SUCCEEDED") {
    throw new MeshyProviderTaskError({
      taskId: buildTaskId,
      label: "figure build",
      task: buildTask,
    });
  }

  const glbUrl = buildTask.model_urls?.glb;
  if (!glbUrl) {
    throw new Error("Meshy Creative Lab build returned no GLB model URL.");
  }

  const previewGlb = `${input.outputPrefix}/model.glb`;
  const thumbnailPath = buildTask.thumbnail_url
    ? `${input.outputPrefix}/thumbnail.png`
    : null;
  const bucket = getConfiguredStorageBucket();
  await saveRemoteFile({
    url: glbUrl,
    storagePath: previewGlb,
    contentType: "model/gltf-binary",
    metadata: storageMetadata(input, "creative-lab-original-glb"),
  });

  if (buildTask.thumbnail_url && thumbnailPath) {
    await saveRemoteFile({
      url: buildTask.thumbnail_url,
      storagePath: thumbnailPath,
      contentType: "image/png",
      metadata: storageMetadata(input, "creative-lab-thumbnail"),
    });
  }

  const availableFormats = Object.entries(buildTask.model_urls ?? {})
    .filter(([, url]) => Boolean(url))
    .map(([format]) => format);
  const metadataPath = `${input.outputPrefix}/metadata.json`;
  const providerMetadata = {
    provider: "meshy",
    workflow: "creative_lab_figure",
    modelId: input.modelId,
    sourceImagePath: input.sourceImagePath,
    previewGlb,
    thumbnailPath,
    prototypeTask: sanitizeTask(prototypeTask),
    buildTask: sanitizeTask(buildTask),
    availableFormats,
    canonicalUpstreamAsset: "model.glb",
    downstreamPrintTooling: "not_run",
    printReadiness: "needs_review",
    createdAt: new Date().toISOString(),
  };
  await bucket.file(metadataPath).save(JSON.stringify(providerMetadata, null, 2), {
    resumable: false,
    metadata: {
      contentType: "application/json",
      cacheControl: "private, max-age=3600",
      metadata: storageMetadata(input, "creative-lab-metadata"),
    },
  });

  return {
    provider: "meshy",
    workflow: "creative_lab_figure",
    modelId: input.modelId,
    previewGlb,
    thumbnailPath,
    metadataPath,
    prototypeTaskId,
    buildTaskId,
    availableFormats,
    consumedCredits: sumConsumedCredits(prototypeTask, buildTask),
    status: "preview_ready",
  };
}

async function generateFixtureFigurinePreview(
  input: FigurineProviderInput,
  workflow: FigurineProviderOutput["workflow"] = "creative_lab_figure",
): Promise<FigurineProviderOutput> {
  const fixturePath = process.env.MESHY_FIGURINE_FIXTURE_GLB_PATH?.trim();
  if (!fixturePath) {
    throw new Error(
      "MESHY_FIGURINE_FIXTURE_GLB_PATH is required when MESHY_FIGURINE_PROVIDER_MODE=fixture.",
    );
  }

  const previewGlb = `${input.outputPrefix}/model.glb`;
  const metadataPath = `${input.outputPrefix}/metadata.json`;
  const bucket = getConfiguredStorageBucket();
  const fixtureBytes = await readFile(fixturePath);

  await bucket.file(previewGlb).save(fixtureBytes, {
    resumable: false,
    metadata: {
      contentType: "model/gltf-binary",
      cacheControl: "private, max-age=3600",
      metadata: storageMetadata(input, `${workflow}-fixture-glb`, workflow),
    },
  });
  await bucket.file(metadataPath).save(
    JSON.stringify(
      {
        provider: "meshy",
        workflow,
        modelId: input.modelId,
        sourceImagePath: input.sourceImagePath,
        previewGlb,
        fixtureMode: true,
        canonicalUpstreamAsset: "model.glb",
        downstreamPrintTooling: "not_run",
        printReadiness: "needs_review",
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    {
      resumable: false,
      metadata: {
        contentType: "application/json",
        cacheControl: "private, max-age=3600",
        metadata: storageMetadata(input, `${workflow}-fixture-metadata`, workflow),
      },
    },
  );

  return {
    provider: "meshy",
    workflow,
    modelId: input.modelId,
    previewGlb,
    thumbnailPath: null,
    metadataPath,
    ...(workflow === "creative_lab_figure"
      ? {
          prototypeTaskId: "fixture-prototype",
          buildTaskId: "fixture-build",
        }
      : { modelTaskId: "fixture-direct-model", printabilityTaskId: "fixture-analyze" }),
    availableFormats: ["glb"],
    consumedCredits: 0,
    status: "preview_ready",
  };
}

export type FigurinePrototypeConceptInput = {
  jobId: string;
  uid: string;
  sourceImagePath: string;
  conceptOutputPrefix: string;
  modelId: string;
  apiKey: string;
};

export type FigurinePrototypeConceptOutput = {
  provider: "meshy";
  workflow: "creative_lab_figure";
  prototypeTaskId: string;
  conceptImagePaths: string[];
  consumedCredits: number | null;
  status: "concept_ready";
};

// Phase 1 of the split Creative Lab flow: run only the prototype task and
// store Meshy's 2D concept image(s) so the customer can review the concept
// before the build-phase credits are spent.
export async function generateCreativeLabPrototypeConcept(
  input: FigurinePrototypeConceptInput,
): Promise<FigurinePrototypeConceptOutput> {
  if (process.env.MESHY_FIGURINE_PROVIDER_MODE === "fixture") {
    return generateFixturePrototypeConcept(input);
  }

  const sourceImage = await readStorageImage(input.sourceImagePath);
  const imageByteLimit = resolvePositiveIntegerEnv(
    "MESHY_MAX_SOURCE_IMAGE_BYTES",
    defaultSourceImageByteLimit,
  );
  if (sourceImage.buffer.byteLength > imageByteLimit) {
    throw new Error(
      `Figurine source image is ${sourceImage.buffer.byteLength} bytes, which exceeds the configured Meshy inline image limit of ${imageByteLimit} bytes.`,
    );
  }

  const imageUrl = `data:${sourceImage.contentType};base64,${sourceImage.buffer.toString("base64")}`;
  const { prototypeTaskId, prototypeTask } = await runPrototypePhase({
    apiKey: input.apiKey,
    imageUrl,
    name: `job-${input.jobId}`.slice(0, 120),
  });

  const conceptUrls = Array.isArray(prototypeTask.image_urls)
    ? prototypeTask.image_urls.filter((url) => Boolean(url))
    : [];
  if (conceptUrls.length === 0) {
    throw new Error(
      `Meshy figure prototype task ${prototypeTaskId} returned no concept image URLs.`,
    );
  }

  const conceptImagePaths: string[] = [];
  for (let index = 0; index < conceptUrls.length; index += 1) {
    const url = conceptUrls[index];
    const extension = extensionFromUrl(url, ".png");
    const storagePath = `${input.conceptOutputPrefix}/meshy-concept-${index + 1}${extension}`;
    await saveRemoteFile({
      url,
      storagePath,
      contentType: extension === ".jpg" ? "image/jpeg" : "image/png",
      metadata: storageMetadata(input, "creative-lab-prototype-concept"),
    });
    conceptImagePaths.push(storagePath);
  }

  return {
    provider: "meshy",
    workflow: "creative_lab_figure",
    prototypeTaskId,
    conceptImagePaths,
    consumedCredits: sumConsumedCredits(prototypeTask),
    status: "concept_ready",
  };
}

// Phase 2 of the split flow: build the 3D figure from an already-succeeded
// prototype task. The prototype task is re-fetched so provider metadata and
// credit totals stay complete, and so an expired prototype fails loudly here
// instead of producing a confusing build error.
export async function buildCreativeLabFigurineFromPrototype(
  input: FigurineProviderInput & { prototypeTaskId: string },
): Promise<FigurineProviderOutput> {
  if (process.env.MESHY_FIGURINE_PROVIDER_MODE === "fixture") {
    return generateFixtureFigurinePreview(input);
  }

  const prototypeTask = (await meshyJson(
    input.apiKey,
    `/creative-lab/figure/v1/prototype/${input.prototypeTaskId}`,
    { method: "GET" },
  )) as MeshyTask;

  if (prototypeTask.status !== "SUCCEEDED") {
    throw new MeshyProviderTaskError({
      taskId: input.prototypeTaskId,
      label: "figure prototype",
      task: prototypeTask,
    });
  }

  return runBuildPhase(input, input.prototypeTaskId, prototypeTask);
}

async function generateFixturePrototypeConcept(
  input: FigurinePrototypeConceptInput,
): Promise<FigurinePrototypeConceptOutput> {
  // Fixture mode mirrors the swap image back as the concept so the full
  // browser flow can run without paid Meshy calls.
  const sourceImage = await readStorageImage(input.sourceImagePath);
  const extension = sourceImage.contentType === "image/png" ? ".png" : ".jpg";
  const storagePath = `${input.conceptOutputPrefix}/meshy-concept-1${extension}`;
  const bucket = getConfiguredStorageBucket();

  await bucket.file(storagePath).save(sourceImage.buffer, {
    resumable: false,
    metadata: {
      contentType: sourceImage.contentType,
      cacheControl: "private, max-age=3600",
      metadata: storageMetadata(input, "creative-lab-fixture-concept"),
    },
  });

  return {
    provider: "meshy",
    workflow: "creative_lab_figure",
    prototypeTaskId: "fixture-prototype",
    conceptImagePaths: [storagePath],
    consumedCredits: 0,
    status: "concept_ready",
  };
}

function extensionFromUrl(url: string, fallback: string): string {
  try {
    const pathname = new URL(url).pathname;
    const match = /\.(png|jpe?g)$/i.exec(pathname);
    if (!match) {
      return fallback;
    }
    return match[0].toLowerCase() === ".jpeg" ? ".jpg" : match[0].toLowerCase();
  } catch {
    return fallback;
  }
}

async function createPrototypeTask(input: {
  apiKey: string;
  imageUrl: string;
  name: string;
}): Promise<string> {
  const response = (await meshyJson(
    input.apiKey,
    "/creative-lab/figure/v1/prototype",
    {
      method: "POST",
      body: {
        image_url: input.imageUrl,
        name: input.name,
      },
    },
  )) as MeshyJsonResponse;

  if (!response.result) {
    throw new Error("Meshy did not return a figure prototype task id.");
  }

  return response.result;
}

async function createBuildTask(input: {
  apiKey: string;
  prototypeTaskId: string;
  name: string;
}): Promise<string> {
  const response = (await meshyJson(
    input.apiKey,
    "/creative-lab/figure/v1/build",
    {
      method: "POST",
      body: {
        input_task_id: input.prototypeTaskId,
        name: input.name,
      },
    },
  )) as MeshyJsonResponse;

  if (!response.result) {
    throw new Error("Meshy did not return a figure build task id.");
  }

  return response.result;
}

async function createDirectMultiImageTo3dTask(input: {
  apiKey: string;
  imageUrls: string[];
}): Promise<string> {
  const response = (await meshyJson(input.apiKey, "/multi-image-to-3d", {
    method: "POST",
    apiVersion: "v1",
    body: buildDirectMultiImageTo3dRequest(input.imageUrls),
  })) as MeshyJsonResponse;

  if (!response.result) {
    throw new Error("Meshy did not return a direct Multi-Image-to-3D task id.");
  }

  return response.result;
}

async function createPrintabilityTask(input: {
  apiKey: string;
  inputTaskId: string;
}): Promise<string> {
  const response = (await meshyJson(input.apiKey, "/print/analyze", {
    method: "POST",
    apiVersion: "v1",
    body: { input_task_id: input.inputTaskId },
  })) as MeshyJsonResponse;

  if (!response.result) {
    throw new Error("Meshy did not return a printability task id.");
  }

  return response.result;
}

async function pollMeshyTask(input: {
  apiKey: string;
  endpoint: string;
  apiVersion?: MeshyApiVersion;
  taskId: string;
  label: string;
}): Promise<MeshyTask> {
  const intervalMs = resolvePositiveIntegerEnv(
    "MESHY_POLL_INTERVAL_MS",
    defaultPollIntervalMs,
  );
  const timeoutMs = resolvePositiveIntegerEnv(
    "MESHY_TASK_TIMEOUT_MS",
    defaultTimeoutMs,
  );
  const startedAt = Date.now();
  let lastTask: MeshyTask | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    const task = (await meshyJson(
      input.apiKey,
      `${input.endpoint}/${input.taskId}`,
      { method: "GET", apiVersion: input.apiVersion },
    )) as MeshyTask;
    lastTask = task;

    const statusLog: Record<string, unknown> = {
      taskId: input.taskId,
      label: input.label,
      status: task.status,
      progress: task.progress,
    };
    if (
      task.status &&
      terminalStatuses.has(task.status) &&
      task.status !== "SUCCEEDED" &&
      task.task_error
    ) {
      statusLog.taskError = sanitizeMeshyTaskError(task.task_error);
    }
    console.info("Meshy Creative Lab task status", statusLog);

    if (task.status && terminalStatuses.has(task.status)) {
      return task;
    }

    await sleep(intervalMs);
  }

  throw new Error(
    `Timed out waiting for Meshy ${input.label} task ${input.taskId}. Last status: ${lastTask?.status ?? "unknown"}.`,
  );
}

const transientMeshyStatusCodes = new Set([429, 500, 502, 503, 504]);

function describeFetchError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const cause = (error as Error & { cause?: unknown }).cause;
  return cause instanceof Error
    ? `${error.message} (cause: ${cause.message})`
    : error.message;
}

async function meshyJson(
  apiKey: string,
  endpoint: string,
  init: {
    method: "GET" | "POST";
    body?: Record<string, unknown>;
    apiVersion?: MeshyApiVersion;
  },
): Promise<MeshyJsonResponse | MeshyTask> {
  // A single stale-socket "fetch failed" must not kill a multi-minute paid
  // flow. GETs are idempotent and retry freely; POST retries are capped at one
  // because a duplicated create-task request can consume provider credits.
  const maxAttempts = init.method === "GET" ? 3 : 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(buildMeshyOpenApiUrl(endpoint, {
        apiVersion: init.apiVersion,
      }), {
        method: init.method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
      });
    } catch (error) {
      console.warn("Meshy request network failure", {
        endpoint,
        method: init.method,
        attempt,
        maxAttempts,
        error: describeFetchError(error),
      });
      if (attempt < maxAttempts) {
        await sleep(1_000 * attempt);
        continue;
      }
      throw new Error(
        `Meshy ${init.method} ${endpoint} network failure after ${maxAttempts} attempts: ${describeFetchError(error)}`,
      );
    }

    const text = await response.text();
    let data: MeshyJsonResponse | MeshyTask;

    try {
      data = text ? (JSON.parse(text) as MeshyJsonResponse | MeshyTask) : {};
    } catch {
      data = { message: text };
    }

    if (!response.ok) {
      const message =
        "message" in data && data.message
          ? data.message
          : "error" in data && data.error
            ? data.error
            : text.slice(0, 200);
      if (
        init.method === "GET" &&
        transientMeshyStatusCodes.has(response.status) &&
        attempt < maxAttempts
      ) {
        console.warn("Meshy request transient HTTP failure", {
          endpoint,
          status: response.status,
          attempt,
          maxAttempts,
        });
        await sleep(1_000 * attempt);
        continue;
      }
      throw new Error(
        `Meshy ${init.method} ${endpoint} failed: ${response.status} ${message}`,
      );
    }

    return data;
  }

  throw new Error(`Meshy ${init.method} ${endpoint} failed unexpectedly.`);
}

async function readStorageImage(storagePath: string): Promise<{
  buffer: Buffer;
  contentType: string;
}> {
  const bucket = getConfiguredStorageBucket();
  const file = bucket.file(storagePath);
  const [downloadResult, metadataResult] = await Promise.all([
    file.download(),
    file.getMetadata(),
  ]);

  return {
    buffer: downloadResult[0],
    contentType: resolveImageMimeType(storagePath, metadataResult[0].contentType),
  };
}

async function saveRemoteFile(input: {
  url: string;
  storagePath: string;
  contentType: string;
  metadata: Record<string, string>;
}): Promise<void> {
  const response = await fetch(input.url);
  if (!response.ok) {
    throw new Error(
      `Provider asset download failed with HTTP ${response.status}: ${input.storagePath}`,
    );
  }

  const bucket = getConfiguredStorageBucket();
  await bucket.file(input.storagePath).save(Buffer.from(await response.arrayBuffer()), {
    resumable: false,
    metadata: {
      contentType: input.contentType,
      cacheControl: "private, max-age=3600",
      metadata: input.metadata,
    },
  });
}

async function saveDirectModelTaskAssets(
  input: FigurineProviderInput,
  task: MeshyTask,
): Promise<{
  assets: Array<{
    kind: "model" | "thumbnail" | "texture";
    format?: string;
    map?: string;
    storagePath: string;
  }>;
  thumbnailPath: string | null;
}> {
  const assets: Array<{
    kind: "model" | "thumbnail" | "texture";
    format?: string;
    map?: string;
    storagePath: string;
  }> = [];

  for (const [format, url] of Object.entries(task.model_urls ?? {})) {
    if (!url) {
      continue;
    }
    const filename =
      format === "pre_remeshed_glb" ? "model.pre-remeshed.glb" : `model.${format}`;
    const storagePath = `${input.outputPrefix}/${filename}`;
    await saveRemoteFile({
      url,
      storagePath,
      contentType: contentTypeForModelFormat(format),
      metadata: storageMetadata(
        input,
        `direct-multi-image-${format}`,
        "direct_multi_image_to_3d",
      ),
    });
    assets.push({ kind: "model", format, storagePath });
  }

  const thumbnailPath = task.thumbnail_url
    ? `${input.outputPrefix}/thumbnail.png`
    : null;
  if (task.thumbnail_url && thumbnailPath) {
    await saveRemoteFile({
      url: task.thumbnail_url,
      storagePath: thumbnailPath,
      contentType: "image/png",
      metadata: storageMetadata(
        input,
        "direct-multi-image-thumbnail",
        "direct_multi_image_to_3d",
      ),
    });
    assets.push({ kind: "thumbnail", storagePath: thumbnailPath });
  }

  if (Array.isArray(task.texture_urls)) {
    for (let index = 0; index < task.texture_urls.length; index += 1) {
      const textureSet = task.texture_urls[index] ?? {};
      for (const [mapName, url] of Object.entries(textureSet)) {
        if (!url) {
          continue;
        }
        const extension = extensionFromUrl(url, ".png");
        const storagePath = `${input.outputPrefix}/textures/texture-${index}-${mapName}${extension}`;
        await saveRemoteFile({
          url,
          storagePath,
          contentType: extension === ".jpg" ? "image/jpeg" : "image/png",
          metadata: storageMetadata(
            input,
            `direct-multi-image-texture-${mapName}`,
            "direct_multi_image_to_3d",
          ),
        });
        assets.push({ kind: "texture", map: mapName, storagePath });
      }
    }
  }

  return { assets, thumbnailPath };
}

function sanitizeTask(task: MeshyTask) {
  return {
    id: task.id,
    type: task.type,
    status: task.status,
    progress: task.progress,
    created_at: task.created_at,
    started_at: task.started_at,
    finished_at: task.finished_at,
    expires_at: task.expires_at,
    consumed_credits: task.consumed_credits,
    preceding_tasks: task.preceding_tasks,
    task_error: task.task_error,
    model_formats: Object.entries(task.model_urls ?? {})
      .filter(([, url]) => Boolean(url))
      .map(([format]) => format),
    has_thumbnail_url: Boolean(task.thumbnail_url),
    texture_map_count: Array.isArray(task.texture_urls)
      ? task.texture_urls.length
      : 0,
  };
}

function sanitizePrintabilityTask(task: MeshyTask) {
  return {
    id: task.id,
    type: task.type,
    status: task.status,
    progress: task.progress,
    created_at: task.created_at,
    started_at: task.started_at,
    finished_at: task.finished_at,
    expires_at: task.expires_at,
    consumed_credits: task.consumed_credits,
    preceding_tasks: task.preceding_tasks,
    task_error: task.task_error,
    printability: task.printability,
  };
}

function printabilityStatus(task: MeshyTask | undefined): string | undefined {
  if (!task?.printability || typeof task.printability !== "object") {
    return undefined;
  }
  const printability = task.printability as { status?: unknown };
  return typeof printability.status === "string" ? printability.status : undefined;
}

export function sanitizeMeshyTaskError(
  taskError: unknown,
): SanitizedMeshyTaskError {
  return sanitizeJsonValue(taskError, 0);
}

function sanitizeJsonValue(
  value: unknown,
  depth: number,
): SanitizedMeshyTaskError {
  if (value === null || value === undefined) {
    return null;
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return typeof value === "string" ? value.slice(0, 500) : value;
  }
  if (depth >= 3) {
    return "[nested-provider-detail]";
  }
  if (Array.isArray(value)) {
    return value.slice(0, 10).map((entry) => sanitizeJsonValue(entry, depth + 1));
  }
  if (typeof value === "object") {
    const safe: Record<string, SanitizedMeshyTaskError> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (/url|token|key|secret|authorization/i.test(key)) {
        safe[key] = "[redacted]";
        continue;
      }
      safe[key] = sanitizeJsonValue(entry, depth + 1);
    }
    return safe;
  }

  return String(value).slice(0, 500);
}

function formatSanitizedTaskError(
  taskError: SanitizedMeshyTaskError,
): string | null {
  if (taskError === null) {
    return null;
  }
  if (
    typeof taskError === "string" ||
    typeof taskError === "number" ||
    typeof taskError === "boolean"
  ) {
    return String(taskError).slice(0, 500);
  }
  if (!Array.isArray(taskError) && typeof taskError === "object") {
    const message =
      typeof taskError.message === "string" ? taskError.message : null;
    const type = typeof taskError.type === "string" ? taskError.type : null;
    if (type && message) {
      return `${type}: ${message}`.slice(0, 500);
    }
    if (message) {
      return message.slice(0, 500);
    }
    if (type) {
      return type.slice(0, 500);
    }
  }

  return JSON.stringify(taskError).slice(0, 500);
}

function storageMetadata(
  input: { jobId: string; uid: string; modelId: string },
  artifactRole: string,
  workflow: FigurineProviderOutput["workflow"] = "creative_lab_figure",
): Record<string, string> {
  return {
    jobId: input.jobId,
    uid: input.uid,
    provider: "meshy",
    workflow,
    modelId: input.modelId,
    artifactRole,
  };
}

function contentTypeForModelFormat(format: string): string {
  if (format === "glb" || format === "pre_remeshed_glb") {
    return "model/gltf-binary";
  }
  if (format === "stl") {
    return "model/stl";
  }
  if (format === "3mf") {
    return "model/3mf";
  }
  if (format === "obj") {
    return "model/obj";
  }
  return "application/octet-stream";
}

function sumConsumedCredits(...tasks: MeshyTask[]): number | null {
  let total = 0;
  let sawCredits = false;
  for (const task of tasks) {
    if (typeof task.consumed_credits === "number") {
      total += task.consumed_credits;
      sawCredits = true;
    }
  }

  return sawCredits ? total : null;
}

function getConfiguredStorageBucket() {
  const bucketName = process.env.APP_STORAGE_BUCKET;
  return bucketName ? getStorage().bucket(bucketName) : getStorage().bucket();
}

function resolveImageMimeType(
  sourceImagePath: string,
  metadataContentType: unknown,
): string {
  if (
    metadataContentType === "image/jpeg" ||
    metadataContentType === "image/png"
  ) {
    return metadataContentType;
  }

  if (/\.png$/i.test(sourceImagePath)) {
    return "image/png";
  }

  return "image/jpeg";
}

function resolvePositiveIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
