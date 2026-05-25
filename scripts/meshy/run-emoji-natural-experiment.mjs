#!/usr/bin/env node

/**
 * Meshy Experiment 001: Emoji/avatar Natural pose, single generated concept.
 *
 * Sequence:
 *   source photo -> Vertex/Gemini 2D concept -> Meshy Image to 3D -> local assets.
 *
 * Result on 2026-05-24:
 *   Meshy task 019e5c65-7b2b-7641-abd6-ed04fb4e3d2e produced a visually
 *   promising full-body figurine, but printability analysis reported non-watertight
 *   geometry. Keep this file as the baseline single-concept experiment.
 */

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERTEX_EXPRESS_BASE_URL = "https://aiplatform.googleapis.com/v1";
const DEFAULT_VERTEX_IMAGE_MODEL = "gemini-2.5-flash-image";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");

function usage() {
  console.log(`Usage:
  node scripts/meshy/run-emoji-natural-experiment.mjs [options]

Options:
  --input <path>             Local JPG/PNG source photo. Default: .tmp/Profile-Pic-HIMSS.jpg.
  --output-root <path>       Output root for local experiment artifacts. Default: .tmp/experiments/meshy.
  --aspect-ratio <ratio>     Vertex image aspect ratio. Default: 3:4.
  --concept-only             Generate the 2D concept without submitting to Meshy.
  --skip-concept <path>      Use an existing concept PNG/JPG as Meshy input.
  --poll-interval-ms <ms>    Meshy poll interval. Default: 10000.
  --timeout-minutes <n>      Meshy poll timeout. Default: 60.
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

    if (key === "help" || key === "conceptOnly") {
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

function buildEmojiNaturalPrompt() {
  return [
    "Create one clean full-body 2D concept image for a personalized 3D printed emoji/avatar figurine.",
    "Use the uploaded photo only as the identity and outfit reference. Preserve recognizable facial likeness, broad hairstyle/head shape, glasses or facial hair if present, and the main clothing color impression.",
    "Style: emoji avatar, toy figurine, smooth rounded forms, simplified expressive face, friendly proportions, clean silhouette, broad color regions, polished plastic or vinyl character surface.",
    "Pose: natural standing pose, front-facing or slight three-quarter view, head, torso, arms, hands, legs, and feet all visible. Keep arms slightly away from the torso and hands visible so the body can become a complete 3D figurine.",
    "Composition: single character centered, full body from head to feet, plain white or transparent-looking studio background, no environment, no props unless they are part of the person, no text, no watermark.",
    "Printability: avoid tiny dangling parts, fragile fingers, hair wisps, noisy textures, photorealistic pores, busy clothing detail, cropped limbs, bust-only framing, floating objects, or side-view-only body shapes.",
    "Output only the concept image.",
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

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function readErrorBody(response) {
  try {
    return (await response.text()).slice(0, 1000);
  } catch {
    return "Unable to read error body.";
  }
}

async function generateConcept(inputPath, runDir, args) {
  const apiKey = process.env.VERTEX_API_KEY;
  if (!apiKey) {
    throw new Error("VERTEX_API_KEY is required to generate the Emoji/avatar concept.");
  }

  const model = process.env.VERTEX_IMAGE_MODEL ?? DEFAULT_VERTEX_IMAGE_MODEL;
  const prompt = buildEmojiNaturalPrompt();
  const sourceImageBuffer = await fs.readFile(inputPath);
  const sourceMimeType = contentTypeFor(inputPath);
  const aspectRatio = args.aspectRatio ?? "3:4";
  const generationConfig = {
    candidateCount: 1,
    responseModalities: ["TEXT", "IMAGE"],
    imageConfig: {
      aspectRatio,
    },
  };

  console.log("Generating Emoji/avatar Natural-pose concept with Vertex/Gemini...");
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
      generationConfig,
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
  const conceptPath = path.join(runDir, `concept.${extensionForMimeType(outputMimeType)}`);
  await fs.writeFile(conceptPath, Buffer.from(generatedImage.data, "base64"));

  await writeJson(path.join(runDir, "concept.sanitized.json"), {
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

async function runMeshy(conceptPath, runDir, args) {
  const meshyScript = path.join(scriptDir, "create-image-to-3d-job.mjs");
  const logPath = path.join(runDir, "meshy-run.log");
  const logStream = createWriteStream(logPath, { flags: "a" });
  const childArgs = [
    meshyScript,
    "--input",
    conceptPath,
    "--output-root",
    runDir,
    "--poll-interval-ms",
    String(args.pollIntervalMs ?? 10000),
    "--timeout-minutes",
    String(args.timeoutMinutes ?? 60),
  ];

  console.log("Submitting approved concept to Meshy Image-to-3D...");
  console.log(`Meshy log: ${logPath}`);

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, childArgs, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      logStream.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      logStream.write(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      logStream.end();
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Meshy runner failed with exit code ${code}. See ${logPath}.`));
    });
  });

  return latestMeshyOutputDir(runDir);
}

async function latestMeshyOutputDir(runDir) {
  const meshyRoot = path.join(runDir, "meshy");
  const entries = await fs.readdir(meshyRoot, { withFileTypes: true });
  const dirs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const fullPath = path.join(meshyRoot, entry.name);
        const stats = await fs.stat(fullPath);
        return {
          path: fullPath,
          mtimeMs: stats.mtimeMs,
        };
      }),
  );

  dirs.sort((left, right) => right.mtimeMs - left.mtimeMs);
  if (!dirs[0]) {
    throw new Error(`No Meshy output directory was created under ${meshyRoot}.`);
  }
  return dirs[0].path;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  await loadEnvFile(path.join(repoRoot, ".env"));
  await loadEnvFile(path.join(repoRoot, "apps", "functions", ".env"));

  const outputRoot = resolveFromRoot(args.outputRoot, path.join(".tmp", "experiments", "meshy"));
  const runDir = path.join(outputRoot, `emoji-natural-${timestampForPath()}`);
  await fs.mkdir(runDir, { recursive: true });

  const inputPath = resolveFromRoot(args.input, path.join(".tmp", "Profile-Pic-HIMSS.jpg"));
  const conceptPath = args.skipConcept
    ? resolveFromRoot(args.skipConcept)
    : await generateConcept(inputPath, runDir, args);

  await writeJson(path.join(runDir, "experiment.sanitized.json"), {
    created_at: new Date().toISOString(),
    experiment: "emoji_avatar_natural_pose_concept_to_meshy_image_to_3d",
    input_path: inputPath,
    concept_path: conceptPath,
    run_dir: runDir,
    meshy_submission: args.conceptOnly ? "skipped_concept_only" : "pending",
  });

  if (args.conceptOnly) {
    console.log(`Concept generated: ${conceptPath}`);
    console.log(`Done: ${runDir}`);
    return;
  }

  const meshyOutputDir = await runMeshy(conceptPath, runDir, args);
  await writeJson(path.join(runDir, "experiment.sanitized.json"), {
    completed_at: new Date().toISOString(),
    experiment: "emoji_avatar_natural_pose_concept_to_meshy_image_to_3d",
    input_path: inputPath,
    concept_path: conceptPath,
    run_dir: runDir,
    meshy_output_dir: meshyOutputDir,
    meshy_submission: "completed",
  });

  console.log(`Experiment done: ${runDir}`);
  console.log(`Concept: ${conceptPath}`);
  console.log(`Meshy output: ${meshyOutputDir}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
