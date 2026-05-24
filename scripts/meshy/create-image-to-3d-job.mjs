#!/usr/bin/env node

import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const API_ROOT = "https://api.meshy.ai/openapi/v1";
const TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "CANCELED", "EXPIRED"]);
const DEFAULT_FORMATS = ["glb", "stl", "3mf"];

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");

function usage() {
  console.log(`Usage:
  node scripts/meshy/create-image-to-3d-job.mjs [options]

Options:
  --input <path>             Local JPG/PNG input image.
  --output-root <path>       Output root for local artifacts.
  --task-id <id>             Poll/download an existing Meshy image-to-3d task.
  --poll-interval-ms <ms>    Poll interval. Default: 10000.
  --timeout-minutes <n>      Poll timeout. Default: 60.
  --formats <csv>            Target formats. Default: glb,stl,3mf.
  --target-polycount <n>     Remeshed target polycount. Default: 100000.
  --pose-mode <value>        Meshy pose_mode: "", a-pose, or t-pose.
  --no-texture               Request geometry without texture.
  --help                     Show this help.
`);
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${token}`);
    }

    const [rawKey, inlineValue] = token.slice(2).split("=", 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

    if (key === "help" || key === "noTexture") {
      args[key] = true;
      continue;
    }

    const value = inlineValue ?? argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${rawKey}`);
    }

    args[key] = value;
    if (inlineValue === undefined) {
      index += 1;
    }
  }

  return args;
}

async function loadEnvFile(filePath) {
  let content;
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    const quote = value[0];
    if ((quote === "'" || quote === '"') && value.endsWith(quote)) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function resolveFromRoot(value, fallback) {
  const chosen = value ?? fallback;
  return path.isAbsolute(chosen) ? chosen : path.resolve(repoRoot, chosen);
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") {
    return "image/jpeg";
  }
  if (ext === ".png") {
    return "image/png";
  }
  throw new Error(`Unsupported input image extension: ${ext || "(none)"}`);
}

