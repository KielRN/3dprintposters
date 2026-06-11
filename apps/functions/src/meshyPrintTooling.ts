import { getStorage } from "firebase-admin/storage";

const meshyOpenApiRoot = "https://api.meshy.ai/openapi";
const terminalStatuses = new Set(["SUCCEEDED", "FAILED", "CANCELED", "EXPIRED"]);
const supportedAnalyzeFormats = new Set(["glb", "gltf", "obj", "fbx", "stl"]);
const defaultPollIntervalMs = 10_000;
const defaultTimeoutMs = 60 * 60 * 1000;

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
  printability?: unknown;
  model_urls?: Record<string, string | undefined>;
  thumbnail_url?: string;
  texture_urls?: Array<Record<string, string | undefined>>;
};

type MeshyJsonResponse = MeshyTask & {
  result?: string;
  message?: string;
  error?: string;
};

type SavedProviderAsset = {
  kind: "model" | "thumbnail" | "texture";
  format?: string;
  map?: string;
  storagePath: string;
  contentType: string;
};

export type FigurinePrintToolingInput = {
  apiKey: string;
  modelUrl: string;
  outputPrefix: string;
  jobId: string;
  uid: string;
  remeshTopology?: string;
  remeshTargetPolycount?: number;
  remeshTargetFormats?: string[];
};

export type FigurinePrintToolingOutput = {
  status: "completed";
  inputModelUrlSource: "signed_storage_url";
  originalAnalyze: Record<string, unknown>;
  repair: Record<string, unknown>;
  repairedAnalyze: Record<string, unknown> | null;
  remesh: Record<string, unknown>;
  remeshAnalyzeByFormat: Record<string, unknown>;
  recommendedPath: "undecided";
  warnings: string[];
};

export async function runMeshyFigurinePrintTooling(
  input: FigurinePrintToolingInput,
): Promise<FigurinePrintToolingOutput> {
  const originalAnalyze = await analyzeModelUrl({
    apiKey: input.apiKey,
    modelUrl: input.modelUrl,
    label: "assembled original",
  });

  const repairTaskId = await createTask(input.apiKey, "/print/repair", {
    model_url: input.modelUrl,
  });
  const repairTask = await pollTask({
    apiKey: input.apiKey,
    endpoint: "/print/repair",
    taskId: repairTaskId,
    label: "repair assembled original",
  });
  const repairAssets =
    repairTask.status === "SUCCEEDED"
      ? await saveTaskAssets({
          task: repairTask,
          outputPrefix: `${input.outputPrefix}/repair`,
          modelFilenameBase: "model.repaired",
          thumbnailFilename: "thumbnail.repaired.png",
          metadata: storageMetadata(input, "repair"),
        })
      : [];
  const repairedModel = firstAvailableModelUrl(repairTask, ["glb", "stl", "obj"]);
  const repairedAnalyze =
    repairTask.status === "SUCCEEDED" && repairedModel
      ? await analyzeModelUrl({
          apiKey: input.apiKey,
          modelUrl: repairedModel.url,
          label: `repaired ${repairedModel.format}`,
        })
      : null;

  const topology = input.remeshTopology ?? "quad";
  const targetPolycount = input.remeshTargetPolycount ?? 100_000;
  const targetFormats = input.remeshTargetFormats ?? ["glb", "stl", "3mf"];
  const remeshTaskId = await createTask(input.apiKey, "/remesh", {
    model_url: input.modelUrl,
    target_formats: targetFormats,
    topology,
    target_polycount: targetPolycount,
  });
  const remeshTask = await pollTask({
    apiKey: input.apiKey,
    endpoint: "/remesh",
    taskId: remeshTaskId,
    label: "remesh assembled original",
  });
  const remeshAssets =
    remeshTask.status === "SUCCEEDED"
      ? await saveTaskAssets({
          task: remeshTask,
          outputPrefix: `${input.outputPrefix}/remesh/${topology}-${targetPolycount}`,
          modelFilenameBase: `model.remesh-${topology}-${targetPolycount}`,
          thumbnailFilename: `thumbnail.remesh-${topology}-${targetPolycount}.png`,
          metadata: storageMetadata(input, "remesh"),
        })
      : [];

  const remeshAnalyzeByFormat: Record<string, unknown> = {};
  if (remeshTask.status === "SUCCEEDED") {
    for (const [format, url] of Object.entries(remeshTask.model_urls ?? {})) {
      if (!url) {
        continue;
      }
      if (!supportedAnalyzeFormats.has(format)) {
        remeshAnalyzeByFormat[format] = {
          status: "not_run",
          reason: "format_not_supported_by_meshy_analyze",
        };
        continue;
      }
      if (format !== "glb" && format !== "stl") {
        remeshAnalyzeByFormat[format] = {
          status: "not_run",
          reason: "review_path_currently_limited_to_glb_and_stl",
        };
        continue;
      }
      remeshAnalyzeByFormat[format] = await analyzeModelUrl({
        apiKey: input.apiKey,
        modelUrl: url,
        label: `remeshed ${format}`,
      });
    }
  }

  return {
    status: "completed",
    inputModelUrlSource: "signed_storage_url",
    originalAnalyze,
    repair: {
      taskId: repairTaskId,
      task: sanitizeModelTask(repairTask),
      artifacts: repairAssets,
    },
    repairedAnalyze,
    remesh: {
      taskId: remeshTaskId,
      request: {
        topology,
        targetPolycount,
        targetFormats,
      },
      task: sanitizeModelTask(remeshTask),
      artifacts: remeshAssets,
    },
    remeshAnalyzeByFormat,
    recommendedPath: "undecided",
    warnings: [
      "Meshy Repair Printability may remove textures; compare repaired topology against the original preview before fulfillment.",
      "Meshy Remesh outputs still require Blender or slicer review before checkout eligibility changes.",
    ],
  };
}

