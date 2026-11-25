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
 *   -> optional provider-side repair/remesh diagnostics
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
const MESHY_OPENAPI_ROOT = "https://api.meshy.ai/openapi";
const MESHY_V1_API_ROOT = `${MESHY_OPENAPI_ROOT}/v1`;
const DEFAULT_MESHY_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_MODEL_FORMATS = ["glb", "stl", "3mf"];
const DEFAULT_EXP010_EXISTING_MODELS = [
  ".tmp/experiments/meshy/standard/exp-009-creative-lab-raw-pass-1/meshy/build/model.glb",
  ".tmp/experiments/meshy/standard/exp-009-creative-lab-raw-pass-2/meshy/build/model.glb",
  ".tmp/experiments/meshy/standard/exp-009-creative-lab-raw-pass-3/meshy/build/model.glb",
];
const DEFAULT_EXP010_EXISTING_MODEL_LABELS = ["pass-1", "pass-2", "pass-3"];
const DEFAULT_EXP010_EXISTING_MODEL_TASK_IDS = [
  "019e981c-b693-7f5f-8325-40b63fdf278b",
  "019e981f-3b5b-7de7-a4f2-c0034e0d90aa",
  "019e9821-dcad-7ce0-b095-1b5ffc85fdc1",
];
const TERMINAL_STATUSES = new Set([
  "SUCCEEDED",
  "FAILED",
  "CANCELED",
  "EXPIRED",
]);
const DEFAULT_CREATIVE_LAB_TARGET_HEIGHT_MM = 75;
const WORKFLOWS = new Set([
  "standard-multiview",
  "creative-lab-figure",
  "existing-model-print-tools",
  "existing-model-multi-color",
]);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");

