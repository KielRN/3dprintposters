#!/usr/bin/env node

/**
 * Standard figurine experiment runner.
 *
 * Default sequence:
 *   source photo
 *   -> Vertex/Gemini body-only 2D concept
 *   -> Meshy Image-to-Image multi-view references
 *   -> Meshy Multi-Image-to-3D
 *   -> Meshy printability analysis
 *   -> local scale/orientation normalization
 *
 * Running the full default path creates paid Vertex/Gemini and Meshy tasks.
 */

import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const VERTEX_EXPRESS_BASE_URL = "https://aiplatform.googleapis.com/v1";
const DEFAULT_VERTEX_IMAGE_MODEL = "gemini-2.5-flash-image";
const MESHY_API_ROOT = "https://api.meshy.ai/openapi/v1";
const DEFAULT_MESHY_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_MODEL_FORMATS = ["glb", "stl", "3mf"];
const TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "CANCELED", "EXPIRED"]);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");

function usage() {
  console.log(`Usage:
  node scripts/meshy/run-standard-figurine-experiment.mjs [options]

Options:
  --input <path>                    Local JPG/PNG source photo. Default: .tmp/Profile-Pic-HIMSS.jpg.
  --experiment-slug <slug>          Output folder suffix. Default: exp-005-standard-body-only-normalized.
  --output-root <path>              Output root. Default: .tmp/experiments/meshy/standard.
  --aspect-ratio <ratio>            Vertex image aspect ratio. Default: 3:4.
  --vertex-model <id>               Vertex/Gemini image model. Default: env VERTEX_IMAGE_MODEL or gemini-2.5-flash-image.
  --meshy-image-model <id>          Meshy image model. Default: gpt-image-2.
  --formats <csv>                   Meshy 3D target formats. Default: glb,stl,3mf.
  --target-polycount <n>            Meshy remeshed target polycount. Default: 100000.
  --pose-mode <value>               Meshy pose_mode: "", a-pose, or t-pose.
  --normalize-artifact <id>         Artifact to normalize. Default: glb. Supported: glb,stl,3mf,pre-remeshed-glb.
  --normalization-target-height-mm <n>
                                     Target normalized height. Default: use downloaded model.3mf height.
  --postprocess-python <cmd>        Python command for normalization. Default: python.
  --poll-interval-ms <ms>           Meshy poll interval. Default: 10000.
  --timeout-minutes <n>             Meshy poll timeout per task. Default: 60.
  --concept-only                    Stop after Vertex/Gemini concept generation.
  --multiview-only                  Stop after Meshy multi-view image generation.
  --skip-concept <path>             Use an existing concept PNG/JPG instead of calling Vertex/Gemini.
  --skip-image-task-id <id>         Use an existing succeeded Meshy image-to-image multi-view task.
  --no-texture                      Request geometry without texture.
  --help                            Show this help.
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

    if (["help", "conceptOnly", "multiviewOnly", "noTexture"].includes(key)) {
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

function extensionForMimeType(mimeType) {
  if (mimeType === "image/jpeg") {
    return "jpg";
  }
  if (mimeType === "image/webp") {
    return "webp";
  }
  return "png";
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

async function copyInputImage(sourcePath, runDir) {
  const ext = path.extname(sourcePath).toLowerCase() || ".jpg";
  const destination = path.join(runDir, "input", `source${ext}`);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(sourcePath, destination);
  return destination;
}

async function readErrorBody(response) {
  try {
    return (await response.text()).slice(0, 1000);
  } catch {
    return "Unable to read error body.";
  }
}

function normalizeVertexModelResource(model) {
  const trimmedModel = model.trim();
  if (trimmedModel.startsWith("publishers/")) {
    return trimmedModel;
  }
  return `publishers/google/models/${trimmedModel}`;
}

function buildVertexGenerateContentEndpoint(model, apiKey) {
  const baseUrl = (process.env.VERTEX_EXPRESS_BASE_URL ?? VERTEX_EXPRESS_BASE_URL).replace(
    /\/$/,
    "",
  );
  const modelResource = normalizeVertexModelResource(model)
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  const params = new URLSearchParams({ key: apiKey });
  return `${baseUrl}/${modelResource}:generateContent?${params.toString()}`;
}

function buildVertexConceptPrompt() {
  return [
    "Create one clean full-body 2D concept image for a personalized 3D printed emoji/avatar figurine.",
    "Use the uploaded photo only as the identity and outfit reference. Preserve recognizable facial likeness, broad head shape, glasses or facial hair if present, and the main clothing color impression.",
    "Style: emoji/avatar toy character, smooth rounded vinyl or plastic forms, simplified expressive face, friendly proportions, clean silhouette, and broad color regions.",
    "Pose: natural standing pose, front-facing or slight three-quarter view, with head, torso, arms, hands, legs, shoes, and feet all visible.",
    "Keep arms slightly away from the torso and hands visible. Keep the feet clear and flat on an invisible ground plane.",
    "Composition: single body-only character centered on a plain white studio background. No environment, no props unless they are part of the person, no text, and no watermark.",
    "No base, pedestal, platform, stand, plaque, nameplate, sign, ground disk, scenery, or support prop.",
    "Avoid fragile fingers, hair wisps, noisy textures, photorealistic pores, busy clothing detail, cropped limbs, bust-only framing, floating objects, display bases, or side-view-only body shapes.",
    "Output only the concept image.",
  ].join("\n");
}

function buildMeshyMultiviewPrompt() {
  return [
    "Create a clean multi-view character sheet from the approved reference concept.",
    "Use the reference concept as the source of truth for identity, head shape, facial hair or glasses if present, outfit colors, body proportions, and emoji/avatar toy style.",
    "Style: emoji/avatar toy figurine, smooth rounded vinyl or plastic surfaces, simple expressive face, broad color regions, friendly proportions.",
    "Pose: natural standing pose with feet planted, arms slightly away from the torso, hands visible, and a balanced body that can become a printable figurine.",
    "Body-only output: do not include a base, pedestal, platform, stand, plaque, nameplate, sign, ground disk, scenery, or support prop.",
    "If the reference image contains a base or pedestal, ignore it and remove it from the generated views.",
    "Views: generate consistent front, side, and back views of the same character. Keep body proportions, outfit colors, head shape, accessories, shoes or feet, and the no-base body-only silhouette consistent across views.",
    "Background: plain white studio background, one centered character per view, no text, no watermark, no scene, no extra props.",
    "Printability: avoid fragile fingers, floating parts, cropped limbs, hair wisps, photorealistic skin texture, busy fabric detail, or side-only silhouettes.",
  ].join("\n");
}

function extractResponseParts(response) {
  return response.candidates?.flatMap((candidate) => candidate.content?.parts ?? []) ?? [];
}

function normalizeInlineData(part) {
  if (part.inlineData) {
    return part.inlineData;
  }
  if (part.inline_data) {
    return {
      mimeType: part.inline_data.mime_type,
      data: part.inline_data.data,
    };
  }
  return undefined;
}

function extractGeneratedImage(response) {
  if (response.promptFeedback?.blockReason) {
    throw new Error(`Vertex/Gemini blocked the prompt: ${response.promptFeedback.blockReason}.`);
  }

  for (const part of extractResponseParts(response)) {
    const inlineData = normalizeInlineData(part);
    if (inlineData?.data) {
      return {
        mimeType: inlineData.mimeType ?? "image/png",
        data: inlineData.data,
      };
    }
  }

  const finishReason = response.candidates?.[0]?.finishReason;
  throw new Error(
    `Vertex/Gemini returned no generated image.${finishReason ? ` Finish reason: ${finishReason}.` : ""}`,
  );
}

function extractResponseText(response) {
  return extractResponseParts(response)
    .map((part) => part.text?.trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 4000);
}

async function generateVertexConcept(inputPath, runDir, args) {
  const apiKey = process.env.VERTEX_API_KEY;
  if (!apiKey) {
    throw new Error("VERTEX_API_KEY is required unless --skip-concept is provided.");
  }

  const model = args.vertexModel ?? process.env.VERTEX_IMAGE_MODEL ?? DEFAULT_VERTEX_IMAGE_MODEL;
  const prompt = buildVertexConceptPrompt();
  const sourceImageBuffer = await fs.readFile(inputPath);
  const sourceMimeType = contentTypeFor(inputPath);
  const aspectRatio = args.aspectRatio ?? "3:4";

  console.log("Generating body-only concept with Vertex/Gemini...");
  const response = await fetch(buildVertexGenerateContentEndpoint(model, apiKey), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "USER",
          parts: [
            {
              text: prompt,
            },
            {
              inlineData: {
                mimeType: sourceMimeType,
                data: sourceImageBuffer.toString("base64"),
              },
            },
          ],
        },
      ],
      generationConfig: {
        candidateCount: 1,
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: {
          aspectRatio,
        },
      },
      safetySettings: [
        {
          method: "PROBABILITY",
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "BLOCK_MEDIUM_AND_ABOVE",
        },
        {
          method: "PROBABILITY",
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE",
        },
        {
          method: "PROBABILITY",
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE",
        },
        {
          method: "PROBABILITY",
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE",
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Vertex/Gemini concept request failed with HTTP ${response.status}: ${await readErrorBody(response)}`,
    );
  }

  const vertexResponse = await response.json();
  const generatedImage = extractGeneratedImage(vertexResponse);
  const outputMimeType = generatedImage.mimeType;
  const conceptPath = path.join(runDir, "vertex", `concept.${extensionForMimeType(outputMimeType)}`);
  await fs.mkdir(path.dirname(conceptPath), { recursive: true });
  await fs.writeFile(conceptPath, Buffer.from(generatedImage.data, "base64"));

  await writeJson(path.join(runDir, "vertex", "concept.sanitized.json"), {
    created_at: new Date().toISOString(),
    provider: "vertex-gemini-direct",
    model,
    model_version: vertexResponse.modelVersion,
    aspect_ratio: aspectRatio,
    output_mime_type: outputMimeType,
    source: {
      path: inputPath,
      basename: path.basename(inputPath),
      size_bytes: sourceImageBuffer.byteLength,
      mime_type: sourceMimeType,
    },
    prompt,
    response_text: extractResponseText(vertexResponse),
    output: {
      path: conceptPath,
      basename: path.basename(conceptPath),
    },
  });

  return conceptPath;
}