async function analyzeModelUrl(input: {
  apiKey: string;
  modelUrl: string;
  label: string;
}): Promise<Record<string, unknown>> {
  const taskId = await createTask(input.apiKey, "/print/analyze", {
    model_url: input.modelUrl,
  });
  const task = await pollTask({
    apiKey: input.apiKey,
    endpoint: "/print/analyze",
    taskId,
    label: `analyze ${input.label}`,
  });
  return {
    taskId,
    task: sanitizePrintabilityTask(task),
    printabilityStatus:
      typeof task.printability === "object" &&
      task.printability &&
      "status" in task.printability
        ? (task.printability as { status?: unknown }).status ?? "unknown"
        : "unknown",
  };
}

async function createTask(
  apiKey: string,
  endpoint: "/print/analyze" | "/print/repair" | "/remesh",
  body: Record<string, unknown>,
): Promise<string> {
  const response = await meshyJson(apiKey, endpoint, {
    method: "POST",
    body,
  });
  if (!response.result) {
    throw new Error(`Meshy did not return a task id for ${endpoint}.`);
  }
  return response.result;
}

async function pollTask(input: {
  apiKey: string;
  endpoint: "/print/analyze" | "/print/repair" | "/remesh";
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
    const task = await meshyJson(
      input.apiKey,
      `${input.endpoint}/${input.taskId}`,
      { method: "GET" },
    );
    lastTask = task;
    console.info("Meshy print-tooling task status", {
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

const transientMeshyStatusCodes = new Set([429, 500, 502, 503, 504]);

async function meshyJson(
  apiKey: string,
  endpoint: string,
  init: {
    method: "GET" | "POST";
    body?: Record<string, unknown>;
  },
): Promise<MeshyJsonResponse> {
  const maxAttempts = init.method === "GET" ? 3 : 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${meshyOpenApiRoot}${endpoint}`, {
        method: init.method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
      });
    } catch (error) {
      if (attempt < maxAttempts) {
        await sleep(1_000 * attempt);
        continue;
      }
      throw new Error(
        `Meshy ${init.method} ${endpoint} network failure: ${describeFetchError(error)}`,
      );
    }

    const text = await response.text();
    let data: MeshyJsonResponse;
    try {
      data = text ? (JSON.parse(text) as MeshyJsonResponse) : {};
    } catch {
      data = { message: text };
    }

    if (!response.ok) {
      if (
        init.method === "GET" &&
        transientMeshyStatusCodes.has(response.status) &&
        attempt < maxAttempts
      ) {
        await sleep(1_000 * attempt);
        continue;
      }
      const message = data.message ?? data.error ?? text.slice(0, 200);
      throw new Error(
        `Meshy ${init.method} ${endpoint} failed: ${response.status} ${message}`,
      );
    }

    return data;
  }

  throw new Error(`Meshy ${init.method} ${endpoint} failed unexpectedly.`);
}

async function saveTaskAssets(input: {
  task: MeshyTask;
  outputPrefix: string;
  modelFilenameBase: string;
  thumbnailFilename: string;
  metadata: Record<string, string>;
}): Promise<SavedProviderAsset[]> {
  const assets: SavedProviderAsset[] = [];

  for (const [format, url] of Object.entries(input.task.model_urls ?? {})) {
    if (!url) {
      continue;
    }
    const storagePath = `${input.outputPrefix}/${input.modelFilenameBase}.${format}`;
    await saveRemoteFile({
      url,
      storagePath,
      contentType: contentTypeForModelFormat(format),
      metadata: { ...input.metadata, artifactRole: `model-${format}` },
    });
    assets.push({
      kind: "model",
      format,
      storagePath,
      contentType: contentTypeForModelFormat(format),
    });
  }

  if (input.task.thumbnail_url) {
    const storagePath = `${input.outputPrefix}/${input.thumbnailFilename}`;
    await saveRemoteFile({
      url: input.task.thumbnail_url,
      storagePath,
      contentType: "image/png",
      metadata: { ...input.metadata, artifactRole: "thumbnail" },
    });
    assets.push({
      kind: "thumbnail",
      storagePath,
      contentType: "image/png",
    });
  }

  let textureIndex = 0;
  for (const textureSet of input.task.texture_urls ?? []) {
    for (const [map, url] of Object.entries(textureSet ?? {})) {
      if (!url) {
        continue;
      }
      const storagePath = `${input.outputPrefix}/textures/texture-${textureIndex}-${map}.png`;
      await saveRemoteFile({
        url,
        storagePath,
        contentType: "image/png",
        metadata: { ...input.metadata, artifactRole: `texture-${map}` },
      });
      assets.push({
        kind: "texture",
        map,
        storagePath,
        contentType: "image/png",
      });
      textureIndex += 1;
    }
  }

  return assets;
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
  await getStorage()
    .bucket(process.env.APP_STORAGE_BUCKET)
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

function sanitizeModelTask(task: MeshyTask) {
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
    texture_map_sets: Array.isArray(task.texture_urls)
      ? task.texture_urls.map((textureSet) =>
          Object.keys(textureSet ?? {}).join(","),
        )
      : [],
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
    task_error: task.task_error,
    printability: task.printability,
  };
}

function firstAvailableModelUrl(task: MeshyTask, formats: string[]) {
  for (const format of formats) {
    const url = task.model_urls?.[format];
    if (url) {
      return { format, url };
    }
  }
  for (const [format, url] of Object.entries(task.model_urls ?? {})) {
    if (url) {
      return { format, url };
    }
  }
  return null;
}

function contentTypeForModelFormat(format: string): string {
  if (format === "glb") {
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

function storageMetadata(
  input: FigurinePrintToolingInput,
  stage: string,
): Record<string, string> {
  return {
    jobId: input.jobId,
    uid: input.uid,
    provider: "meshy",
    workflow: "figurine_assembled_print_tooling",
    stage,
  };
}

function describeFetchError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const cause = (error as Error & { cause?: unknown }).cause;
  return cause instanceof Error
    ? `${error.message} (cause: ${cause.message})`
    : error.message;
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
