#!/usr/bin/env node

/**
 * Meshy Experiment 002: Emoji/avatar Natural pose, Meshy multi-view path.
 *
 * Sequence:
 *   source/reference image(s)
 *   -> Meshy Image to Image with generate_multi_view=true
 *   -> Meshy Multi-Image to 3D
 *   -> Meshy Analyze Printability
 *   -> local assets under .tmp/experiments/meshy/exp-002-...
 *
 * Why this exists:
 *   Experiment 001 proved the 2D-proof-to-3D idea visually, but one front-facing
 *   concept left Meshy with limited side/back/body information and the mesh was
 *   not print-ready. Experiment 002 asks Meshy to create multi-view references
 *   before generating the 3D model.
 *
 * Status:
 *   Running this script will create paid Meshy tasks.
 */

import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const API_ROOT = "https://api.meshy.ai/openapi/v1";
const TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "CANCELED", "EXPIRED"]);
const DEFAULT_FORMATS = ["glb", "stl", "3mf"];
const DEFAULT_IMAGE_MODEL = "gpt-image-2";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..", "..", "..");

function usage() {
  console.log(`Usage:
  node scripts/meshy/run-emoji-natural-multiview-experiment.mjs [options]

Options:
  --input <path>             Primary local JPG/PNG source image. Default: .tmp/Profile-Pic-HIMSS.jpg.
  --reference <path>         Extra local JPG/PNG reference image. Can be repeated, max 4 extras.
  --base-reference <path>    Local JPG/PNG base style reference image.
  --base-label <text>        Add a round base with this exact front label.
  --experiment-slug <slug>   Output folder suffix. Default: exp-002-emoji-natural-multiview.
  --deterministic-base <id>  Add local deterministic geometry after Meshy. Supported: printu-star.
  --normalize-artifact <id>  Normalize a downloaded Meshy artifact after generation. Supported: glb,stl,3mf,pre-remeshed-glb.
  --normalization-target-height-mm <n>
                              Target normalized height. Default: use downloaded model.3mf height.
  --postprocess-python <cmd> Python command for local postprocess steps. Default: python.
  --output-root <path>       Output root. Default: .tmp/experiments/meshy.
  --image-model <id>         Meshy image model. Default: gpt-image-2.
  --skip-image-task-id <id>  Use an existing succeeded Meshy image-to-image multi-view task.
  --image-only               Stop after Meshy Image to Image multi-view output.
  --poll-interval-ms <ms>    Poll interval. Default: 10000.
  --timeout-minutes <n>      Poll timeout per task. Default: 60.
  --formats <csv>            Target 3D formats. Default: glb,stl,3mf.
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

    if (key === "help" || key === "imageOnly" || key === "noTexture") {
      args[key] = true;
      continue;
    }

    const value = inlineValue ?? argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${rawKey}`);
    }

    if (key === "reference") {
      args.reference = [...(args.reference ?? []), value];
    } else {
      args[key] = value;
    }

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

function timestampForPath() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") {
    return "image/jpeg";
  }
  if (ext === ".png") {
    return "image/png";
  }
  throw new Error(`Unsupported image extension: ${ext || "(none)"}`);
}