async function meshyJson(apiKey, endpoint, init = {}) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    ...init.headers,
  };

  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${MESHY_API_ROOT}${endpoint}`, {
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

async function createImageTask(apiKey, conceptPath, runDir, args) {
  const request = {
    ai_model: args.meshyImageModel ?? DEFAULT_MESHY_IMAGE_MODEL,
    prompt: buildMeshyMultiviewPrompt(),
    reference_image_urls: [await fileToDataUri(conceptPath)],
    generate_multi_view: true,
  };

  const response = await meshyJson(apiKey, "/image-to-image", {
    method: "POST",
    body: request,
  });

  await writeJson(path.join(runDir, "meshy", "image-task.request.sanitized.json"), {
    ...request,
    reference_image_urls: ["<base64-data-uri-redacted>"],
  });

  return response.result;
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

async function downloadImageTaskImages(task, meshyDir) {
  const downloaded = [];
  const imageUrls = Array.isArray(task.image_urls) ? task.image_urls : [];

  for (let index = 0; index < imageUrls.length; index += 1) {
    const url = imageUrls[index];
    const ext = extensionFromUrl(url, ".png");
    const destination = path.join(meshyDir, "multiview", `view-${index + 1}${ext}`);
    const sizeBytes = await downloadFile(url, destination);
    downloaded.push({
      file: path.relative(meshyDir, destination),
      size_bytes: sizeBytes,
    });
  }

  return downloaded;
}

async function createMultiImageTo3dTask(apiKey, imageTaskId, runDir, args) {
  const formats = (args.formats ?? DEFAULT_MODEL_FORMATS.join(","))
    .split(",")
    .map((format) => format.trim())
    .filter(Boolean);

  const request = {
    input_task_id: imageTaskId,
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

  await writeJson(path.join(runDir, "meshy", "model-task.request.sanitized.json"), request);
  return response.result;
}

async function downloadModelTaskAssets(task, meshyDir) {
  const assets = [];

  for (const [format, url] of Object.entries(task.model_urls ?? {})) {
    const filename =
      format === "pre_remeshed_glb"
        ? "model.pre-remeshed.glb"
        : `model.${format.trim()}`;
    const destination = path.join(meshyDir, filename);
    const sizeBytes = await downloadFile(url, destination);
    assets.push({
      kind: "model",
      format,
      file: path.relative(meshyDir, destination),
      size_bytes: sizeBytes,
    });
  }

  if (task.thumbnail_url) {
    const destination = path.join(meshyDir, "thumbnail.png");
    const sizeBytes = await downloadFile(task.thumbnail_url, destination);
    assets.push({
      kind: "thumbnail",
      file: path.relative(meshyDir, destination),
      size_bytes: sizeBytes,
    });
  }

  if (Array.isArray(task.texture_urls)) {
    for (let index = 0; index < task.texture_urls.length; index += 1) {
      const textureSet = task.texture_urls[index] ?? {};
      for (const [mapName, url] of Object.entries(textureSet)) {
        const ext = extensionFromUrl(url, ".png");
        const destination = path.join(meshyDir, "textures", `texture-${index}-${mapName}${ext}`);
        const sizeBytes = await downloadFile(url, destination);
        assets.push({
          kind: "texture",
          map: mapName,
          file: path.relative(meshyDir, destination),
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

async function runArtifactNormalization(meshyDir, runDir, args) {
  const normalizeArtifact = args.normalizeArtifact ?? "glb";
  const { key, filename } = normalizedArtifactFilename(normalizeArtifact);
  const inputModelPath = path.join(meshyDir, filename);
  const reference3mfPath = path.join(meshyDir, "model.3mf");
  const outputDir = path.join(runDir, "normalized");
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

  console.log(`Normalizing Meshy ${key} artifact...`);
  await runProcess(pythonCommand, processArgs, outputDir, "normalization");

  const metadata = await readJson(path.join(outputDir, "normalization.metadata.json"));
  await writeJson(path.join(runDir, "artifact-normalization.sanitized.json"), metadata);
  return metadata;
}

async function writeExperimentSummary(outputRoot, runDir, summary) {
  await writeJson(path.join(runDir, "experiment.sanitized.json"), summary);
  await writeJson(path.join(outputRoot, "latest.sanitized.json"), summary);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  await loadEnvFile(path.join(repoRoot, ".env"));
  await loadEnvFile(path.join(repoRoot, "apps", "functions", ".env"));

  const outputRoot = resolveFromRoot(
    args.outputRoot,
    path.join(".tmp", "experiments", "meshy", "standard"),
  );
  const experimentSlug = args.experimentSlug ?? "exp-005-standard-body-only-normalized";
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(experimentSlug)) {
    throw new Error("--experiment-slug must contain only letters, numbers, and hyphens.");
  }

  const runDir = path.join(outputRoot, `${experimentSlug}-${timestampForPath()}`);
  const meshyDir = path.join(runDir, "meshy");
  await fs.mkdir(meshyDir, { recursive: true });

  const inputPath = resolveFromRoot(args.input, path.join(".tmp", "Profile-Pic-HIMSS.jpg"));
  const copiedInputPath = await copyInputImage(inputPath, runDir);
  const startedSummary = {
    created_at: new Date().toISOString(),
    experiment_runner: "standard-figurine-v1",
    experiment_slug: experimentSlug,
    status: "started",
    run_dir: runDir,
    input_path: inputPath,
    copied_input_path: copiedInputPath,
    stages: {
      vertex_concept: args.skipConcept ? "skipped_existing_concept" : "pending",
      meshy_multiview: args.conceptOnly ? "not_requested" : "pending",
      meshy_model: args.conceptOnly || args.multiviewOnly ? "not_requested" : "pending",
      printability: args.conceptOnly || args.multiviewOnly ? "not_requested" : "pending",
      normalization: args.conceptOnly || args.multiviewOnly ? "not_requested" : "pending",
    },
  };
  await writeExperimentSummary(outputRoot, runDir, startedSummary);

  const conceptPath = args.skipConcept
    ? resolveFromRoot(args.skipConcept)
    : await generateVertexConcept(inputPath, runDir, args);

  if (args.conceptOnly) {
    const summary = {
      ...startedSummary,
      completed_at: new Date().toISOString(),
      status: "completed_concept_only",
      concept_path: conceptPath,
      stages: {
        ...startedSummary.stages,
        vertex_concept: "completed",
      },
    };
    await writeExperimentSummary(outputRoot, runDir, summary);
    console.log(`Concept generated: ${conceptPath}`);
    console.log(`Run directory: ${runDir}`);
    return;
  }

  const apiKey = process.env.MESHY_API_KEY;
  if (!apiKey) {
    throw new Error("MESHY_API_KEY is required for Meshy stages.");
  }

  let imageTaskId = args.skipImageTaskId;
  if (!imageTaskId) {
    console.log("Creating Meshy Image-to-Image multi-view task...");
    imageTaskId = await createImageTask(apiKey, conceptPath, runDir, args);
  }
  if (!imageTaskId) {
    throw new Error("Meshy did not return an image task id.");
  }

  console.log(`Image task id: ${imageTaskId}`);
  const imageTask = await pollTask(
    apiKey,
    "/image-to-image",
    imageTaskId,
    meshyDir,
    "image-task",
    sanitizeImageTask,
    args,
  );
  if (imageTask.status !== "SUCCEEDED") {
    await writeJson(path.join(meshyDir, "image-task.final.sanitized.json"), sanitizeImageTask(imageTask));
    throw new Error(`Meshy image task ${imageTaskId} ended with status ${imageTask.status}.`);
  }

  console.log("Downloading multi-view reference images...");
  const downloadedImages = await downloadImageTaskImages(imageTask, meshyDir);
  await writeJson(
    path.join(meshyDir, "image-task.final.sanitized.json"),
    sanitizeImageTask(imageTask, downloadedImages),
  );

  if (args.multiviewOnly) {
    const summary = {
      ...startedSummary,
      completed_at: new Date().toISOString(),
      status: "completed_multiview_only",
      concept_path: conceptPath,
      image_task_id: imageTaskId,
      stages: {
        ...startedSummary.stages,
        vertex_concept: "completed",
        meshy_multiview: "completed",
      },
    };
    await writeExperimentSummary(outputRoot, runDir, summary);
    console.log(`Multi-view output: ${path.join(meshyDir, "multiview")}`);
    console.log(`Run directory: ${runDir}`);
    return;
  }

  console.log("Creating Meshy Multi-Image-to-3D task...");
  const modelTaskId = await createMultiImageTo3dTask(apiKey, imageTaskId, runDir, args);
  console.log(`Model task id: ${modelTaskId}`);
  const modelTask = await pollTask(
    apiKey,
    "/multi-image-to-3d",
    modelTaskId,
    meshyDir,
    "model-task",
    sanitizeModelTask,
    args,
  );
  if (modelTask.status !== "SUCCEEDED") {
    await writeJson(path.join(meshyDir, "model-task.final.sanitized.json"), sanitizeModelTask(modelTask));
    throw new Error(`Meshy model task ${modelTaskId} ended with status ${modelTask.status}.`);
  }

  console.log("Downloading Meshy model assets...");
  const downloadedAssets = await downloadModelTaskAssets(modelTask, meshyDir);
  await writeJson(
    path.join(meshyDir, "model-task.final.sanitized.json"),
    sanitizeModelTask(modelTask, downloadedAssets),
  );

  console.log("Creating Meshy printability analysis...");
  const printabilityTaskId = await createPrintabilityTask(apiKey, modelTaskId);
  console.log(`Printability task id: ${printabilityTaskId}`);
  const printabilityTask = await pollTask(
    apiKey,
    "/print/analyze",
    printabilityTaskId,
    meshyDir,
    "printability-task",
    sanitizePrintabilityTask,
    args,
  );
  await writeJson(
    path.join(meshyDir, "printability-task.final.sanitized.json"),
    sanitizePrintabilityTask(printabilityTask),
  );

  const artifactNormalization = await runArtifactNormalization(meshyDir, runDir, args);

  const summary = {
    ...startedSummary,
    completed_at: new Date().toISOString(),
    status: "completed",
    concept_path: conceptPath,
    meshy_dir: meshyDir,
    normalized_dir: path.join(runDir, "normalized"),
    image_task_id: imageTaskId,
    model_task_id: modelTaskId,
    printability_task_id: printabilityTaskId,
    printability_status: printabilityTask.printability?.status ?? "unknown",
    artifact_normalization: {
      postprocess_id: artifactNormalization.postprocess_id,
      output_dir: path.dirname(artifactNormalization.exported_files?.stl?.path ?? ""),
      source_model: artifactNormalization.source_model,
      target_height_mm: artifactNormalization.target_height_mm,
      scale_factor: artifactNormalization.scale_factor,
      exported_files: artifactNormalization.exported_files,
      normalized_mesh: artifactNormalization.normalized_mesh,
    },
    stages: {
      vertex_concept: "completed",
      meshy_multiview: "completed",
      meshy_model: "completed",
      printability: "completed",
      normalization: "completed",
    },
  };
  await writeExperimentSummary(outputRoot, runDir, summary);

  console.log(`Standard figurine experiment done: ${runDir}`);
  console.log(`Concept: ${conceptPath}`);
  console.log(`Meshy assets: ${meshyDir}`);
  console.log(`Normalized assets: ${path.join(runDir, "normalized")}`);
  console.log(`Printability: ${summary.printability_status}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
