import { readFile } from "node:fs/promises";

import { getStorage } from "firebase-admin/storage";

const meshyOpenApiRoot = "https://api.meshy.ai/openapi";
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
};

type MeshyJsonResponse = {
  result?: string;
  message?: string;
  error?: string;
};

export type FigurineProviderInput = {
  jobId: string;
  uid: string;
  sourceImagePath: string;
  outputPrefix: string;
  modelId: string;
  apiKey: string;
};

export type FigurineProviderOutput = {
  provider: "meshy";
  workflow: "creative_lab_figure";
  modelId: string;
  previewGlb: string;
  thumbnailPath: string | null;
  metadataPath: string;
  prototypeTaskId: string;
  buildTaskId: string;
  availableFormats: string[];
  consumedCredits: number | null;
  status: "preview_ready";
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
  const name = `job-${input.jobId}`.slice(0, 120);
  const prototypeTaskId = await createPrototypeTask({
    apiKey: input.apiKey,
    imageUrl,
    name,
  });
  const prototypeTask = await pollMeshyTask({
    apiKey: input.apiKey,
    endpoint: "/creative-lab/figure/v1/prototype",
    taskId: prototypeTaskId,
    label: "figure prototype",
  });

  if (prototypeTask.status !== "SUCCEEDED") {
    throw new Error(
      `Meshy figure prototype task ${prototypeTaskId} ended with status ${prototypeTask.status ?? "unknown"}.`,
    );
  }

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
    throw new Error(
      `Meshy figure build task ${buildTaskId} ended with status ${buildTask.status ?? "unknown"}.`,
    );
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
      metadata: storageMetadata(input, "creative-lab-fixture-glb"),
    },
  });
  await bucket.file(metadataPath).save(
    JSON.stringify(
      {
        provider: "meshy",
        workflow: "creative_lab_figure",
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
        metadata: storageMetadata(input, "creative-lab-fixture-metadata"),
      },
    },
  );

  return {
    provider: "meshy",
    workflow: "creative_lab_figure",
    modelId: input.modelId,
    previewGlb,
    thumbnailPath: null,
    metadataPath,
    prototypeTaskId: "fixture-prototype",
    buildTaskId: "fixture-build",
    availableFormats: ["glb"],
    consumedCredits: 0,
    status: "preview_ready",
  };
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

async function pollMeshyTask(input: {
  apiKey: string;
  endpoint: string;
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
      { method: "GET" },
    )) as MeshyTask;
    lastTask = task;

    console.info("Meshy Creative Lab task status", {
      taskId: input.taskId,
      label: input.label,
      status: task.status,
      progress: task.progress,
    });

    if (task.status && terminalStatuses.has(task.status)) {
      return task;
    }

    await sleep(intervalMs);
  }

  throw new Error(
    `Timed out waiting for Meshy ${input.label} task ${input.taskId}. Last status: ${lastTask?.status ?? "unknown"}.`,
  );
}

async function meshyJson(
  apiKey: string,
  endpoint: string,
  init: {
    method: "GET" | "POST";
    body?: Record<string, unknown>;
  },
): Promise<MeshyJsonResponse | MeshyTask> {
  const response = await fetch(`${meshyOpenApiRoot}${endpoint}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
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
    throw new Error(
      `Meshy ${init.method} ${endpoint} failed: ${response.status} ${message}`,
    );
  }

  return data;
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

function storageMetadata(
  input: FigurineProviderInput,
  artifactRole: string,
): Record<string, string> {
  return {
    jobId: input.jobId,
    uid: input.uid,
    provider: "meshy",
    workflow: "creative_lab_figure",
    modelId: input.modelId,
    artifactRole,
  };
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