function extensionFromUrl(url, fallback) {
  try {
    const parsed = new URL(url);
    return path.extname(parsed.pathname) || fallback;
  } catch {
    return fallback;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function appendJsonLine(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function fileToDataUri(filePath) {
  const image = await fs.readFile(filePath);
  return `data:${contentTypeFor(filePath)};base64,${image.toString("base64")}`;
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

function buildMultiviewPrompt(args) {
  const lines = [
    "Create a clean multi-view character sheet for a personalized 3D printed emoji/avatar figurine.",
    "Use the reference image(s) for identity, head shape, glasses or facial hair if present, and the main outfit color impression.",
    "Style: emoji avatar, toy figurine, smooth rounded vinyl/plastic surfaces, simple expressive face, broad color regions, friendly proportions.",
    "Pose: natural standing pose with feet planted, arms slightly away from the torso, hands visible, and a balanced body that can be made into a printable figurine.",
  ];

  if (args.baseLabel) {
    lines.push(
      `Base: include a single round gray display pedestal under the feet, inspired by the supplied base reference image if present. Add an engraved or raised front nameplate/sign on the base that reads exactly "${args.baseLabel}". The text must appear only on the front of the base, be centered, large, clean, and legible.`,
      "Keep the base physically attached to the feet and make it sturdy for 3D printing. Avoid extra props, extra labels, duplicate text, or floating decorations.",
    );
  } else {
    lines.push(
      "Body-only output: do not include a base, pedestal, platform, stand, plaque, nameplate, sign, ground disk, scenery, or support prop. If any reference image already contains a base or pedestal, ignore it and remove it from the generated views.",
      "Show the shoes or feet clearly, flat on an invisible ground plane, with enough contact area for later deterministic base attachment.",
    );
  }

  const consistencyTarget = args.baseLabel
    ? "body proportions, outfit colors, head shape, accessories, and base"
    : "body proportions, outfit colors, head shape, accessories, shoes or feet, and no-base body-only silhouette";

  lines.push(
    `Views: generate consistent front, side, and back views of the same character. Keep the ${consistencyTarget} consistent across views.`,
    "Background: plain white studio background, one centered character per view, no text, no watermark, no scene, no extra props.",
    "Printability: avoid fragile fingers, floating parts, cropped limbs, hair wisps, photorealistic skin texture, busy fabric detail, or side-only silhouettes.",
  );

  return lines.join("\n");
}

function sanitizeImageTask(task, downloadedImages = []) {
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
    image_count: Array.isArray(task.image_urls) ? task.image_urls.length : undefined,
    downloaded_images: downloadedImages,
  };
}

function sanitizeModelTask(task, downloadedAssets = []) {
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
    model_formats: Object.keys(task.model_urls ?? {}),
    has_thumbnail_url: Boolean(task.thumbnail_url),
    texture_maps: Array.isArray(task.texture_urls)
      ? task.texture_urls.map((textureSet) => Object.keys(textureSet ?? {}))
      : [],
    downloaded_assets: downloadedAssets,
  };
}

function sanitizePrintabilityTask(task) {
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

async function runProcess(command, args, outputDir, filenamePrefix) {
  await fs.mkdir(outputDir, { recursive: true });
  const stdoutPath = path.join(outputDir, `${filenamePrefix}.stdout.log`);
  const stderrPath = path.join(outputDir, `${filenamePrefix}.stderr.log`);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks = [];
    const stderrChunks = [];

    child.stdout.on("data", (chunk) => {
      stdoutChunks.push(Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk) => {
      stderrChunks.push(Buffer.from(chunk));
    });
    child.on("error", reject);
    child.on("close", async (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      await fs.writeFile(stdoutPath, stdout);
      await fs.writeFile(stderrPath, stderr);

      if (code !== 0) {
        reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}: ${stderr || stdout}`));
        return;
      }

      resolve({ stdoutPath, stderrPath });
    });
  });
}

async function runDeterministicPostprocess(runDir, args) {
  if (!args.deterministicBase) {
    return null;
  }

  if (args.deterministicBase !== "printu-star") {
    throw new Error(`Unsupported deterministic base: ${args.deterministicBase}`);
  }

  const inputModelPath = path.join(runDir, "model.stl");
  const outputDir = path.join(runDir, "postprocessed", args.deterministicBase);
  const scriptPath = path.join(repoRoot, "scripts", "meshy", "add_printu_star_base.py");
  const pythonCommand = args.postprocessPython ?? "python";

  console.log(`Adding deterministic ${args.deterministicBase} base after Meshy...`);
  await runProcess(
    pythonCommand,
    [
      scriptPath,
      "--input",
      inputModelPath,
      "--output-dir",
      outputDir,
      "--base-style",
      args.deterministicBase,
    ],
    outputDir,
    "postprocess",
  );

  const metadata = await readJson(path.join(outputDir, "postprocess.metadata.json"));
  await writeJson(path.join(runDir, "deterministic-postprocess.sanitized.json"), metadata);
  return metadata;
}

function normalizedArtifactFilename(value) {
  const key = value.trim().toLowerCase();
  const supported = {
    glb: "model.glb",
    stl: "model.stl",
    "3mf": "model.3mf",
    "pre-remeshed-glb": "model.pre-remeshed.glb",
    pre_remeshed_glb: "model.pre-remeshed.glb",
  };
  const filename = supported[key];
  if (!filename) {
    throw new Error(`Unsupported --normalize-artifact value: ${value}`);
  }
  return { key: key.replaceAll("_", "-"), filename };
}

async function runArtifactNormalizationPostprocess(runDir, args) {
  if (!args.normalizeArtifact) {
    return null;
  }

  const { key, filename } = normalizedArtifactFilename(args.normalizeArtifact);
  const inputModelPath = path.join(runDir, filename);
  const reference3mfPath = path.join(runDir, "model.3mf");
  const outputDir = path.join(runDir, "postprocessed", `normalized-${key}`);
  const scriptPath = path.join(
    repoRoot,
    "services",
    "print-file-generator",
    "scripts",
    "normalize_meshy_artifact.py",
  );
  const pythonCommand = args.postprocessPython ?? "python";
  const processArgs = [
    scriptPath,
    "--source",
    inputModelPath,
    "--reference-3mf",
    reference3mfPath,
    "--output-dir",
    outputDir,
  ];

  if (args.normalizationTargetHeightMm !== undefined) {
    processArgs.push("--target-height-mm", args.normalizationTargetHeightMm);
  }

  console.log(`Normalizing Meshy ${key} artifact after download...`);
  await runProcess(pythonCommand, processArgs, outputDir, "normalization");

  const metadata = await readJson(path.join(outputDir, "normalization.metadata.json"));
  await writeJson(path.join(runDir, "artifact-normalization.sanitized.json"), metadata);
  return metadata;
}

async function createImageTask(apiKey, referencePaths, args) {
  const request = {
    ai_model: args.imageModel ?? DEFAULT_IMAGE_MODEL,
    prompt: buildMultiviewPrompt(args),
    reference_image_urls: await Promise.all(referencePaths.map(fileToDataUri)),
    generate_multi_view: true,
  };

  const response = await meshyJson(apiKey, "/image-to-image", {
    method: "POST",
    body: request,
  });

  return {
    request,
    taskId: response.result,
  };
}

async function pollTask(apiKey, endpoint, taskId, outputDir, filenamePrefix, sanitize, args) {
  const intervalMs = Number(args.pollIntervalMs ?? 10000);
  const timeoutMs = Number(args.timeoutMinutes ?? 60) * 60 * 1000;
  const startedAt = Date.now();
  let lastTask = null;

  while (Date.now() - startedAt < timeoutMs) {
    const task = await meshyJson(apiKey, `${endpoint}/${taskId}`);
    lastTask = task;

    const safeTask = sanitize(task);
    await appendJsonLine(path.join(outputDir, `${filenamePrefix}.poll-log.jsonl`), {
      checked_at: new Date().toISOString(),
      ...safeTask,
    });
    await writeJson(path.join(outputDir, `${filenamePrefix}.latest.sanitized.json`), safeTask);

    const progressLabel =
      task.progress === undefined || task.progress === null
        ? "unknown progress"
        : `${task.progress}%`;
    console.log(`Meshy ${filenamePrefix} ${taskId}: ${task.status} (${progressLabel})`);

    if (TERMINAL_STATUSES.has(task.status)) {
      return task;
    }

    await sleep(intervalMs);
  }

  throw new Error(
    `Timed out while waiting for ${filenamePrefix} task ${taskId}. Last status: ${lastTask?.status ?? "unknown"}`,
  );
}

async function downloadImageTaskImages(task, outputDir) {
  const downloaded = [];
  const imageUrls = Array.isArray(task.image_urls) ? task.image_urls : [];

  for (let index = 0; index < imageUrls.length; index += 1) {
    const url = imageUrls[index];
    const ext = extensionFromUrl(url, ".png");
    const destination = path.join(outputDir, "multiview", `view-${index + 1}${ext}`);
    const sizeBytes = await downloadFile(url, destination);
    downloaded.push({
      file: path.relative(outputDir, destination),
      size_bytes: sizeBytes,
    });
  }

  return downloaded;
}

async function createMultiImageTo3dTask(apiKey, inputTaskId, args) {
  const formats = (args.formats ?? DEFAULT_FORMATS.join(","))
    .split(",")
    .map((format) => format.trim())
    .filter(Boolean);

  const request = {
    input_task_id: inputTaskId,
    ai_model: "meshy-6",
    should_texture: !args.noTexture,
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

  const response = await meshyJson(apiKey, "/multi-image-to-3d", {
    method: "POST",
    body: request,
  });

  return {
    request,
    taskId: response.result,
  };
}

async function downloadModelTaskAssets(task, outputDir) {
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

  if (Array.isArray(task.texture_urls)) {
    for (let index = 0; index < task.texture_urls.length; index += 1) {
      const textureSet = task.texture_urls[index] ?? {};
      for (const [mapName, url] of Object.entries(textureSet)) {
        const ext = extensionFromUrl(url, ".png");
        const destination = path.join(outputDir, "textures", `texture-${index}-${mapName}${ext}`);
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

async function createPrintabilityTask(apiKey, modelTaskId) {
  const response = await meshyJson(apiKey, "/print/analyze", {
    method: "POST",
    body: {
      input_task_id: modelTaskId,
    },
  });

  return response.result;
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

  const outputRoot = resolveFromRoot(args.outputRoot, path.join(".tmp", "experiments", "meshy"));
  const experimentSlug = args.experimentSlug ?? "exp-002-emoji-natural-multiview";
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(experimentSlug)) {
    throw new Error("--experiment-slug must contain only letters, numbers, and hyphens.");
  }
  const runDir = path.join(outputRoot, `${experimentSlug}-${timestampForPath()}`);
  await fs.mkdir(runDir, { recursive: true });

  const inputPath = resolveFromRoot(args.input, path.join(".tmp", "Profile-Pic-HIMSS.jpg"));
  const referencePaths = [
    inputPath,
    ...(args.baseReference ? [resolveFromRoot(args.baseReference)] : []),
    ...(args.reference ?? []).map((reference) => resolveFromRoot(reference)),
  ];
  if (referencePaths.length > 5) {
    throw new Error("Meshy Image to Image accepts at most 5 reference images.");
  }

  await writeJson(path.join(runDir, "experiment.sanitized.json"), {
    created_at: new Date().toISOString(),
    experiment_id: "meshy-exp-002-emoji-natural-multiview",
    experiment_slug: experimentSlug,
    base_label: args.baseLabel,
    base_reference_path: args.baseReference ? resolveFromRoot(args.baseReference) : undefined,
    deterministic_base: args.deterministicBase,
    normalize_artifact: args.normalizeArtifact,
    normalization_target_height_mm: args.normalizationTargetHeightMm,
    status: "started",
    reference_paths: referencePaths,
    run_dir: runDir,
    source_docs: [
      "https://docs.meshy.ai/en/api/image-to-image",
      "https://docs.meshy.ai/en/api/multi-image-to-3d",
      "https://docs.meshy.ai/en/api/analyze-printability",
    ],
  });

  let imageTaskId = args.skipImageTaskId;
  if (!imageTaskId) {
    console.log("Creating Meshy Image to Image multi-view task...");
    const created = await createImageTask(apiKey, referencePaths, args);
    imageTaskId = created.taskId;
    await writeJson(path.join(runDir, "image-task.request.sanitized.json"), {
      ...created.request,
      reference_image_urls: created.request.reference_image_urls.map(() => "<base64-data-uri-redacted>"),
    });
  }

  if (!imageTaskId) {
    throw new Error("Meshy did not return an image task id.");
  }

  console.log(`Image task id: ${imageTaskId}`);
  const imageTask = await pollTask(
    apiKey,
    "/image-to-image",
    imageTaskId,
    runDir,
    "image-task",
    sanitizeImageTask,
    args,
  );

  if (imageTask.status !== "SUCCEEDED") {
    await writeJson(path.join(runDir, "image-task.final.sanitized.json"), sanitizeImageTask(imageTask));
    throw new Error(`Meshy image task ${imageTaskId} ended with status ${imageTask.status}.`);
  }

  console.log("Downloading multi-view reference images...");
  const downloadedImages = await downloadImageTaskImages(imageTask, runDir);
  await writeJson(
    path.join(runDir, "image-task.final.sanitized.json"),
    sanitizeImageTask(imageTask, downloadedImages),
  );

  if (args.imageOnly) {
    console.log(`Image-only experiment done: ${runDir}`);
    return;
  }

  console.log("Creating Meshy Multi-Image to 3D task...");
  const modelCreated = await createMultiImageTo3dTask(apiKey, imageTaskId, args);
  await writeJson(path.join(runDir, "model-task.request.sanitized.json"), modelCreated.request);
  console.log(`Model task id: ${modelCreated.taskId}`);

  const modelTask = await pollTask(
    apiKey,
    "/multi-image-to-3d",
    modelCreated.taskId,
    runDir,
    "model-task",
    sanitizeModelTask,
    args,
  );

  if (modelTask.status !== "SUCCEEDED") {
    await writeJson(path.join(runDir, "model-task.final.sanitized.json"), sanitizeModelTask(modelTask));
    throw new Error(`Meshy model task ${modelCreated.taskId} ended with status ${modelTask.status}.`);
  }

  console.log("Downloading Meshy model assets...");
  const downloadedAssets = await downloadModelTaskAssets(modelTask, runDir);
  await writeJson(
    path.join(runDir, "model-task.final.sanitized.json"),
    sanitizeModelTask(modelTask, downloadedAssets),
  );

  console.log("Creating Meshy printability analysis...");
  const printabilityTaskId = await createPrintabilityTask(apiKey, modelCreated.taskId);
  console.log(`Printability task id: ${printabilityTaskId}`);
  const printabilityTask = await pollTask(
    apiKey,
    "/print/analyze",
    printabilityTaskId,
    runDir,
    "printability-task",
    sanitizePrintabilityTask,
    args,
  );
  await writeJson(
    path.join(runDir, "printability-task.final.sanitized.json"),
    sanitizePrintabilityTask(printabilityTask),
  );

  const deterministicPostprocess = await runDeterministicPostprocess(runDir, args);
  const artifactNormalization = await runArtifactNormalizationPostprocess(runDir, args);

  await writeJson(path.join(runDir, "experiment.sanitized.json"), {
    completed_at: new Date().toISOString(),
    experiment_id: "meshy-exp-002-emoji-natural-multiview",
    experiment_slug: experimentSlug,
    base_label: args.baseLabel,
    base_reference_path: args.baseReference ? resolveFromRoot(args.baseReference) : undefined,
    deterministic_base: args.deterministicBase,
    normalize_artifact: args.normalizeArtifact,
    normalization_target_height_mm: args.normalizationTargetHeightMm,
    deterministic_postprocess: deterministicPostprocess
      ? {
          postprocess_id: deterministicPostprocess.postprocess_id,
          output_dir: path.dirname(
            deterministicPostprocess.exported_files?.stl?.path ??
              path.join(runDir, "postprocessed", args.deterministicBase),
          ),
          exported_files: deterministicPostprocess.exported_files,
          combined_mesh: deterministicPostprocess.combined_mesh,
        }
      : null,
    artifact_normalization: artifactNormalization
      ? {
          postprocess_id: artifactNormalization.postprocess_id,
          output_dir: path.dirname(artifactNormalization.exported_files?.stl?.path ?? ""),
          source_model: artifactNormalization.source_model,
          target_height_mm: artifactNormalization.target_height_mm,
          scale_factor: artifactNormalization.scale_factor,
          exported_files: artifactNormalization.exported_files,
          normalized_mesh: artifactNormalization.normalized_mesh,
        }
      : null,
    status: "completed",
    reference_paths: referencePaths,
    image_task_id: imageTaskId,
    model_task_id: modelCreated.taskId,
    printability_task_id: printabilityTaskId,
    printability_status: printabilityTask.printability?.status ?? "unknown",
    run_dir: runDir,
  });

  console.log(`Experiment 002 done: ${runDir}`);
  console.log(`Image task: ${imageTaskId}`);
  console.log(`Model task: ${modelCreated.taskId}`);
  console.log(`Printability: ${printabilityTask.printability?.status ?? "unknown"}`);
  if (deterministicPostprocess) {
    console.log(
      `Postprocessed: ${deterministicPostprocess.exported_files?.stl?.path ?? "deterministic base generated"}`,
    );
  }
  if (artifactNormalization) {
    console.log(
      `Normalized artifact: ${artifactNormalization.exported_files?.stl?.path ?? "artifact normalized"}`,
    );
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
