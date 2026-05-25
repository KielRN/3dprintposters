#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_ROOT = "https://api.meshy.ai/openapi/v1";
const TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "CANCELED"]);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");

function usage() {
  console.log(`Usage:
  node scripts/meshy/analyze-printability-task.mjs --input-task-id <meshy-task-id> [options]

Options:
  --output-dir <path>        Directory for sanitized analysis files.
  --poll-interval-ms <ms>    Poll interval. Default: 5000.
  --timeout-minutes <n>      Poll timeout. Default: 10.
  --help                     Show this help.
`);
}

function parseArgs(argv) {
  const args = {};
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split("=", 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

    if (key === "help") {
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

  if (!args.inputTaskId && positional[0]) {
    args.inputTaskId = positional[0];
  }
  if (!args.outputDir && positional[1]) {
    args.outputDir = positional[1];
  }
  if (positional.length > 2) {
    throw new Error(`Unexpected positional argument: ${positional[2]}`);
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

function sanitizeTask(task) {
  return {
    id: task.id,
    type: task.type,
    status: task.status,
    progress: task.progress,
    preceding_tasks: task.preceding_tasks,
    created_at: task.created_at,
    started_at: task.started_at,
    finished_at: task.finished_at,
    expires_at: task.expires_at,
    task_error: task.task_error,
    printability: task.printability,
    consumed_credits: task.consumed_credits,
  };
}

async function createAnalyzeTask(apiKey, inputTaskId) {
  const response = await meshyJson(apiKey, "/print/analyze", {
    method: "POST",
    body: {
      input_task_id: inputTaskId,
    },
  });

  if (!response.result) {
    throw new Error("Meshy did not return a printability analysis task id.");
  }
  return response.result;
}

async function pollAnalyzeTask(apiKey, analyzeTaskId, outputDir, args) {
  const intervalMs = Number(args.pollIntervalMs ?? 5000);
  const timeoutMs = Number(args.timeoutMinutes ?? 10) * 60 * 1000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const task = await meshyJson(apiKey, `/print/analyze/${analyzeTaskId}`);
    const safeTask = sanitizeTask(task);
    await appendJsonLine(path.join(outputDir, "printability.poll-log.jsonl"), {
      checked_at: new Date().toISOString(),
      ...safeTask,
    });
    await writeJson(path.join(outputDir, "printability.latest.sanitized.json"), safeTask);

    const progressLabel =
      task.progress === undefined || task.progress === null
        ? "unknown progress"
        : `${task.progress}%`;
    console.log(`Meshy printability ${analyzeTaskId}: ${task.status} (${progressLabel})`);

    if (TERMINAL_STATUSES.has(task.status)) {
      return task;
    }

    await sleep(intervalMs);
  }

  throw new Error(`Timed out while waiting for Meshy printability task ${analyzeTaskId}.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  if (!args.inputTaskId) {
    throw new Error("--input-task-id is required.");
  }

  await loadEnvFile(path.join(repoRoot, ".env"));
  await loadEnvFile(path.join(repoRoot, "apps", "functions", ".env"));

  const apiKey = process.env.MESHY_API_KEY;
  if (!apiKey) {
    throw new Error("MESHY_API_KEY is not set in the environment or local .env file.");
  }

  const outputDir = resolveFromRoot(args.outputDir, path.join(".tmp", "print-files", "meshy", args.inputTaskId));
  console.log(`Creating Meshy printability analysis for ${args.inputTaskId}...`);
  const analyzeTaskId = await createAnalyzeTask(apiKey, args.inputTaskId);
  console.log(`Analysis task id: ${analyzeTaskId}`);

  const finalTask = await pollAnalyzeTask(apiKey, analyzeTaskId, outputDir, args);
  const finalSummary = sanitizeTask(finalTask);
  await writeJson(path.join(outputDir, "printability.final.sanitized.json"), finalSummary);

  if (finalTask.status !== "SUCCEEDED") {
    throw new Error(`Meshy printability task ${analyzeTaskId} ended with status ${finalTask.status}.`);
  }

  console.log(`Printability: ${finalTask.printability?.status ?? "unknown"}`);
  console.log(`Done: ${path.join(outputDir, "printability.final.sanitized.json")}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