function usage() {
  console.log(`Usage:
  node scripts/meshy/run-standard-figurine-experiment.mjs [options]

Options:
  --input <path>                    Local JPG/PNG source photo. Default: .tmp/Profile-Pic-HIMSS.jpg.
  --experiment-slug <slug>          Output folder suffix. Default: exp-005-standard-body-only-normalized.
  --output-root <path>              Output root. Default: .tmp/experiments/meshy/standard.
  --run-folder-name <name>          Exact run folder name under output root. Default: generated timestamp folder.
  --workflow <name>                 standard-multiview or creative-lab-figure. Default: standard-multiview.
                                     existing-model-print-tools runs only Meshy print tooling against existing GLB/STL inputs.
                                     existing-model-multi-color converts one existing textured GLB to colored 3MFs.
  --existing-models <csv>            Existing local 3D models for existing-model-print-tools.
                                     Default: the three Experiment 009 Creative Lab raw GLBs.
  --existing-model-labels <csv>      Labels for existing models. Default: pass-1,pass-2,pass-3.
  --existing-model-task-ids <csv>    Optional Meshy task ids used only to recover live model_url values.
  --multi-color-styles <csv>        Existing-model color conversion styles. Default: cartoon,realistic.
  --multi-color-provider <name>     Existing-model conversion provider: meshy (default) or hi3d.
  --min-region-faces <n>            Hi3D small adjacent region merge threshold. Default: 50.
  --resume-task-id <id>             Resume an existing Hi3D task in --run-folder-name without resubmitting.
  --max-colors <n>                  Multi-color palette limit, 1-16. Default: 4 for Snapmaker U1.
  --printer-brand <name>            Multi-color 3MF slicer preset. Default: snapmaker.
  --model-url-source <value>         live-or-data-uri, live-url, or data-uri. Default: live-or-data-uri.
  --candidate-analysis-python <cmd>  Python command for local candidate analysis. Default: python.
  --candidate-target-height-mm <n>   Height used for base-fit analysis. Default: 75.
  --printu-base-manifest <path>      Base manifest for fit checks. Default: printu-round-v1 manifest.
  --short-folder-name               Use YYYYMMDD-HHMM-slug instead of slug-ISO-timestamp.
  --aspect-ratio <ratio>            Vertex image aspect ratio. Default: 3:4.
  --vertex-model <id>               Vertex/Gemini image model. Default: env VERTEX_IMAGE_MODEL or gemini-2.5-flash-image.
  --meshy-image-model <id>          Meshy image model. Default: gpt-image-2.
  --formats <csv>                   Meshy 3D target formats. Default: glb,stl,3mf.
  --target-polycount <n>            Meshy remeshed target polycount. Default: 100000.
  --no-generation-remesh            Keep the initial Multi-Image-to-3D task raw by disabling Meshy's generation-time remesh.
  --provider-diagnostics            After raw model download/analyze, run Meshy Repair Printability and Remesh diagnostics.
  --provider-remesh-topology <value> Provider Remesh topology. Default: quad.
  --provider-remesh-target-polycount <n>
                                     Provider Remesh target polycount. Default: --target-polycount or 100000.
  --provider-remesh-formats <csv>    Provider Remesh target formats. Default: --formats or glb,stl,3mf.
  --pose-mode <value>               Meshy pose_mode: "", a-pose, or t-pose.
  --normalize-artifact <id>         Artifact to normalize. Default: glb. Supported: glb,stl,3mf,pre-remeshed-glb.
  --normalization-target-height-mm <n>
                                     Target normalized height. Default: use downloaded model.3mf height.
  --postprocess-python <cmd>        Python command for normalization. Default: python.
  --skip-normalization              Do not run local scale/orientation normalization.
  --poll-interval-ms <ms>           Meshy poll interval. Default: 10000.
  --timeout-minutes <n>             Meshy poll timeout per task. Default: 60.
  --concept-only                    Stop after Vertex/Gemini concept generation.
  --multiview-only                  Stop after Meshy multi-view image generation.
  --skip-concept <path>             Use an existing concept PNG/JPG instead of calling Vertex/Gemini.
  --faithful-multiview              Multi-view prompt preserves the reference image's style/proportions instead of restyling to emoji/avatar toy.
  --skip-image-task-id <id>         Use an existing succeeded Meshy image-to-image multi-view task.
  --skip-multiview                  Direct-3D: send the concept image straight to Multi-Image-to-3D as image_urls, skipping the Image-to-Image multi-view task.
  --direct-images <csv>             Direct-3D with explicit view images (1-4 local paths, e.g. front,side). Implies --skip-multiview.
  --delight-input                   Before the Meshy stages, ask Vertex/Gemini to flatten the image: remove shadows,
                                     highlights, and reflections so multicolor conversion sees flat base colors.
                                     Applies to the creative-lab-figure input image or the standard-flow concept.
  --vertex-image-size <size>        Optional Vertex imageConfig.imageSize, e.g. 2K (gemini-3-pro-image).
  --prototype-only                  Stop after Meshy Creative Lab Figure prototype generation.
  --skip-prototype-task-id <id>     Use an existing succeeded Creative Lab Figure prototype task.
  --skip-build-task-id <id>         Use an existing succeeded Creative Lab Figure build task.
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
    const key = rawKey.replace(/-([a-z])/g, (_, letter) =>
      letter.toUpperCase(),
    );

    if (
      [
        "help",
        "conceptOnly",
        "delightInput",
        "faithfulMultiview",
        "multiviewOnly",
        "noGenerationRemesh",
        "noTexture",
        "prototypeOnly",
        "providerDiagnostics",
        "shortFolderName",
        "skipMultiview",
        "skipNormalization",
      ].includes(key)
    ) {
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
    if (
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ||
      process.env[key] !== undefined
    ) {
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

function shortTimestampForPath() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") {
    return "image/jpeg";
  }
  if (ext === ".png") {
    return "image/png";
  }
  if (ext === ".glb" || ext === ".gltf" || ext === ".obj" || ext === ".stl") {
    return "application/octet-stream";
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
  const baseUrl = (
    process.env.VERTEX_EXPRESS_BASE_URL ?? VERTEX_EXPRESS_BASE_URL
  ).replace(/\/$/, "");
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

function buildFaithfulMultiviewPrompt() {
  return [
    "Create a clean multi-view character sheet from the reference image.",
    "Treat the reference image as the exact source of truth for style, body proportions, anatomy, musculature, pose attitude, identity, facial likeness, outfit design, props, and colors.",
    "Do not restyle the character. Do not convert it into a chibi, emoji, avatar, toy, or cartoon style. Preserve the reference's realism level, adult proportions, and surface detail as closely as possible.",
    "Views: generate consistent front, side, and back views of the same character. Keep proportions, outfit, props, colors, and silhouette identical across views.",
    "Body-only output: do not add a base, pedestal, platform, stand, plaque, nameplate, sign, ground disk, scenery, or support prop. If the reference contains one, remove it.",
    "Background: plain white studio background, one centered character per view, no text, no watermark, no extra props.",
    "Printability: keep the figure a single connected body with feet grounded; avoid floating parts and cropped limbs, but never change the style to achieve this.",
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
  return (
    response.candidates?.flatMap(
      (candidate) => candidate.content?.parts ?? [],
    ) ?? []
  );
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
    throw new Error(
      `Vertex/Gemini blocked the prompt: ${response.promptFeedback.blockReason}.`,
    );
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

// Flat-lighting pass for multicolor printing: baked shadows, highlights, and
// reflections become false color regions when Meshy quantizes the texture.
function buildVertexDelightPrompt() {
  return [
    "Edit this image. Remove all lighting effects: cast shadows, form shading, ambient occlusion, highlights, specular reflections, glare, sheen, rim light, and anything else that looks like lighting or a reflection.",
    "Render every surface in its flat, unlit base color, as if lit by perfectly even, shadowless light from every direction. Each material keeps one uniform color: skin is one even skin tone, each fabric or leather is one even color, metal is one even flat color, and hair or eyebrows are one even color.",
    "Keep everything else exactly the same: the same character, face, identity, expression, eyes, pose, proportions, outfit design, colors, props, and composition. Do not add or remove details.",
    "Keep the full figure visible from the top of the head to the soles of the feet. Do not crop or zoom.",
    "Plain white background. No text, no watermark.",
    "Output only the edited image.",
  ].join("\n");
}

async function generateVertexConcept(inputPath, runDir, args) {
  return requestVertexImage(inputPath, runDir, args, {
    prompt: buildVertexConceptPrompt(),
    outputStem: "concept",
    label: "body-only concept",
    defaultAspectRatio: "3:4",
  });
}

async function generateVertexDelight(inputPath, runDir, args) {
  return requestVertexImage(inputPath, runDir, args, {
    prompt: buildVertexDelightPrompt(),
    outputStem: "delit",
    label: "flat-lit (shadow/highlight-free) image",
    defaultAspectRatio: "3:4",
  });
}

async function requestVertexImage(inputPath, runDir, args, options) {
  const apiKey = process.env.VERTEX_API_KEY;
  if (!apiKey) {
    throw new Error(
      "VERTEX_API_KEY is required for Vertex/Gemini image stages.",
    );
  }

  const model =
    args.vertexModel ??
    process.env.VERTEX_IMAGE_MODEL ??
    DEFAULT_VERTEX_IMAGE_MODEL;
  const prompt = options.prompt;
  const sourceImageBuffer = await fs.readFile(inputPath);
  const sourceMimeType = contentTypeFor(inputPath);
  const aspectRatio = args.aspectRatio ?? options.defaultAspectRatio;
  const imageSize = args.vertexImageSize;

  console.log(`Generating ${options.label} with Vertex/Gemini...`);
  const response = await fetch(
    buildVertexGenerateContentEndpoint(model, apiKey),
    {
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
            ...(imageSize ? { imageSize } : {}),
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
    },
  );

  if (!response.ok) {
    throw new Error(
      `Vertex/Gemini ${options.outputStem} request failed with HTTP ${response.status}: ${await readErrorBody(response)}`,
    );
  }

  const vertexResponse = await response.json();
  const generatedImage = extractGeneratedImage(vertexResponse);
  const outputMimeType = generatedImage.mimeType;
  const conceptPath = path.join(
    runDir,
    "vertex",
    `${options.outputStem}.${extensionForMimeType(outputMimeType)}`,
  );
  await fs.mkdir(path.dirname(conceptPath), { recursive: true });
  await fs.writeFile(conceptPath, Buffer.from(generatedImage.data, "base64"));

  await writeJson(path.join(runDir, "vertex", `${options.outputStem}.sanitized.json`), {
    created_at: new Date().toISOString(),
    provider: "vertex-gemini-direct",
    model,
    model_version: vertexResponse.modelVersion,
    aspect_ratio: aspectRatio,
    image_size: imageSize ?? null,
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

  const apiRoot = init.apiRoot ?? MESHY_V1_API_ROOT;
  const response = await fetch(`${apiRoot}${endpoint}`, {
    ...init,
    apiRoot: undefined,
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
    throw new Error(
      `Meshy ${init.method ?? "GET"} ${endpoint} failed: ${response.status} ${message}`,
    );
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
    image_count: Array.isArray(task.image_urls)
      ? task.image_urls.length
      : undefined,
    downloaded_images: downloadedImages,
  };
}

function sanitizeFigurePrototypeTask(task, downloadedImages = []) {
  return {
    id: task.id,
    type: task.type,
    name: task.name,
    status: task.status,
    progress: task.progress,
    created_at: task.created_at,
    started_at: task.started_at,
    finished_at: task.finished_at,
    expires_at: task.expires_at,
    consumed_credits: task.consumed_credits,
    preceding_tasks: task.preceding_tasks,
    task_error: task.task_error,
    image_count: Array.isArray(task.image_urls)
      ? task.image_urls.length
      : undefined,
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
    model_formats: Object.entries(task.model_urls ?? {})
      .filter(([, url]) => Boolean(url))
      .map(([format]) => format),
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

function firstAvailableModelUrl(task, preferredFormats = ["glb", "stl"]) {
  for (const format of preferredFormats) {
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

async function createImageTask(apiKey, conceptPath, runDir, args) {
  const request = {
    ai_model: args.meshyImageModel ?? DEFAULT_MESHY_IMAGE_MODEL,
    prompt: args.faithfulMultiview
      ? buildFaithfulMultiviewPrompt()
      : buildMeshyMultiviewPrompt(),
    reference_image_urls: [await fileToDataUri(conceptPath)],
    generate_multi_view: true,
  };

  const response = await meshyJson(apiKey, "/image-to-image", {
    method: "POST",
    body: request,
  });

  await writeJson(
    path.join(runDir, "meshy", "image-task.request.sanitized.json"),
    {
      ...request,
      reference_image_urls: ["<base64-data-uri-redacted>"],
    },
  );

  return response.result;
}

async function createFigurePrototypeTask(apiKey, inputPath, runDir, args) {
  const request = {
    image_url: await fileToDataUri(inputPath),
    name: args.experimentSlug,
  };

  const response = await meshyJson(
    apiKey,
    "/creative-lab/figure/v1/prototype",
    {
      apiRoot: MESHY_OPENAPI_ROOT,
      method: "POST",
      body: request,
    },
  );

  await writeJson(
    path.join(runDir, "meshy", "prototype-task.request.sanitized.json"),
    {
      ...request,
      image_url: "<base64-data-uri-redacted>",
    },
  );

  return response.result;
}

async function createFigureBuildTask(apiKey, prototypeTaskId, runDir, args) {
  const request = {
    input_task_id: prototypeTaskId,
    name: args.experimentSlug,
  };

  const response = await meshyJson(apiKey, "/creative-lab/figure/v1/build", {
    apiRoot: MESHY_OPENAPI_ROOT,
    method: "POST",
    body: request,
  });

  await writeJson(
    path.join(runDir, "meshy", "build-task.request.sanitized.json"),
    request,
  );
  return response.result;
}

async function pollTask(
  apiKey,
  endpoint,
  taskId,
  outputDir,
  filenamePrefix,
  sanitize,
  args,
) {
  const intervalMs = Number(args.pollIntervalMs ?? 10000);
  const timeoutMs = Number(args.timeoutMinutes ?? 60) * 60 * 1000;
  const apiRoot = args.apiRoot;
  const startedAt = Date.now();
  let lastTask = null;

  while (Date.now() - startedAt < timeoutMs) {
    const task = await meshyJson(apiKey, `${endpoint}/${taskId}`, { apiRoot });
    lastTask = task;

    const safeTask = sanitize(task);
    await appendJsonLine(
      path.join(outputDir, `${filenamePrefix}.poll-log.jsonl`),
      {
        checked_at: new Date().toISOString(),
        ...safeTask,
      },
    );
    await writeJson(
      path.join(outputDir, `${filenamePrefix}.latest.sanitized.json`),
      safeTask,
    );

    const progressLabel =
      task.progress === undefined || task.progress === null
        ? "unknown progress"
        : `${task.progress}%`;
    console.log(
      `Meshy ${filenamePrefix} ${taskId}: ${task.status} (${progressLabel})`,
    );

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
    throw new Error(
      `Download failed for ${path.basename(destination)}: ${response.status}`,
    );
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
    const destination = path.join(
      meshyDir,
      "multiview",
      `view-${index + 1}${ext}`,
    );
    const sizeBytes = await downloadFile(url, destination);
    downloaded.push({
      file: path.relative(meshyDir, destination),
      size_bytes: sizeBytes,
    });
  }

  return downloaded;
}

async function downloadFigurePrototypeImages(task, meshyDir) {
  const downloaded = [];
  const imageUrls = Array.isArray(task.image_urls) ? task.image_urls : [];

  for (let index = 0; index < imageUrls.length; index += 1) {
    const url = imageUrls[index];
    const ext = extensionFromUrl(url, ".png");
    const destination = path.join(
      meshyDir,
      "prototype",
      `concept-${index + 1}${ext}`,
    );
    const sizeBytes = await downloadFile(url, destination);
    downloaded.push({
      file: path.relative(meshyDir, destination),
      size_bytes: sizeBytes,
    });
  }

  return downloaded;
}

async function createMultiImageTo3dTask(apiKey, source, runDir, args) {
  const formats = (args.formats ?? DEFAULT_MODEL_FORMATS.join(","))
    .split(",")
    .map((format) => format.trim())
    .filter(Boolean);
  const shouldGenerationRemesh = !args.noGenerationRemesh;

  const request = {
    ...(source.imageTaskId
      ? { input_task_id: source.imageTaskId }
      : {
          image_urls: await Promise.all(
            source.conceptPaths.map((conceptPath) =>
              fileToDataUri(conceptPath),
            ),
          ),
        }),
    ai_model: "meshy-6",
    should_texture: !args.noTexture,
    enable_pbr: false,
    should_remesh: shouldGenerationRemesh,
    image_enhancement: true,
    remove_lighting: true,
    moderation: true,
    target_formats: formats,
  };

  if (shouldGenerationRemesh) {
    request.target_polycount = Number(args.targetPolycount ?? 100000);
    request.save_pre_remeshed_model = true;
  }

  if (args.poseMode !== undefined) {
    request.pose_mode = args.poseMode;
  }

  const response = await meshyJson(apiKey, "/multi-image-to-3d", {
    method: "POST",
    body: request,
  });

  await writeJson(
    path.join(runDir, "meshy", "model-task.request.sanitized.json"),
    {
      ...request,
      ...(request.image_urls
        ? {
            image_urls: request.image_urls.map(
              () => "<base64-data-uri-redacted>",
            ),
          }
        : {}),
    },
  );
  return response.result;
}

async function downloadModelTaskAssets(task, meshyDir, options = {}) {
  const assets = [];
  const modelFilenameBase = options.modelFilenameBase ?? "model";
  const thumbnailFilename = options.thumbnailFilename ?? "thumbnail.png";

  for (const [format, url] of Object.entries(task.model_urls ?? {})) {
    if (!url) {
      continue;
    }
    const filename =
      format === "pre_remeshed_glb"
        ? `${modelFilenameBase}.pre-remeshed.glb`
        : `${modelFilenameBase}.${format.trim()}`;
    const destination = path.join(meshyDir, filename);
    try {
      const sizeBytes = await downloadFile(url, destination);
      assets.push({
        kind: "model",
        format,
        file: path.relative(meshyDir, destination),
        size_bytes: sizeBytes,
      });
    } catch (error) {
      assets.push({
        kind: "model",
        format,
        file: path.relative(meshyDir, destination),
        error: error.message,
      });
    }
  }

  if (task.thumbnail_url) {
    const destination = path.join(meshyDir, thumbnailFilename);
    try {
      const sizeBytes = await downloadFile(task.thumbnail_url, destination);
      assets.push({
        kind: "thumbnail",
        file: path.relative(meshyDir, destination),
        size_bytes: sizeBytes,
      });
    } catch (error) {
      assets.push({
        kind: "thumbnail",
        file: path.relative(meshyDir, destination),
        error: error.message,
      });
    }
  }

  if (Array.isArray(task.texture_urls)) {
    for (let index = 0; index < task.texture_urls.length; index += 1) {
      const textureSet = task.texture_urls[index] ?? {};
      for (const [mapName, url] of Object.entries(textureSet)) {
        const ext = extensionFromUrl(url, ".png");
        const destination = path.join(
          meshyDir,
          "textures",
          `texture-${index}-${mapName}${ext}`,
        );
        try {
          const sizeBytes = await downloadFile(url, destination);
          assets.push({
            kind: "texture",
            map: mapName,
            file: path.relative(meshyDir, destination),
            size_bytes: sizeBytes,
          });
        } catch (error) {
          assets.push({
            kind: "texture",
            map: mapName,
            file: path.relative(meshyDir, destination),
            error: error.message,
          });
        }
      }
    }
  }

  return assets;
}

async function createPrintabilityTask(apiKey, options) {
  const body = {};
  if (options.inputTaskId) {
    body.input_task_id = options.inputTaskId;
  } else if (options.modelUrl) {
    body.model_url = options.modelUrl;
  } else {
    throw new Error("createPrintabilityTask requires inputTaskId or modelUrl.");
  }

  const response = await meshyJson(apiKey, "/print/analyze", {
    method: "POST",
    body,
  });
  return response.result;
}

async function createRepairPrintabilityTask(apiKey, options) {
  const body = {};
  if (options.inputTaskId) {
    body.input_task_id = options.inputTaskId;
  } else if (options.modelUrl) {
    body.model_url = options.modelUrl;
  } else {
    throw new Error(
      "createRepairPrintabilityTask requires inputTaskId or modelUrl.",
    );
  }

  const response = await meshyJson(apiKey, "/print/repair", {
    method: "POST",
    body,
  });
  return response.result;
}

async function createRemeshTask(apiKey, request) {
  const response = await meshyJson(apiKey, "/remesh", {
    method: "POST",
    body: request,
  });
  return response.result;
}

function splitCsv(value, fallback = []) {
  const source = value ?? fallback.join(",");
  return source
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function safePathLabel(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function modelFileToDataUri(filePath) {
  const model = await fs.readFile(filePath);
  return `data:application/octet-stream;base64,${model.toString("base64")}`;
}

function modelUrlPlaceholder(source, label) {
  return source === "data-uri"
    ? `<${label}-local-glb-data-uri-redacted>`
    : `<${label}-live-meshy-model-url-redacted>`;
}

async function retrieveCreativeLabBuildTask(apiKey, taskId) {
  return meshyJson(apiKey, `/creative-lab/figure/v1/build/${taskId}`, {
    apiRoot: MESHY_OPENAPI_ROOT,
  });
}

async function resolveExistingModelUrl(apiKey, candidate, args, outputDir) {
  const mode = args.modelUrlSource ?? "live-or-data-uri";
  const allowLive = mode === "live-url" || mode === "live-or-data-uri";
  const allowDataUri = mode === "data-uri" || mode === "live-or-data-uri";
  const info = {
    local_path: candidate.localPath,
    task_id: candidate.taskId ?? null,
    source: null,
    url: null,
    placeholder: null,
    live_task: null,
    fallback_reason: null,
    can_fallback_to_data_uri: allowDataUri,
  };

  if (allowLive && candidate.taskId) {
    try {
      const buildTask = await retrieveCreativeLabBuildTask(apiKey, candidate.taskId);
      info.live_task = sanitizeModelTask(buildTask);
      const model = firstAvailableModelUrl(buildTask, ["glb"]);
      if (model?.url) {
        info.source = "live-task-url";
        info.url = model.url;
        info.placeholder = modelUrlPlaceholder("live-task-url", candidate.label);
      } else {
        info.fallback_reason = "Meshy build task did not return a GLB URL.";
      }
    } catch (error) {
      info.fallback_reason = error.message;
    }
  }

  if (!info.url && allowDataUri) {
    info.source = "data-uri";
    info.url = await modelFileToDataUri(candidate.localPath);
    info.placeholder = modelUrlPlaceholder("data-uri", candidate.label);
  }

  if (!info.url) {
    throw new Error(
      `Could not resolve model_url for ${candidate.label}. Use --model-url-source data-uri or provide a live task id.`,
    );
  }

  await writeJson(path.join(outputDir, "model-url-source.sanitized.json"), {
    ...info,
    url: info.placeholder,
  });
  return info;
}

async function fallbackToDataUri(modelUrlInfo, reason) {
  if (!modelUrlInfo.can_fallback_to_data_uri || modelUrlInfo.source === "data-uri") {
    throw reason;
  }
  modelUrlInfo.source = "data-uri";
  modelUrlInfo.url = await modelFileToDataUri(modelUrlInfo.local_path);
  modelUrlInfo.placeholder = modelUrlPlaceholder("data-uri", path.basename(modelUrlInfo.local_path));
  modelUrlInfo.fallback_reason = reason.message;
  return modelUrlInfo;
}

async function createWithModelUrlFallback(modelUrlInfo, createTask) {
  try {
    return await createTask(modelUrlInfo.url);
  } catch (error) {
    await fallbackToDataUri(modelUrlInfo, error);
    return createTask(modelUrlInfo.url);
  }
}

async function runAnalyzeModelUrlDiagnostic(
  apiKey,
  modelUrlInfo,
  outputDir,
  filenamePrefix,
  args,
) {
  await writeJson(path.join(outputDir, `${filenamePrefix}.request.sanitized.json`), {
    model_url: modelUrlInfo.placeholder,
    model_url_source: modelUrlInfo.source,
  });
  const analyzeTaskId = await createWithModelUrlFallback(modelUrlInfo, (modelUrl) =>
    createPrintabilityTask(apiKey, { modelUrl }),
  );
  const analyzeTask = await pollTask(
    apiKey,
    "/print/analyze",
    analyzeTaskId,
    outputDir,
    filenamePrefix,
    sanitizePrintabilityTask,
    args,
  );
  await writeJson(
    path.join(outputDir, `${filenamePrefix}.final.sanitized.json`),
    sanitizePrintabilityTask(analyzeTask),
  );
  return {
    analyze_task_id: analyzeTaskId,
    status: analyzeTask.status,
    printability_status: analyzeTask.printability?.status ?? "unknown",
    printability: analyzeTask.printability ?? null,
    consumed_credits: analyzeTask.consumed_credits,
  };
}

async function runExistingModelRepair(apiKey, modelUrlInfo, candidateDir, args) {
  const repairDir = path.join(candidateDir, "repair", "model-url-glb");
  await fs.mkdir(repairDir, { recursive: true });
  await writeJson(path.join(repairDir, "repair-task.request.sanitized.json"), {
    model_url: modelUrlInfo.placeholder,
    model_url_source: modelUrlInfo.source,
    note: "Repair Printability uses model_url for the existing Creative Lab GLB. Meshy repair removes textures.",
  });

  console.log(`Creating Meshy Repair Printability for ${path.basename(candidateDir)}...`);
  const repairTaskId = await createWithModelUrlFallback(modelUrlInfo, (modelUrl) =>
    createRepairPrintabilityTask(apiKey, { modelUrl }),
  );
  const repairTask = await pollTask(
    apiKey,
    "/print/repair",
    repairTaskId,
    repairDir,
    "repair-task",
    sanitizeModelTask,
    args,
  );

  let downloadedAssets = [];
  let repairedAnalyze = null;
  if (repairTask.status === "SUCCEEDED") {
    downloadedAssets = await downloadModelTaskAssets(repairTask, repairDir, {
      modelFilenameBase: "model.repaired",
      thumbnailFilename: "thumbnail.repaired.png",
    });
  }
  await writeJson(
    path.join(repairDir, "repair-task.final.sanitized.json"),
    sanitizeModelTask(repairTask, downloadedAssets),
  );

  const repairedModel = firstAvailableModelUrl(repairTask, ["glb", "stl", "obj"]);
  if (repairTask.status === "SUCCEEDED" && repairedModel) {
    repairedAnalyze = await analyzeModelUrl(
      apiKey,
      repairedModel.url,
      repairDir,
      "analyze-repaired-task",
      args,
    );
  }

  const summary = {
    created_at: new Date().toISOString(),
    repair_task_id: repairTaskId,
    repair_status: repairTask.status,
    repair_consumed_credits: repairTask.consumed_credits,
    repair_texture_maps: Array.isArray(repairTask.texture_urls)
      ? repairTask.texture_urls.map((textureSet) => Object.keys(textureSet ?? {}))
      : [],
    downloaded_assets: downloadedAssets,
    repaired_analyze_task_id: repairedAnalyze?.analyzeTaskId ?? null,
    repaired_printability_status:
      repairedAnalyze?.analyzeTask?.printability?.status ?? "not_run",
    repaired_printability: repairedAnalyze?.analyzeTask?.printability ?? null,
  };
  await writeJson(path.join(repairDir, "repair-and-analysis.sanitized.json"), summary);
  return { summary, repairDir };
}

async function runExistingModelRemesh(apiKey, modelUrlInfo, candidateDir, args) {
  const topology = args.providerRemeshTopology ?? "quad";
  const targetPolycount = Number(
    args.providerRemeshTargetPolycount ?? args.targetPolycount ?? 100000,
  );
  const formats = splitCsv(
    args.providerRemeshFormats ?? args.formats,
    DEFAULT_MODEL_FORMATS,
  );
  const remeshDir = path.join(
    candidateDir,
    "remesh",
    `${topology}-${targetPolycount}-model-url-glb`,
  );
  await fs.mkdir(remeshDir, { recursive: true });

  const request = {
    model_url: modelUrlInfo.url,
    target_formats: formats,
    topology,
    target_polycount: targetPolycount,
  };
  await writeJson(path.join(remeshDir, "remesh-task.request.sanitized.json"), {
    ...request,
    model_url: modelUrlInfo.placeholder,
    model_url_source: modelUrlInfo.source,
    note: "No resize, auto-size, origin, or local scaling is requested.",
  });

  console.log(`Creating Meshy Remesh for ${path.basename(candidateDir)}...`);
  const remeshTaskId = await createWithModelUrlFallback(modelUrlInfo, (modelUrl) =>
    createRemeshTask(apiKey, { ...request, model_url: modelUrl }),
  );
  const remeshTask = await pollTask(
    apiKey,
    "/remesh",
    remeshTaskId,
    remeshDir,
    "remesh-task",
    sanitizeModelTask,
    args,
  );

  let downloadedAssets = [];
  if (remeshTask.status === "SUCCEEDED") {
    downloadedAssets = await downloadModelTaskAssets(remeshTask, remeshDir, {
      modelFilenameBase: `model.remesh-${topology}-${targetPolycount}`,
      thumbnailFilename: `thumbnail.remesh-${topology}-${targetPolycount}.png`,
    });
  }
  await writeJson(
    path.join(remeshDir, "remesh-task.final.sanitized.json"),
    sanitizeModelTask(remeshTask, downloadedAssets),
  );

  const supportedAnalyzeFormats = new Set(["glb", "gltf", "obj", "fbx", "stl"]);
  const remeshAnalyses = {};
  if (remeshTask.status === "SUCCEEDED") {
    for (const [format, url] of Object.entries(remeshTask.model_urls ?? {})) {
      if (!url) {
        continue;
      }
      if (!supportedAnalyzeFormats.has(format)) {
        remeshAnalyses[format] = {
          printability_status: "not_run_unsupported_by_meshy_analyze",
        };
        continue;
      }
      const analyzed = await analyzeModelUrl(
        apiKey,
        url,
        remeshDir,
        `analyze-remesh-${format}-task`,
        args,
      );
      remeshAnalyses[format] = {
        analyze_task_id: analyzed.analyzeTaskId,
        printability_status:
          analyzed.analyzeTask?.printability?.status ?? "unknown",
        printability: analyzed.analyzeTask?.printability ?? null,
      };
    }
  }

  const summary = {
    created_at: new Date().toISOString(),
    remesh_request: {
      ...request,
      model_url: modelUrlInfo.placeholder,
      model_url_source: modelUrlInfo.source,
    },
    remesh_task_id: remeshTaskId,
    remesh_status: remeshTask.status,
    remesh_consumed_credits: remeshTask.consumed_credits,
    remesh_texture_maps: Array.isArray(remeshTask.texture_urls)
      ? remeshTask.texture_urls.map((textureSet) => Object.keys(textureSet ?? {}))
      : [],
    downloaded_assets: downloadedAssets,
    remesh_printability_by_format: remeshAnalyses,
  };
  await writeJson(path.join(remeshDir, "remesh-and-analysis.sanitized.json"), summary);
  return { summary, remeshDir };
}

function localModelEntries(candidateDir, repairResult, remeshResult) {
  const entries = [
    {
      label: "original_glb",
      path: path.join(candidateDir, "original", "model.glb"),
    },
  ];
  for (const asset of repairResult?.summary?.downloaded_assets ?? []) {
    if (asset.kind === "model" && !asset.error) {
      entries.push({
        label: `repaired_${asset.format.replace(/[^a-z0-9]+/gi, "_")}`,
        path: path.join(repairResult.repairDir, asset.file),
      });
    }
  }
  for (const asset of remeshResult?.summary?.downloaded_assets ?? []) {
    if (asset.kind === "model" && !asset.error) {
      entries.push({
        label: `remesh_${asset.format.replace(/[^a-z0-9]+/gi, "_")}`,
        path: path.join(remeshResult.remeshDir, asset.file),
      });
    }
  }
  return entries;
}

async function runLocalCandidateAnalysis(candidateDir, label, entries, args) {
  const outputPath = path.join(candidateDir, "candidate-analysis.sanitized.json");
  const scriptPath = path.join(
    repoRoot,
    "services",
    "print-file-generator",
    "scripts",
    "analyze_figurine_candidate.py",
  );
  const baseManifest = resolveFromRoot(
    args.printuBaseManifest,
    path.join(
      "services",
      "print-file-generator",
      "assets",
      "figurine-bases",
      "printu-round-v1",
      "base.manifest.json",
    ),
  );
  const processArgs = [
    scriptPath,
    "--label",
    label,
    "--output",
    outputPath,
    "--target-height-mm",
    String(args.candidateTargetHeightMm ?? DEFAULT_CREATIVE_LAB_TARGET_HEIGHT_MM),
    "--base-manifest",
    baseManifest,
  ];
  for (const entry of entries) {
    processArgs.push("--model", `${entry.label}=${entry.path}`);
  }

  await runProcess(
    args.candidateAnalysisPython ?? "python",
    processArgs,
    candidateDir,
    "candidate-analysis",
  );
  return readJson(outputPath);
}

function summarizeTextureRetention(originalSourceDir, repairResult, remeshResult) {
  return {
    original: {
      note: `Original GLB copied from ${originalSourceDir}; sibling texture files remain in the Exp 009 source folder when present.`,
    },
    repair:
      (repairResult?.summary?.repair_texture_maps?.length ?? 0) > 0
        ? "texture_urls_returned"
        : "textures_removed_by_meshy_repair",
    remesh:
      (remeshResult?.summary?.remesh_texture_maps?.length ?? 0) > 0
        ? "texture_urls_returned"
        : "no_texture_urls_returned",
  };
}

async function runExistingModelPrintToolsWorkflow(
  apiKey,
  runDir,
  meshyDir,
  outputRoot,
  startedSummary,
  args,
) {
  const modelPaths = splitCsv(args.existingModels, DEFAULT_EXP010_EXISTING_MODELS);
  const labels = splitCsv(args.existingModelLabels, DEFAULT_EXP010_EXISTING_MODEL_LABELS);
  const taskIds = splitCsv(
    args.existingModelTaskIds,
    DEFAULT_EXP010_EXISTING_MODEL_TASK_IDS,
  );

  const candidates = modelPaths.map((modelPath, index) => ({
    label: safePathLabel(labels[index] ?? `candidate-${index + 1}`),
    localPath: resolveFromRoot(modelPath),
    taskId: taskIds[index] || null,
  }));

  const summaries = [];
  for (const candidate of candidates) {
    console.log(`Running Exp 010 print tooling for ${candidate.label}...`);
    const candidateDir = path.join(meshyDir, candidate.label);
    const originalDir = path.join(candidateDir, "original");
    await fs.mkdir(originalDir, { recursive: true });
    const originalCopy = path.join(originalDir, "model.glb");
    await fs.copyFile(candidate.localPath, originalCopy);
    candidate.localPath = originalCopy;

    const sourceStats = await fs.stat(originalCopy);
    const sourceMetadata = {
      label: candidate.label,
      source_path: modelPaths[candidates.indexOf(candidate)],
      copied_model: originalCopy,
      size_bytes: sourceStats.size,
      creative_lab_build_task_id: candidate.taskId,
    };
    await writeJson(path.join(originalDir, "source.sanitized.json"), sourceMetadata);

    const modelUrlInfo = await resolveExistingModelUrl(
      apiKey,
      candidate,
      args,
      originalDir,
    );

    let originalAnalyze = null;
    let repairResult = null;
    let remeshResult = null;
    let localAnalysis = null;
    try {
      originalAnalyze = await runAnalyzeModelUrlDiagnostic(
        apiKey,
        modelUrlInfo,
        originalDir,
        "analyze-original-task",
        args,
      );
    } catch (error) {
      originalAnalyze = { status: "failed", error: error.message };
      console.warn(`Original analyze failed for ${candidate.label}: ${error.message}`);
    }

    try {
      repairResult = await runExistingModelRepair(
        apiKey,
        modelUrlInfo,
        candidateDir,
        args,
      );
    } catch (error) {
      repairResult = {
        summary: { repair_status: "failed", error: error.message },
        repairDir: path.join(candidateDir, "repair", "model-url-glb"),
      };
      console.warn(`Repair failed for ${candidate.label}: ${error.message}`);
    }

    try {
      remeshResult = await runExistingModelRemesh(
        apiKey,
        modelUrlInfo,
        candidateDir,
        args,
      );
    } catch (error) {
      remeshResult = {
        summary: { remesh_status: "failed", error: error.message },
        remeshDir: path.join(candidateDir, "remesh"),
      };
      console.warn(`Remesh failed for ${candidate.label}: ${error.message}`);
    }

    try {
      localAnalysis = await runLocalCandidateAnalysis(
        candidateDir,
        candidate.label,
        localModelEntries(candidateDir, repairResult, remeshResult),
        args,
      );
    } catch (error) {
      localAnalysis = { status: "failed", error: error.message };
      console.warn(`Local candidate analysis failed for ${candidate.label}: ${error.message}`);
    }

    const summary = {
      label: candidate.label,
      source: sourceMetadata,
      model_url_source: {
        source: modelUrlInfo.source,
        fallback_reason: modelUrlInfo.fallback_reason,
      },
      original_analyze: originalAnalyze,
      repair: repairResult.summary,
      remesh: remeshResult.summary,
      texture_retention: summarizeTextureRetention(
        path.dirname(modelPaths[candidates.indexOf(candidate)]),
        repairResult,
        remeshResult,
      ),
      local_analysis: localAnalysis,
    };
    await writeJson(path.join(candidateDir, "candidate-summary.sanitized.json"), summary);
    summaries.push(summary);
  }

  const comparison = {
    created_at: new Date().toISOString(),
    note: "Experiment 010 uses only existing Experiment 009 Creative Lab Figure GLBs. No new figure-generation tasks are created.",
    candidate_count: summaries.length,
    candidates: summaries,
  };
  await writeJson(path.join(runDir, "comparison.sanitized.json"), comparison);

  const summary = {
    ...startedSummary,
    completed_at: new Date().toISOString(),
    status: "completed",
    meshy_dir: meshyDir,
    comparison_path: path.join(runDir, "comparison.sanitized.json"),
    candidates: summaries.map((candidate) => ({
      label: candidate.label,
      original_printability: candidate.original_analyze?.printability_status,
      repaired_printability: candidate.repair?.repaired_printability_status,
      remesh_printability_by_format:
        candidate.remesh?.remesh_printability_by_format,
      texture_retention: candidate.texture_retention,
      fit_to_printu_round_v1:
        candidate.local_analysis?.models?.remesh_glb?.fit_to_base ??
        candidate.local_analysis?.models?.repaired_glb?.fit_to_base ??
        candidate.local_analysis?.models?.original_glb?.fit_to_base ??
        null,
    })),
    stages: {
      existing_model_copy: "completed",
      printability: "completed",
      provider_repair: "completed",
      provider_remesh: "completed",
      local_candidate_analysis: "completed",
      normalization: "not_requested",
    },
  };
  await writeExperimentSummary(outputRoot, runDir, summary);

  console.log(`Existing model print-tools experiment done: ${runDir}`);
  console.log(`Comparison: ${path.join(runDir, "comparison.sanitized.json")}`);
}

async function analyzeModelUrl(apiKey, modelUrl, outputDir, filenamePrefix, args) {
  const analyzeTaskId = await createPrintabilityTask(apiKey, { modelUrl });
  const analyzeTask = await pollTask(
    apiKey,
    "/print/analyze",
    analyzeTaskId,
    outputDir,
    filenamePrefix,
    sanitizePrintabilityTask,
    args,
  );
  await writeJson(
    path.join(outputDir, `${filenamePrefix}.final.sanitized.json`),
    sanitizePrintabilityTask(analyzeTask),
  );
  return { analyzeTaskId, analyzeTask };
}

async function runRepairDiagnostic(apiKey, modelTaskId, runDir, args) {
  const repairDir = path.join(runDir, "repair", "input-task-glb");
  await fs.mkdir(repairDir, { recursive: true });

  const request = { input_task_id: modelTaskId };
  await writeJson(path.join(repairDir, "repair-task.request.sanitized.json"), {
    input_task_id: modelTaskId,
    note: "Meshy input_task_id repair reads the source task GLB and removes textures.",
  });

  console.log("Creating Meshy Repair Printability diagnostic...");
  const repairTaskId = await createRepairPrintabilityTask(apiKey, {
    inputTaskId: modelTaskId,
  });
  console.log(`Repair task id: ${repairTaskId}`);
  const repairTask = await pollTask(
    apiKey,
    "/print/repair",
    repairTaskId,
    repairDir,
    "repair-task",
    sanitizeModelTask,
    args,
  );
  await writeJson(
    path.join(repairDir, "repair-task.final.sanitized.json"),
    sanitizeModelTask(repairTask),
  );

  let downloadedAssets = [];
  let repairedAnalyzeTaskId = null;
  let repairedAnalyzeTask = null;
  const repairedModel = firstAvailableModelUrl(repairTask, ["glb", "stl"]);
  if (repairTask.status === "SUCCEEDED") {
    downloadedAssets = await downloadModelTaskAssets(repairTask, repairDir, {
      modelFilenameBase: "model.repaired",
      thumbnailFilename: "thumbnail.repaired.png",
    });
    await writeJson(
      path.join(repairDir, "repair-task.final.sanitized.json"),
      sanitizeModelTask(repairTask, downloadedAssets),
    );

    if (repairedModel) {
      await writeJson(
        path.join(repairDir, "analyze-repaired-request.sanitized.json"),
        {
          model_url: `<repaired-${repairedModel.format}-signed-url-redacted>`,
        },
      );
      const analyzed = await analyzeModelUrl(
        apiKey,
        repairedModel.url,
        repairDir,
        "analyze-repaired-task",
        args,
      );
      repairedAnalyzeTaskId = analyzed.analyzeTaskId;
      repairedAnalyzeTask = analyzed.analyzeTask;
    }
  }

  const summary = {
    created_at: new Date().toISOString(),
    request,
    repair_task_id: repairTaskId,
    repair_status: repairTask.status,
    repair_consumed_credits: repairTask.consumed_credits,
    downloaded_assets: downloadedAssets,
    repaired_analyze_task_id: repairedAnalyzeTaskId,
    repaired_printability_status:
      repairedAnalyzeTask?.printability?.status ?? "not_run",
    repaired_printability: repairedAnalyzeTask?.printability ?? null,
  };
  await writeJson(
    path.join(repairDir, "repair-and-analysis.sanitized.json"),
    summary,
  );
  return summary;
}

async function runRemeshDiagnostic(apiKey, modelTask, runDir, args) {
  const rawGlbUrl = modelTask.model_urls?.glb;
  if (!rawGlbUrl) {
    return {
      created_at: new Date().toISOString(),
      remesh_status: "not_run_no_raw_glb",
      remesh_printability_status: "not_run",
    };
  }

  const topology = args.providerRemeshTopology ?? "quad";
  const targetPolycount = Number(
    args.providerRemeshTargetPolycount ?? args.targetPolycount ?? 100000,
  );
  const formats = (
    args.providerRemeshFormats ??
    args.formats ??
    DEFAULT_MODEL_FORMATS.join(",")
  )
    .split(",")
    .map((format) => format.trim())
    .filter(Boolean);
  const remeshDir = path.join(
    runDir,
    "remesh",
    `${topology}-${targetPolycount}-original-glb`,
  );
  await fs.mkdir(remeshDir, { recursive: true });

  const request = {
    model_url: rawGlbUrl,
    target_formats: formats,
    topology,
    target_polycount: targetPolycount,
  };
  await writeJson(path.join(remeshDir, "remesh-task.request.sanitized.json"), {
    ...request,
    model_url: "<raw-glb-signed-url-redacted>",
    note: "No resize, auto-size, origin, or local scaling is requested.",
  });

  console.log("Creating Meshy Remesh diagnostic for raw GLB...");
  const remeshTaskId = await createRemeshTask(apiKey, request);
  console.log(`Remesh task id: ${remeshTaskId}`);
  const remeshTask = await pollTask(
    apiKey,
    "/remesh",
    remeshTaskId,
    remeshDir,
    "remesh-task",
    sanitizeModelTask,
    args,
  );
  await writeJson(
    path.join(remeshDir, "remesh-task.final.sanitized.json"),
    sanitizeModelTask(remeshTask),
  );

  let downloadedAssets = [];
  let remeshAnalyzeTaskId = null;
  let remeshAnalyzeTask = null;
  const remeshedModel = firstAvailableModelUrl(remeshTask, ["glb", "stl"]);
  if (remeshTask.status === "SUCCEEDED") {
    downloadedAssets = await downloadModelTaskAssets(remeshTask, remeshDir, {
      modelFilenameBase: `model.remesh-${topology}-${targetPolycount}`,
      thumbnailFilename: `thumbnail.remesh-${topology}-${targetPolycount}.png`,
    });
    await writeJson(
      path.join(remeshDir, "remesh-task.final.sanitized.json"),
      sanitizeModelTask(remeshTask, downloadedAssets),
    );

    if (remeshedModel) {
      await writeJson(
        path.join(remeshDir, "analyze-remesh-request.sanitized.json"),
        {
          model_url: `<remesh-${remeshedModel.format}-signed-url-redacted>`,
        },
      );
      const analyzed = await analyzeModelUrl(
        apiKey,
        remeshedModel.url,
        remeshDir,
        "analyze-remesh-task",
        args,
      );
      remeshAnalyzeTaskId = analyzed.analyzeTaskId;
      remeshAnalyzeTask = analyzed.analyzeTask;
    }
  }

  const summary = {
    created_at: new Date().toISOString(),
    remesh_request: {
      ...request,
      model_url: "<raw-glb-signed-url-redacted>",
    },
    remesh_task_id: remeshTaskId,
    remesh_status: remeshTask.status,
    remesh_consumed_credits: remeshTask.consumed_credits,
    downloaded_assets: downloadedAssets,
    remesh_analyze_task_id: remeshAnalyzeTaskId,
    remesh_printability_status:
      remeshAnalyzeTask?.printability?.status ?? "not_run",
    remesh_printability: remeshAnalyzeTask?.printability ?? null,
  };
  await writeJson(
    path.join(remeshDir, "remesh-and-analysis.sanitized.json"),
    summary,
  );
  return summary;
}

async function runProviderDiagnostics(apiKey, modelTaskId, modelTask, runDir, args) {
  if (!args.providerDiagnostics) {
    return null;
  }

  const diagnostics = {
    created_at: new Date().toISOString(),
    note: "Provider-side diagnostics only. Raw Meshy model assets are downloaded before this step; no local normalization, repair, remesh, or scaling is run here.",
    repair: null,
    remesh: null,
  };

  try {
    diagnostics.repair = await runRepairDiagnostic(
      apiKey,
      modelTaskId,
      runDir,
      args,
    );
  } catch (error) {
    diagnostics.repair = {
      created_at: new Date().toISOString(),
      status: "failed",
      error: error.message,
    };
    console.warn(`Repair diagnostic failed: ${error.message}`);
  }

  try {
    diagnostics.remesh = await runRemeshDiagnostic(
      apiKey,
      modelTask,
      runDir,
      args,
    );
  } catch (error) {
    diagnostics.remesh = {
      created_at: new Date().toISOString(),
      status: "failed",
      error: error.message,
    };
    console.warn(`Remesh diagnostic failed: ${error.message}`);
  }

  await writeJson(
    path.join(runDir, "provider-diagnostics.sanitized.json"),
    diagnostics,
  );
  return diagnostics;
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
        reject(
          new Error(
            `${command} ${args.join(" ")} failed with exit code ${code}: ${stderr || stdout}`,
          ),
        );
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
  const hasReference3mf = await fs
    .access(reference3mfPath)
    .then(() => true)
    .catch(() => false);
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
    "--output-dir",
    outputDir,
  ];

  if (args.normalizationTargetHeightMm !== undefined) {
    processArgs.push("--target-height-mm", args.normalizationTargetHeightMm);
  } else if (args.workflow === "creative-lab-figure") {
    processArgs.push(
      "--target-height-mm",
      String(DEFAULT_CREATIVE_LAB_TARGET_HEIGHT_MM),
    );
  } else if (hasReference3mf) {
    processArgs.push("--reference-3mf", reference3mfPath);
  } else {
    throw new Error(
      "Normalization requires model.3mf or --normalization-target-height-mm for this workflow.",
    );
  }

  console.log(`Normalizing Meshy ${key} artifact...`);
  await runProcess(pythonCommand, processArgs, outputDir, "normalization");

  const metadata = await readJson(
    path.join(outputDir, "normalization.metadata.json"),
  );
  await writeJson(
    path.join(runDir, "artifact-normalization.sanitized.json"),
    metadata,
  );
  return metadata;
}

async function writeExperimentSummary(outputRoot, runDir, summary) {
  await writeJson(path.join(runDir, "experiment.sanitized.json"), summary);
  await writeJson(path.join(outputRoot, "latest.sanitized.json"), summary);
}

async function runCreativeLabFigureWorkflow(
  apiKey,
  inputPath,
  runDir,
  meshyDir,
  outputRoot,
  startedSummary,
  args,
) {
  let prototypeTaskId = args.skipPrototypeTaskId;
  if (!prototypeTaskId) {
    console.log("Creating Meshy Creative Lab Figure prototype task...");
    prototypeTaskId = await createFigurePrototypeTask(
      apiKey,
      inputPath,
      runDir,
      args,
    );
  }
  if (!prototypeTaskId) {
    throw new Error("Meshy did not return a figure prototype task id.");
  }

  console.log(`Figure prototype task id: ${prototypeTaskId}`);
  const prototypeTask = await pollTask(
    apiKey,
    "/creative-lab/figure/v1/prototype",
    prototypeTaskId,
    meshyDir,
    "prototype-task",
    sanitizeFigurePrototypeTask,
    {
      ...args,
      apiRoot: MESHY_OPENAPI_ROOT,
    },
  );
  if (prototypeTask.status !== "SUCCEEDED") {
    await writeJson(
      path.join(meshyDir, "prototype-task.final.sanitized.json"),
      sanitizeFigurePrototypeTask(prototypeTask),
    );
    throw new Error(
      `Meshy figure prototype task ${prototypeTaskId} ended with status ${prototypeTask.status}.`,
    );
  }

  console.log("Downloading figure prototype concept image...");
  const downloadedPrototypeImages = await downloadFigurePrototypeImages(
    prototypeTask,
    meshyDir,
  );
  await writeJson(
    path.join(meshyDir, "prototype-task.final.sanitized.json"),
    sanitizeFigurePrototypeTask(prototypeTask, downloadedPrototypeImages),
  );

  if (args.prototypeOnly) {
    const summary = {
      ...startedSummary,
      completed_at: new Date().toISOString(),
      status: "completed_prototype_only",
      prototype_task_id: prototypeTaskId,
      stages: {
        ...startedSummary.stages,
        meshy_figure_prototype: "completed",
      },
    };
    await writeExperimentSummary(outputRoot, runDir, summary);
    console.log(`Figure prototype output: ${path.join(meshyDir, "prototype")}`);
    console.log(`Run directory: ${runDir}`);
    return;
  }

  let buildTaskId = args.skipBuildTaskId;
  if (!buildTaskId) {
    console.log("Creating Meshy Creative Lab Figure build task...");
    buildTaskId = await createFigureBuildTask(
      apiKey,
      prototypeTaskId,
      runDir,
      args,
    );
  }
  console.log(`Figure build task id: ${buildTaskId}`);
  const buildTask = await pollTask(
    apiKey,
    "/creative-lab/figure/v1/build",
    buildTaskId,
    meshyDir,
    "build-task",
    sanitizeModelTask,
    {
      ...args,
      apiRoot: MESHY_OPENAPI_ROOT,
    },
  );
  if (buildTask.status !== "SUCCEEDED") {
    await writeJson(
      path.join(meshyDir, "build-task.final.sanitized.json"),
      sanitizeModelTask(buildTask),
    );
    throw new Error(
      `Meshy figure build task ${buildTaskId} ended with status ${buildTask.status}.`,
    );
  }

  console.log("Downloading figure build assets...");
  const buildDir = path.join(meshyDir, "build");
  const downloadedAssets = await downloadModelTaskAssets(buildTask, buildDir);
  await writeJson(
    path.join(meshyDir, "build-task.final.sanitized.json"),
    sanitizeModelTask(buildTask, downloadedAssets),
  );

  const buildGlbUrl = buildTask.model_urls?.glb;
  let printabilityTaskId = null;
  let printabilityTask = null;
  if (buildGlbUrl) {
    console.log("Creating Meshy printability analysis for Creative Lab GLB...");
    printabilityTaskId = await createPrintabilityTask(apiKey, {
      modelUrl: buildGlbUrl,
    });
    console.log(`Printability task id: ${printabilityTaskId}`);
    printabilityTask = await pollTask(
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
  }

  const artifactNormalization = args.skipNormalization
    ? null
    : await runArtifactNormalization(buildDir, runDir, args);

  const summary = {
    ...startedSummary,
    completed_at: new Date().toISOString(),
    status: "completed",
    meshy_dir: meshyDir,
    build_dir: buildDir,
    normalized_dir: artifactNormalization
      ? path.join(runDir, "normalized")
      : null,
    prototype_task_id: prototypeTaskId,
    build_task_id: buildTaskId,
    printability_task_id: printabilityTaskId,
    printability_status: printabilityTask?.printability?.status ?? "not_run",
    artifact_normalization: artifactNormalization
      ? {
          postprocess_id: artifactNormalization.postprocess_id,
          output_dir: path.dirname(
            artifactNormalization.exported_files?.stl?.path ?? "",
          ),
          source_model: artifactNormalization.source_model,
          target_height_mm: artifactNormalization.target_height_mm,
          scale_factor: artifactNormalization.scale_factor,
          exported_files: artifactNormalization.exported_files,
          normalized_mesh: artifactNormalization.normalized_mesh,
        }
      : null,
    stages: {
      meshy_figure_prototype: "completed",
      meshy_figure_build: "completed",
      printability: buildGlbUrl ? "completed" : "not_requested_no_glb",
      normalization: artifactNormalization ? "completed" : "skipped",
    },
  };
  await writeExperimentSummary(outputRoot, runDir, summary);

  console.log(`Creative Lab Figure experiment done: ${runDir}`);
  console.log(`Meshy assets: ${meshyDir}`);
  console.log(`Build assets: ${buildDir}`);
  if (artifactNormalization) {
    console.log(`Normalized assets: ${path.join(runDir, "normalized")}`);
  } else {
    console.log("Normalization skipped.");
  }
  console.log(`Printability: ${summary.printability_status}`);
}

// Research-only conversion of existing assets: no new concept or geometry generation.
// Keep this stage in the standard runner so paid experiments remain reproducible.
async function runExistingModelMultiColorWorkflow(apiKey, args) {
  if (args.multiColorProvider === "hi3d") {
    await runExistingModelHi3dMultiColorWorkflow(args);
    return;
  }
  if (args.multiColorProvider && args.multiColorProvider !== "meshy") throw new Error("Unsupported --multi-color-provider.");
  if (!apiKey) throw new Error("MESHY_API_KEY is required for multi-color conversion.");
  const models = splitCsv(args.existingModels);
  if (models.length !== 1) throw new Error("Multi-color research requires exactly one --existing-models GLB path.");
  const styles = splitCsv(args.multiColorStyles, ["cartoon", "realistic"]);
  if (!styles.length || new Set(styles).size !== styles.length || styles.some((style) => !["cartoon", "realistic"].includes(style))) {
    throw new Error("--multi-color-styles must contain unique cartoon and/or realistic values.");
  }
  const maxColors = Number(args.maxColors ?? 4);
  if (!Number.isInteger(maxColors) || maxColors < 1 || maxColors > 16) throw new Error("--max-colors must be an integer from 1 to 16.");
  const printerBrand = args.printerBrand ?? "snapmaker";
  if (!["bambu", "anycubic", "creality", "elegoo", "flashforge", "prusa", "qidi", "snapmaker", "ankermake"].includes(printerBrand)) {
    throw new Error("Unsupported --printer-brand.");
  }
  const sourcePath = resolveFromRoot(models[0]);
  const stats = await fs.stat(sourcePath);
  if (path.extname(sourcePath).toLowerCase() !== ".glb" || stats.size > 100_000_000) {
    throw new Error("Multi-color local uploads require a GLB no larger than 100 MB.");
  }
  const outputRoot = resolveFromRoot(args.outputRoot, ".tmp/experiments/meshy/standard");
  const slug = args.experimentSlug ?? "existing-model-multi-color";
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) throw new Error("Invalid --experiment-slug.");
  const folder = args.runFolderName ?? `${slug}-${timestampForPath()}`;
  if (folder !== path.basename(folder) || [".", ".."].includes(folder)) throw new Error("Invalid --run-folder-name.");
  await fs.mkdir(outputRoot, { recursive: true });
  const runDir = path.join(outputRoot, folder);
  await fs.mkdir(runDir); // Refuse to overwrite or accidentally rebill an existing run.
  const summary = {
    created_at: new Date().toISOString(),
    experiment_runner: "standard-figurine-v1",
    workflow: "existing-model-multi-color",
    experiment_slug: slug,
    status: "started",
    run_dir: runDir,
    source_model: sourcePath,
    source_bytes: stats.size,
    max_colors: maxColors,
    printer_brand: printerBrand,
    conversions: [],
    physical_print_validated: false,
  };
  await writeExperimentSummary(outputRoot, runDir, summary);
  try {
    const bytes = await fs.readFile(sourcePath);
    const modelUrl = `data:model/gltf-binary;base64,${bytes.toString("base64")}`;
    for (const style of styles) {
      const outputDir = path.join(runDir, "meshy", style);
      const request = { model_url: modelUrl, max_colors: maxColors, style, printer_brand: printerBrand };
      await writeJson(path.join(outputDir, "multi-color-task.request.sanitized.json"), {
        ...request, model_url: "<local-glb-data-uri-redacted>",
      });
      console.log(`Creating ${style} ${maxColors}-color ${printerBrand} conversion from existing GLB.`);
      const created = await meshyJson(apiKey, "/print/multi-color", { method: "POST", body: request });
      const conversion = { style, task_id: created.result, status: "submitted" };
      summary.conversions.push(conversion);
      await writeExperimentSummary(outputRoot, runDir, summary);
      const task = await pollTask(apiKey, "/print/multi-color", created.result, outputDir, "multi-color-task", sanitizeModelTask, args);
      Object.assign(conversion, { status: task.status, consumed_credits: task.consumed_credits ?? null });
      if (task.status === "SUCCEEDED") {
        if (!task.model_urls?.["3mf"]) throw new Error("Successful conversion did not return a 3MF URL.");
        const destination = path.join(outputDir, `model.${style}.${maxColors}-color.3mf`);
        conversion.output_bytes = await downloadFile(task.model_urls["3mf"], destination);
        conversion.output_path = destination;
      }
      await writeJson(path.join(outputDir, "multi-color-task.final.sanitized.json"), sanitizeModelTask(task));
      await writeExperimentSummary(outputRoot, runDir, summary);
    }
    summary.status = summary.conversions.every((item) => item.status === "SUCCEEDED") ? "completed" : "failed";
    summary.completed_at = new Date().toISOString();
    summary.consumed_credits = summary.conversions.reduce((sum, item) => sum + (item.consumed_credits ?? 0), 0);
    await writeExperimentSummary(outputRoot, runDir, summary);
    if (summary.status !== "completed") throw new Error("One or more multi-color tasks failed; inspect sanitized task files.");
    console.log(`Multi-color experiment done: ${runDir} (${summary.consumed_credits} credits).`);
  } catch (error) {
    summary.status = "failed";
    await writeExperimentSummary(outputRoot, runDir, summary);
    // An upstream validation error may echo the upload; never log its base64 data.
    throw new Error(String(error.message).replace(/data:[^\s"']+/g, "<data-uri-redacted>").replaceAll(apiKey, "<api-key-redacted>").slice(0, 1000));
  }
}

async function runExistingModelHi3dMultiColorWorkflow(args) {
  const accessKey = process.env.HI3D_ACCESS_KEY;
  const secretKey = process.env.HI3D_SECRET_KEY;
  if (!accessKey || !secretKey) throw new Error("HI3D_ACCESS_KEY and HI3D_SECRET_KEY are required.");
  const models = splitCsv(args.existingModels);
  if (models.length !== 1) throw new Error("Hi3D conversion requires exactly one --existing-models GLB path.");
  const maxColors = Number(args.maxColors ?? 4);
  const minRegionFaces = Number(args.minRegionFaces ?? 50);
  if (!Number.isInteger(maxColors) || maxColors < 1 || maxColors > 8) throw new Error("Hi3D --max-colors must be an integer from 1 to 8.");
  if (!Number.isInteger(minRegionFaces) || minRegionFaces < 1) throw new Error("--min-region-faces must be a positive integer.");
  const sourcePath = resolveFromRoot(models[0]);
  const stats = await fs.stat(sourcePath);
  if (path.extname(sourcePath).toLowerCase() !== ".glb" || stats.size > 200_000_000) throw new Error("Hi3D requires a textured GLB no larger than 200 MB.");
  const outputRoot = resolveFromRoot(args.outputRoot, ".tmp/experiments/hi3d");
  const slug = args.experimentSlug ?? "existing-model-hi3d-multi-color";
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) throw new Error("Invalid --experiment-slug.");
  const folder = args.runFolderName ?? `${slug}-${timestampForPath()}`;
  if (folder !== path.basename(folder) || [".", ".."].includes(folder)) throw new Error("Invalid --run-folder-name.");
  await fs.mkdir(outputRoot, { recursive: true });
  const runDir = path.join(outputRoot, folder);
  if (!args.resumeTaskId) await fs.mkdir(runDir);
  let summary = {
    created_at: new Date().toISOString(), experiment_runner: "standard-figurine-v1",
    workflow: "existing-model-multi-color", provider: "hi3d", status: "started",
    experiment_slug: slug, source_model: sourcePath, source_bytes: stats.size,
    max_colors: maxColors, min_region_faces: minRegionFaces, output_format: "3mf",
    documented_credit_cost: 20, consumed_credits: null, physical_print_validated: false,
  };
  if (args.resumeTaskId) {
    if (!args.runFolderName) throw new Error("Resuming requires --run-folder-name.");
    summary = await readJson(path.join(runDir, "experiment.sanitized.json"));
    if (summary.provider !== "hi3d" || summary.task_id !== args.resumeTaskId || summary.source_model !== sourcePath || summary.max_colors !== maxColors || summary.min_region_faces !== minRegionFaces) {
      throw new Error("Resume arguments do not match the saved Hi3D task.");
    }
  }
  await writeExperimentSummary(outputRoot, runDir, summary);
  const apiRoot = "https://api.hitem3d.ai/open-api/v1";
  const safeJson = async (response, label) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.code !== 200) throw new Error(`Hi3D ${label}: HTTP ${response.status}, code=${payload.code ?? "unknown"}.`);
    return payload.data;
  };
  let token;
  try {
    const auth = await safeJson(await fetch(`${apiRoot}/auth/token`, {
      method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${accessKey}:${secretKey}`).toString("base64")}`, "Content-Type": "application/json" },
    }), "token exchange");
    token = auth?.accessToken;
    if (!token) throw new Error("Hi3D token exchange did not return an access token.");
    if (!args.resumeTaskId) {
      const request = { model: "multicolor", number_color: maxColors, min_region_faces: minRegionFaces, format: 6 };
      await writeJson(path.join(runDir, "request.sanitized.json"), { ...request, mesh: "<existing-local-glb-upload>" });
      const form = new FormData();
      for (const [key, value] of Object.entries(request)) form.append(key, String(value));
      form.append("mesh", new Blob([await fs.readFile(sourcePath)], { type: "model/gltf-binary" }), "model.glb");
      console.log(`Submitting Hi3D ${maxColors}-color 3MF conversion (min_region_faces=${minRegionFaces}).`);
      // The provider documents this spelling specifically for task creation.
      const created = await safeJson(await fetch(`${apiRoot}/muilticolor/create-task`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
      }), "multicolor create");
      if (!created?.task_id) throw new Error("Hi3D create did not return a task ID.");
      summary.task_id = created.task_id;
      summary.status = created.state ?? "submitted";
      await writeExperimentSummary(outputRoot, runDir, summary);
    }
    const started = Date.now();
    const timeoutMs = Number(args.timeoutMinutes ?? 20) * 60_000;
    while (Date.now() - started < timeoutMs) {
      const url = `${apiRoot}/multicolor/query-task?task_id=${encodeURIComponent(summary.task_id)}`;
      // Live verification: Token yields HTTP 200/code 401; Bearer succeeds.
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const task = await safeJson(response, "multicolor query");
      const safeTask = { task_id: summary.task_id, state: task.state, progress: task.progress ?? null, checked_at: new Date().toISOString(), has_model_url: Boolean(task.url), has_cover_url: Boolean(task.cover_url) };
      await writeJson(path.join(runDir, "task.latest.sanitized.json"), safeTask);
      await appendJsonLine(path.join(runDir, "task.poll-log.jsonl"), safeTask);
      console.log(`Hi3D ${summary.task_id}: ${task.state}`);
      summary.status = task.state;
      if (["success", "failed"].includes(task.state)) {
        if (task.state !== "success") throw new Error("Hi3D multicolor task failed; provider policy refunds failed generations.");
        if (!task.url) throw new Error("Hi3D succeeded without an output URL.");
        summary.output_path = path.join(runDir, `model.hi3d.${maxColors}-color.3mf`);
        summary.output_bytes = await downloadFile(task.url, summary.output_path);
        if (task.cover_url) {
          try { await downloadFile(task.cover_url, path.join(runDir, "provider-cover.png")); }
          catch { summary.cover_download_failed = true; }
        }
        summary.status = "completed";
        summary.completed_at = new Date().toISOString();
        await writeExperimentSummary(outputRoot, runDir, summary);
        console.log(`Hi3D multicolor experiment done: ${runDir}`);
        return;
      }
      await writeExperimentSummary(outputRoot, runDir, summary);
      await sleep(Number(args.pollIntervalMs ?? 10_000));
    }
    throw new Error("Hi3D polling timed out; task ID is saved. Query that task before submitting another paid request.");
  } catch (error) {
    summary.status = "interrupted_or_failed";
    await writeExperimentSummary(outputRoot, runDir, summary);
    let message = String(error.message);
    for (const secret of [accessKey, secretKey, token]) if (secret) message = message.replaceAll(secret, "<redacted>");
    throw new Error(message.slice(0, 500));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  await loadEnvFile(path.join(repoRoot, ".env"));
  await loadEnvFile(path.join(repoRoot, "apps", "functions", ".env"));

  if (args.directImages) {
    args.skipMultiview = true;
  }
  const workflow = args.workflow ?? "standard-multiview";
  if (!WORKFLOWS.has(workflow)) {
    throw new Error(
      `Unsupported --workflow value: ${workflow}. Supported: ${[...WORKFLOWS].join(", ")}.`,
    );
  }
  args.workflow = workflow;

  if (workflow === "existing-model-multi-color") {
    await runExistingModelMultiColorWorkflow(process.env.MESHY_API_KEY, args);
    return;
  }

  const outputRoot = resolveFromRoot(
    args.outputRoot,
    path.join(".tmp", "experiments", "meshy", "standard"),
  );
  const experimentSlug =
    args.experimentSlug ??
    (workflow === "creative-lab-figure"
      ? "exp006-creative-lab-figure"
      : workflow === "existing-model-print-tools"
        ? "exp-010-creative-lab-print-tools"
        : "exp-005-standard-body-only-normalized");
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(experimentSlug)) {
    throw new Error(
      "--experiment-slug must contain only letters, numbers, and hyphens.",
    );
  }
  args.experimentSlug = experimentSlug;

  const runFolder = args.runFolderName
    ? args.runFolderName
    : args.shortFolderName
      ? `${shortTimestampForPath()}-${experimentSlug}`
      : `${experimentSlug}-${timestampForPath()}`;
  const runDir = path.join(outputRoot, runFolder);
  const meshyDir = path.join(runDir, "meshy");
  await fs.mkdir(meshyDir, { recursive: true });

  const usesSourcePhoto = workflow !== "existing-model-print-tools";
  const inputPath = usesSourcePhoto
    ? resolveFromRoot(args.input, path.join(".tmp", "Profile-Pic-HIMSS.jpg"))
    : null;
  const copiedInputPath = usesSourcePhoto
    ? await copyInputImage(inputPath, runDir)
    : null;
  const directImagePaths = args.directImages
    ? splitCsv(args.directImages).map((imagePath) => resolveFromRoot(imagePath))
    : null;
  const copiedDirectImagePaths = directImagePaths
    ? await Promise.all(
        directImagePaths.map(async (imagePath, index) => {
          const ext = path.extname(imagePath).toLowerCase() || ".png";
          const destination = path.join(
            runDir,
            "input",
            `view-${index + 1}${ext}`,
          );
          await fs.mkdir(path.dirname(destination), { recursive: true });
          await fs.copyFile(imagePath, destination);
          return destination;
        }),
      )
    : null;
  const startedSummary = {
    created_at: new Date().toISOString(),
    experiment_runner: "standard-figurine-v1",
    workflow,
    experiment_slug: experimentSlug,
    status: "started",
    run_dir: runDir,
    input_path: inputPath,
    copied_input_path: copiedInputPath,
    direct_image_paths: directImagePaths,
    copied_direct_image_paths: copiedDirectImagePaths,
    stages: {
      existing_model_copy:
        workflow === "existing-model-print-tools" ? "pending" : "not_requested",
      vertex_delight: args.delightInput ? "pending" : "not_requested",
      vertex_concept:
        workflow === "creative-lab-figure" ||
        workflow === "existing-model-print-tools"
          ? "not_requested"
          : args.skipConcept
            ? "skipped_existing_concept"
            : "pending",
      meshy_multiview:
        workflow === "creative-lab-figure" ||
        workflow === "existing-model-print-tools" ||
        args.conceptOnly
          ? "not_requested"
          : args.skipMultiview
            ? "skipped_direct_3d"
            : "pending",
      meshy_model:
        workflow === "creative-lab-figure" ||
        workflow === "existing-model-print-tools" ||
        args.conceptOnly ||
        args.multiviewOnly
          ? "not_requested"
          : "pending",
      meshy_figure_prototype:
        workflow === "creative-lab-figure"
          ? args.skipPrototypeTaskId
            ? "skipped_existing_prototype"
            : "pending"
          : "not_requested",
      meshy_figure_build:
        workflow === "creative-lab-figure" && !args.prototypeOnly
          ? "pending"
          : "not_requested",
      printability:
        args.conceptOnly || args.multiviewOnly ? "not_requested" : "pending",
      provider_repair:
        workflow === "existing-model-print-tools"
          ? "pending"
          : workflow === "creative-lab-figure" ||
              args.conceptOnly ||
              args.multiviewOnly ||
              !args.providerDiagnostics
            ? "not_requested"
            : "pending",
      provider_remesh:
        workflow === "existing-model-print-tools"
          ? "pending"
          : workflow === "creative-lab-figure" ||
              args.conceptOnly ||
              args.multiviewOnly ||
              !args.providerDiagnostics
            ? "not_requested"
            : "pending",
      local_candidate_analysis:
        workflow === "existing-model-print-tools" ? "pending" : "not_requested",
      normalization:
        workflow === "existing-model-print-tools" ||
        args.conceptOnly ||
        args.multiviewOnly ||
        args.skipNormalization
          ? "not_requested"
          : "pending",
    },
  };
  await writeExperimentSummary(outputRoot, runDir, startedSummary);

  const apiKey = process.env.MESHY_API_KEY;
  if (workflow === "existing-model-print-tools") {
    if (!apiKey) {
      throw new Error("MESHY_API_KEY is required for Meshy print tooling.");
    }
    await runExistingModelPrintToolsWorkflow(
      apiKey,
      runDir,
      meshyDir,
      outputRoot,
      startedSummary,
      args,
    );
    return;
  }

  if (workflow === "creative-lab-figure") {
    if (!apiKey) {
      throw new Error(
        "MESHY_API_KEY is required for Meshy Creative Lab Figure stages.",
      );
    }
    const figureInputPath = args.delightInput
      ? await generateVertexDelight(copiedInputPath, runDir, args)
      : inputPath;
    if (args.delightInput) {
      startedSummary.stages.vertex_delight = "completed";
      startedSummary.delit_input_path = figureInputPath;
      await writeExperimentSummary(outputRoot, runDir, startedSummary);
    }
    await runCreativeLabFigureWorkflow(
      apiKey,
      figureInputPath,
      runDir,
      meshyDir,
      outputRoot,
      startedSummary,
      args,
    );
    return;
  }

  const rawConceptPath = args.skipConcept
    ? resolveFromRoot(args.skipConcept)
    : await generateVertexConcept(inputPath, runDir, args);
  const conceptPath = args.delightInput
    ? await generateVertexDelight(rawConceptPath, runDir, args)
    : rawConceptPath;
  if (args.delightInput) {
    startedSummary.stages.vertex_delight = "completed";
    startedSummary.delit_input_path = conceptPath;
  }

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

  if (!apiKey) {
    throw new Error("MESHY_API_KEY is required for Meshy stages.");
  }

  let imageTaskId = null;
  if (args.skipMultiview) {
    console.log(
      "Direct-3D mode: skipping Image-to-Image multi-view; concept image goes straight to Multi-Image-to-3D.",
    );
  } else {
    imageTaskId = args.skipImageTaskId;
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
      await writeJson(
        path.join(meshyDir, "image-task.final.sanitized.json"),
        sanitizeImageTask(imageTask),
      );
      throw new Error(
        `Meshy image task ${imageTaskId} ended with status ${imageTask.status}.`,
      );
    }

    console.log("Downloading multi-view reference images...");
    const downloadedImages = await downloadImageTaskImages(imageTask, meshyDir);
    await writeJson(
      path.join(meshyDir, "image-task.final.sanitized.json"),
      sanitizeImageTask(imageTask, downloadedImages),
    );
  }

  if (args.multiviewOnly && !args.skipMultiview) {
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
  const modelTaskId = await createMultiImageTo3dTask(
    apiKey,
    imageTaskId
      ? { imageTaskId }
      : { conceptPaths: directImagePaths ?? [conceptPath] },
    runDir,
    args,
  );
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
    await writeJson(
      path.join(meshyDir, "model-task.final.sanitized.json"),
      sanitizeModelTask(modelTask),
    );
    throw new Error(
      `Meshy model task ${modelTaskId} ended with status ${modelTask.status}.`,
    );
  }

  console.log("Downloading Meshy model assets...");
  const downloadedAssets = await downloadModelTaskAssets(modelTask, meshyDir);
  await writeJson(
    path.join(meshyDir, "model-task.final.sanitized.json"),
    sanitizeModelTask(modelTask, downloadedAssets),
  );

  console.log("Creating Meshy printability analysis...");
  const printabilityTaskId = await createPrintabilityTask(apiKey, {
    inputTaskId: modelTaskId,
  });
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

  const providerDiagnostics = await runProviderDiagnostics(
    apiKey,
    modelTaskId,
    modelTask,
    runDir,
    args,
  );

  const artifactNormalization = args.skipNormalization
    ? null
    : await runArtifactNormalization(meshyDir, runDir, args);

  const summary = {
    ...startedSummary,
    completed_at: new Date().toISOString(),
    status: "completed",
    concept_path: conceptPath,
    meshy_dir: meshyDir,
    normalized_dir: artifactNormalization
      ? path.join(runDir, "normalized")
      : null,
    image_task_id: imageTaskId,
    model_task_id: modelTaskId,
    printability_task_id: printabilityTaskId,
    printability_status: printabilityTask.printability?.status ?? "unknown",
    provider_diagnostics: providerDiagnostics,
    artifact_normalization: artifactNormalization
      ? {
          postprocess_id: artifactNormalization.postprocess_id,
          output_dir: path.dirname(
            artifactNormalization.exported_files?.stl?.path ?? "",
          ),
          source_model: artifactNormalization.source_model,
          target_height_mm: artifactNormalization.target_height_mm,
          scale_factor: artifactNormalization.scale_factor,
          exported_files: artifactNormalization.exported_files,
          normalized_mesh: artifactNormalization.normalized_mesh,
        }
      : null,
    stages: {
      vertex_concept: "completed",
      meshy_multiview: args.skipMultiview
        ? "skipped_direct_3d"
        : "completed",
      meshy_model: "completed",
      printability: "completed",
      provider_repair:
        providerDiagnostics?.repair?.repair_status ??
        providerDiagnostics?.repair?.status ??
        "not_requested",
      provider_remesh:
        providerDiagnostics?.remesh?.remesh_status ??
        providerDiagnostics?.remesh?.status ??
        "not_requested",
      normalization: artifactNormalization ? "completed" : "skipped",
    },
  };
  await writeExperimentSummary(outputRoot, runDir, summary);

  console.log(`Standard figurine experiment done: ${runDir}`);
  console.log(`Concept: ${conceptPath}`);
  console.log(`Meshy assets: ${meshyDir}`);
  if (artifactNormalization) {
    console.log(`Normalized assets: ${path.join(runDir, "normalized")}`);
  } else {
    console.log("Normalization skipped.");
  }
  console.log(`Printability: ${summary.printability_status}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
