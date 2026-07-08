import { getStorage } from "firebase-admin/storage";

import type {
  FigurineProviderOutput,
  SanitizedMeshyTaskError,
} from "./meshyFigurineProvider";
import { sanitizeMeshyTaskError } from "./meshyFigurineProvider";

// Hi3D (Hitem3D) direct API provider for the direct Multi-Image-to-3D
// workflow. Validated live 2026-07-08: hitem3dv2.1 @ 1536fast and
// scene-portraitv2.1 @ 1536profast both cost 25 credits (~$0.50) and take
// ~7 minutes. Result URLs expire after 1 hour, so assets are downloaded into
// Firebase Storage immediately after the task succeeds.
const hi3dApiRoot = "https://api.hitem3d.ai/open-api/v1";
const defaultPollIntervalMs = 10_000;
const defaultTimeoutMs = 60 * 60 * 1000;
const defaultSourceImageByteLimit = 8 * 1024 * 1024;
const terminalStates = new Set(["success", "failed"]);

// Per-model request parameters. The admin-facing catalog in
// figurineWorkflowConfig.ts only carries display summaries; the actual request
// values live here with the provider.
const hi3dModelRequestDefaults: Record<
  string,
  { resolution: string; creditCost: number }
> = {
  "hitem3dv2.1": { resolution: "1536fast", creditCost: 25 },
  "scene-portraitv2.1": { resolution: "1536profast", creditCost: 25 },
};

export type Hi3dFigurineProviderInput = {
  jobId: string;
  uid: string;
  sourceImagePath: string;
  outputPrefix: string;
  modelId: string;
  providerModel: string;
  accessKey: string;
  secretKey: string;
};

type Hi3dTaskData = {
  task_id?: string;
  id?: string;
  state?: string;
  progress?: number;
  url?: string;
  cover_url?: string;
  code?: unknown;
  msg?: unknown;
};

export class Hi3dProviderTaskError extends Error {
  readonly provider = "hi3d";
  readonly taskId: string;
  readonly label: string;
  readonly status: string | null;
  readonly progress: number | null;
  readonly consumedCredits: number | null;
  readonly taskError: SanitizedMeshyTaskError;

  constructor(input: { taskId: string; label: string; task: Hi3dTaskData }) {
    const status = input.task.state ?? "unknown";
    super(
      `Hi3D ${input.label} task ${input.taskId} ended with state ${status}.`,
    );
    this.name = "Hi3dProviderTaskError";
    this.taskId = input.taskId;
    this.label = input.label;
    this.status = input.task.state ?? null;
    this.progress =
      typeof input.task.progress === "number" ? input.task.progress : null;
    // Hi3D auto-refunds credits on generate failures (code 50010001).
    this.consumedCredits = null;
    this.taskError = sanitizeMeshyTaskError({
      code: input.task.code,
      msg: input.task.msg,
    });
  }
}

export async function generateHi3dDirectImageFigurinePreview(
  input: Hi3dFigurineProviderInput,
): Promise<FigurineProviderOutput> {
  const requestDefaults = hi3dModelRequestDefaults[input.providerModel];
  if (!requestDefaults) {
    throw new Error(
      `Hi3D provider model ${input.providerModel} has no request defaults; add it to hi3dModelRequestDefaults.`,
    );
  }

  const sourceImage = await readStorageImage(input.sourceImagePath);
  const imageByteLimit = resolvePositiveIntegerEnv(
    "HI3D_MAX_SOURCE_IMAGE_BYTES",
    defaultSourceImageByteLimit,
  );
  if (sourceImage.buffer.byteLength > imageByteLimit) {
    throw new Error(
      `Figurine source image is ${sourceImage.buffer.byteLength} bytes, which exceeds the configured Hi3D image limit of ${imageByteLimit} bytes.`,
    );
  }

  const accessToken = await fetchHi3dAccessToken(input);

  const form = new FormData();
  form.append(
    "images",
    new Blob([new Uint8Array(sourceImage.buffer)], {
      type: sourceImage.contentType,
    }),
    sourceImage.contentType === "image/png" ? "source.png" : "source.jpg",
  );
  form.append("request_type", "3"); // one-shot geometry + texture
  form.append("model", input.providerModel);
  form.append("resolution", requestDefaults.resolution);
  form.append("format", "2"); // GLB

  const submitResponse = await hi3dFetch(`${hi3dApiRoot}/submit-task`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  const submitData = (await submitResponse.json().catch(() => ({}))) as {
    code?: number;
    data?: Hi3dTaskData;
    msg?: string;
  };
  const taskId = submitData.data?.task_id;
  if (!submitResponse.ok || submitData.code !== 200 || !taskId) {
    throw new Error(
      `Hi3D submit-task failed: HTTP ${submitResponse.status} code=${submitData.code ?? "?"} ${String(submitData.msg ?? "").slice(0, 200)}`,
    );
  }

  const task = await pollHi3dTask({ accessToken, taskId });
  if (task.state !== "success") {
    throw new Hi3dProviderTaskError({
      taskId,
      label: "direct image-to-3d",
      task,
    });
  }
  if (!task.url) {
    throw new Error(`Hi3D task ${taskId} succeeded but returned no model URL.`);
  }

  // Result URLs expire after 1 hour — persist to Storage immediately.
  const previewGlb = `${input.outputPrefix}/model.glb`;
  await saveRemoteFile({
    url: task.url,
    storagePath: previewGlb,
    contentType: "model/gltf-binary",
    metadata: storageMetadata(input, "hi3d-direct-glb"),
  });

  const thumbnailPath = task.cover_url
    ? `${input.outputPrefix}/thumbnail.png`
    : null;
  if (task.cover_url && thumbnailPath) {
    await saveRemoteFile({
      url: task.cover_url,
      storagePath: thumbnailPath,
      contentType: "image/png",
      metadata: storageMetadata(input, "hi3d-direct-thumbnail"),
    });
  }

  const metadataPath = `${input.outputPrefix}/metadata.json`;
  const bucket = getConfiguredStorageBucket();
  const availableFormats = ["glb"];
  const providerMetadata = {
    provider: "hi3d",
    workflow: "direct_multi_image_to_3d",
    modelId: input.modelId,
    providerModel: input.providerModel,
    resolution: requestDefaults.resolution,
    creditCost: requestDefaults.creditCost,
    sourceImagePath: input.sourceImagePath,
    previewGlb,
    thumbnailPath,
    modelTask: {
      id: taskId,
      state: task.state,
      progress: task.progress,
    },
    printabilityTask: null,
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
      metadata: storageMetadata(input, "hi3d-direct-metadata"),
    },
  });

  return {
    provider: "hi3d",
    workflow: "direct_multi_image_to_3d",
    modelId: input.modelId,
    previewGlb,
    thumbnailPath,
    metadataPath,
    modelTaskId: taskId,
    availableFormats,
    // Hi3D credits are a different currency from Meshy credits; the job cost
    // pipeline treats consumedCredits as Meshy credits, so report null and
    // keep the known 25-credit cost in provider metadata instead.
    consumedCredits: null,
    status: "preview_ready",
  };
}