function extensionFromUrl(url, fallback) {
  try {
    const parsed = new URL(url);
    const ext = path.extname(parsed.pathname);
    return ext || fallback;
  } catch {
    return fallback;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timestampForPath() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function sanitizeRequest(request) {
  return {
    ...request,
    image_url: request.image_url ? "<base64-data-uri-redacted>" : undefined,
    texture_image_url: request.texture_image_url
      ? "<base64-data-uri-redacted>"
      : undefined,
  };
}

function sanitizeTask(task, downloadedAssets = []) {
  const modelFormats = Object.keys(task.model_urls ?? {});
  const thumbnailViews = Object.keys(task.thumbnail_urls ?? {});
  const textureMaps = Array.isArray(task.texture_urls)
    ? task.texture_urls.map((textureSet) => Object.keys(textureSet ?? {}))
    : [];

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
    model_formats: modelFormats,
    has_thumbnail_url: Boolean(task.thumbnail_url),
    thumbnail_views: thumbnailViews,
    texture_maps: textureMaps,
    downloaded_assets: downloadedAssets,
  };
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function appendJsonLine(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`);
}

async function meshyJson(apiKey, endpoint, init = {}) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    ...init.headers,
  };

  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_ROOT}${endpoint}`, {
    ...init,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!response.ok) {
    const message = data.message ?? data.error ?? text.slice(0, 200);
    throw new Error(`Meshy ${init.method ?? "GET"} ${endpoint} failed: ${response.status} ${message}`);
  }

  return data;
}

async function downloadFile(url, destination) {
  await fs.mkdir(path.dirname(destination), { recursive: true });

  const response = await fetch(url);
  if (!response.ok || response.body === null) {
    throw new Error(`Download failed for ${path.basename(destination)}: ${response.status}`);
  }

  await pipeline(response.body, createWriteStream(destination));
  const stats = await fs.stat(destination);
  return stats.size;
}

async function downloadTaskAssets(task, outputDir) {
  const assets = [];

  for (const [format, url] of Object.entries(task.model_urls ?? {})) {
    const filename =
      format === "pre_remeshed_glb"
        ? "model.pre-remeshed.glb"
        : `model.${format.trim()}`;
    const destination = path.join(outputDir, filename);
    const sizeBytes = await downloadFile(url, destination);
    assets.push({
      kind: "model",
      format,
      file: path.relative(outputDir, destination),
      size_bytes: sizeBytes,
    });
  }

  if (task.thumbnail_url) {
    const destination = path.join(outputDir, "thumbnail.png");
    const sizeBytes = await downloadFile(task.thumbnail_url, destination);
    assets.push({
      kind: "thumbnail",
      file: path.relative(outputDir, destination),
      size_bytes: sizeBytes,
    });
  }

  for (const [view, url] of Object.entries(task.thumbnail_urls ?? {})) {
    const destination = path.join(outputDir, "thumbnails", `${view}.png`);
    const sizeBytes = await downloadFile(url, destination);
    assets.push({
      kind: "thumbnail_view",
      view,
      file: path.relative(outputDir, destination),
      size_bytes: sizeBytes,
    });
  }

  if (Array.isArray(task.texture_urls)) {
    for (let index = 0; index < task.texture_urls.length; index += 1) {
      const textureSet = task.texture_urls[index] ?? {};
      for (const [mapName, url] of Object.entries(textureSet)) {
        const ext = extensionFromUrl(url, ".png");
        const destination = path.join(
          outputDir,
          "textures",
          `texture-${index}-${mapName}${ext}`,
        );
        const sizeBytes = await downloadFile(url, destination);
        assets.push({
          kind: "texture",
          map: mapName,
          file: path.relative(outputDir, destination),
          size_bytes: sizeBytes,
        });
      }
    }
  }

  return assets;
}

async function createTask(apiKey, args) {
  const inputPath = resolveFromRoot(
    args.input,
    path.join(".tmp", "Profile-Pic-HIMSS.jpg"),
  );
  const image = await fs.readFile(inputPath);
  const mediaType = contentTypeFor(inputPath);
  const formats = (args.formats ?? DEFAULT_FORMATS.join(","))
    .split(",")
    .map((format) => format.trim())
    .filter(Boolean);

  const shouldTexture = !args.noTexture;
  const request = {
    image_url: `data:${mediaType};base64,${image.toString("base64")}`,
    ai_model: "meshy-6",
    model_type: "standard",
    should_texture: shouldTexture,
    enable_pbr: false,
    should_remesh: true,
    target_polycount: Number(args.targetPolycount ?? 100000),
    save_pre_remeshed_model: true,
    image_enhancement: true,
    remove_lighting: true,
    moderation: true,
    target_formats: formats,
  };

  if (args.poseMode !== undefined) {
    request.pose_mode = args.poseMode;
  }

  const response = await meshyJson(apiKey, "/image-to-3d", {
    method: "POST",
    body: request,
  });

  return {
    inputPath,
    request,
    taskId: response.result,
  };
}

async function pollTask(apiKey, taskId, outputDir, args) {
  const intervalMs = Number(args.pollIntervalMs ?? 10000);
  const timeoutMs = Number(args.timeoutMinutes ?? 60) * 60 * 1000;
  const startedAt = Date.now();
  let lastTask = null;

  while (Date.now() - startedAt < timeoutMs) {
    const task = await meshyJson(apiKey, `/image-to-3d/${taskId}`);
    lastTask = task;

    const safeTask = sanitizeTask(task);
    await appendJsonLine(path.join(outputDir, "poll-log.jsonl"), {
      checked_at: new Date().toISOString(),
      ...safeTask,
    });
    await writeJson(path.join(outputDir, "task.latest.sanitized.json"), safeTask);

    const progressLabel =
      task.progress === undefined || task.progress === null
        ? "unknown progress"
        : `${task.progress}%`;
    console.log(`Meshy task ${taskId}: ${task.status} (${progressLabel})`);

    if (TERMINAL_STATUSES.has(task.status)) {
      return task;
    }

    await sleep(intervalMs);
  }

  throw new Error(
    `Timed out while waiting for Meshy task ${taskId}. Last status: ${lastTask?.status ?? "unknown"}`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  await loadEnvFile(path.join(repoRoot, ".env"));
  await loadEnvFile(path.join(repoRoot, "apps", "functions", ".env"));

  const apiKey = process.env.MESHY_API_KEY;
  if (!apiKey) {
    throw new Error("MESHY_API_KEY is not set in the environment or local .env file.");
  }

  const outputRoot = resolveFromRoot(
    args.outputRoot,
    path.join(".tmp", "print-files"),
  );
  let taskId = args.taskId;
  let request = null;
  let inputPath = args.input
    ? resolveFromRoot(args.input)
    : path.join(repoRoot, ".tmp", "Profile-Pic-HIMSS.jpg");

  if (!taskId) {
    console.log("Creating Meshy image-to-3d task...");
    const created = await createTask(apiKey, args);
    taskId = created.taskId;
    request = created.request;
    inputPath = created.inputPath;
  } else {
    console.log(`Using existing Meshy image-to-3d task ${taskId}...`);
  }

  if (!taskId) {
    throw new Error("Meshy did not return a task id.");
  }

  const outputDir = path.join(outputRoot, "meshy", `${timestampForPath()}-${taskId}`);
  await fs.mkdir(outputDir, { recursive: true });

  const sourceStats = await fs.stat(inputPath).catch(() => null);
  await writeJson(path.join(outputDir, "run.sanitized.json"), {
    created_at: new Date().toISOString(),
    task_id: taskId,
    input: {
      path: inputPath,
      basename: path.basename(inputPath),
      size_bytes: sourceStats?.size,
    },
    output_dir: outputDir,
    request: request ? sanitizeRequest(request) : null,
  });

  console.log(`Task id: ${taskId}`);
  console.log(`Output directory: ${outputDir}`);

  const finalTask = await pollTask(apiKey, taskId, outputDir, args);

  if (finalTask.status !== "SUCCEEDED") {
    await writeJson(
      path.join(outputDir, "task.final.sanitized.json"),
      sanitizeTask(finalTask),
    );
    const errorMessage = finalTask.task_error?.message
      ? ` ${finalTask.task_error.message}`
      : "";
    throw new Error(`Meshy task ${taskId} ended with status ${finalTask.status}.${errorMessage}`);
  }

  console.log("Downloading Meshy assets...");
  const downloadedAssets = await downloadTaskAssets(finalTask, outputDir);
  const finalSummary = sanitizeTask(finalTask, downloadedAssets);
  await writeJson(path.join(outputDir, "task.final.sanitized.json"), finalSummary);

  console.log("Downloaded assets:");
  for (const asset of downloadedAssets) {
    console.log(`- ${asset.file} (${asset.size_bytes} bytes)`);
  }
  console.log(`Done: ${outputDir}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