async function fetchHi3dAccessToken(input: {
  accessKey: string;
  secretKey: string;
}): Promise<string> {
  const basic = Buffer.from(`${input.accessKey}:${input.secretKey}`).toString(
    "base64",
  );
  const response = await hi3dFetch(`${hi3dApiRoot}/auth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
    },
  });
  const data = (await response.json().catch(() => ({}))) as {
    code?: unknown;
    message?: unknown;
    data?: { accessToken?: string };
  };
  const accessToken = data.data?.accessToken;
  if (!response.ok || !accessToken) {
    throw new Error(
      `Hi3D token exchange failed: HTTP ${response.status} code=${String(data.code ?? "?")}`,
    );
  }
  return accessToken;
}

async function pollHi3dTask(input: {
  accessToken: string;
  taskId: string;
}): Promise<Hi3dTaskData> {
  const intervalMs = resolvePositiveIntegerEnv(
    "HI3D_POLL_INTERVAL_MS",
    defaultPollIntervalMs,
  );
  const timeoutMs = resolvePositiveIntegerEnv(
    "HI3D_TASK_TIMEOUT_MS",
    defaultTimeoutMs,
  );
  const startedAt = Date.now();
  let lastState: string | undefined;

  while (Date.now() - startedAt < timeoutMs) {
    await sleep(intervalMs);
    const response = await hi3dFetch(
      `${hi3dApiRoot}/query-task?task_id=${encodeURIComponent(input.taskId)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${input.accessToken}` },
      },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      data?: Hi3dTaskData;
    } & Hi3dTaskData;
    const task = payload.data ?? payload;
    lastState = task.state;
    console.info("Hi3D task status", {
      taskId: input.taskId,
      state: task.state,
      progress: task.progress,
    });
    if (task.state && terminalStates.has(task.state)) {
      return task;
    }
  }

  throw new Error(
    `Timed out waiting for Hi3D task ${input.taskId}. Last state: ${lastState ?? "unknown"}.`,
  );
}

const transientHi3dStatusCodes = new Set([429, 500, 502, 503, 504]);

// GETs retry on transient network/HTTP failures; POST retries are capped at
// one attempt because a duplicated submit can consume provider credits.
async function hi3dFetch(url: string, init: RequestInit): Promise<Response> {
  const maxAttempts = init.method === "GET" ? 3 : 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (
        init.method === "GET" &&
        transientHi3dStatusCodes.has(response.status) &&
        attempt < maxAttempts
      ) {
        console.warn("Hi3D transient HTTP failure", {
          url: url.split("?")[0],
          status: response.status,
          attempt,
        });
        await sleep(1_000 * attempt);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      console.warn("Hi3D request network failure", {
        url: url.split("?")[0],
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });
      if (attempt < maxAttempts) {
        await sleep(1_000 * attempt);
      }
    }
  }

  throw new Error(
    `Hi3D request to ${url.split("?")[0]} failed after ${maxAttempts} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
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
  const metadataContentType = metadataResult[0].contentType;
  const contentType =
    metadataContentType === "image/png" || metadataContentType === "image/jpeg"
      ? metadataContentType
      : /\.png$/i.test(storagePath)
        ? "image/png"
        : "image/jpeg";

  return { buffer: downloadResult[0], contentType };
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
  await bucket
    .file(input.storagePath)
    .save(Buffer.from(await response.arrayBuffer()), {
      resumable: false,
      metadata: {
        contentType: input.contentType,
        cacheControl: "private, max-age=3600",
        metadata: input.metadata,
      },
    });
}

function storageMetadata(
  input: { jobId: string; uid: string; modelId: string },
  artifactRole: string,
): Record<string, string> {
  return {
    jobId: input.jobId,
    uid: input.uid,
    provider: "hi3d",
    workflow: "direct_multi_image_to_3d",
    modelId: input.modelId,
    artifactRole,
  };
}

function getConfiguredStorageBucket() {
  const bucketName = process.env.APP_STORAGE_BUCKET;
  return bucketName ? getStorage().bucket(bucketName) : getStorage().bucket();
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
