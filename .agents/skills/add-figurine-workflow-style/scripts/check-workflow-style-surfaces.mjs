#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function usage() {
  return [
    "Usage:",
    "  node .agents/skills/add-figurine-workflow-style/scripts/check-workflow-style-surfaces.mjs --style-id <id> [--label <label>]",
    "",
    "Checks that a figurine workflow style appears in the mirrored Functions/Web config surfaces and warns about docs/seed gaps.",
  ].join("\n");
}

function readArg(name) {
  const equalsPrefix = `${name}=`;
  const equalsValue = process.argv.find((arg) => arg.startsWith(equalsPrefix));
  if (equalsValue) {
    return equalsValue.slice(equalsPrefix.length);
  }
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : null;
}

function findRepoRoot(startDir) {
  let current = path.resolve(startDir);
  while (current !== path.dirname(current)) {
    const packagePath = path.join(current, "package.json");
    if (fs.existsSync(packagePath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
        if (pkg.name === "3d-print-posters") {
          return current;
        }
      } catch {
        // Keep walking.
      }
    }
    current = path.dirname(current);
  }
  throw new Error("Could not find 3DPrintPosters repo root.");
}

function readRequired(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function findStyleBlock(source, styleId) {
  const needle = `id: "${styleId}"`;
  const index = source.indexOf(needle);
  if (index < 0) {
    return null;
  }
  const start = Math.max(0, source.lastIndexOf("{", index));
  const end = source.indexOf("};", index);
  return source.slice(start, end > index ? end + 2 : index + 1600);
}

function extractQuotedField(block, fieldName) {
  const match = block.match(
    new RegExp(`${fieldName}\\s*:\\s*"([^"]+)"`, "m"),
  );
  return match ? match[1] : null;
}

function listMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listMarkdownFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith(".md") ? [fullPath] : [];
  });
}

const styleId = readArg("--style-id") ?? process.argv.slice(2).find((arg) => !arg.startsWith("-"));
const label = readArg("--label");

if (!styleId) {
  console.error(usage());
  process.exit(2);
}

const root = findRepoRoot(process.cwd());
const files = {
  functionsConfig: path.join(
    root,
    "apps/functions/src/figurineWorkflowConfig.ts",
  ),
  webConfig: path.join(root, "apps/web/lib/figurineWorkflowConfig.ts"),
  admin: path.join(root, "apps/web/components/AdminWorkflowConfig.tsx"),
};
const sources = Object.fromEntries(
  Object.entries(files).map(([key, filePath]) => [key, readRequired(filePath)]),
);

const issues = [];
const warnings = [];
const surfaces = {};

for (const [surface, source] of Object.entries({
  functionsConfig: sources.functionsConfig,
  webConfig: sources.webConfig,
})) {
  const block = findStyleBlock(source, styleId);
  if (!block) {
    issues.push(`${styleId} not found in ${surface}.`);
    surfaces[surface] = null;
    continue;
  }

  const summary = {
    label: extractQuotedField(block, "label"),
    proofMode: extractQuotedField(block, "proofMode"),
    generationWorkflow: extractQuotedField(block, "generationWorkflow"),
    provider: extractQuotedField(block, "provider"),
    providerModel: extractQuotedField(block, "providerModel"),
    enabled: /enabled\s*:\s*true/.test(block)
      ? true
      : /enabled\s*:\s*false/.test(block)
        ? false
        : null,
    hasReferenceImages: /referenceImages\s*:/.test(block),
  };
  surfaces[surface] = summary;

  for (const requiredField of [
    "label",
    "proofMode",
    "generationWorkflow",
    "enabled",
  ]) {
    if (summary[requiredField] === null) {
      issues.push(`${styleId} is missing ${requiredField} in ${surface}.`);
    }
  }

  if (!summary.hasReferenceImages) {
    issues.push(`${styleId} is missing referenceImages in ${surface}.`);
  }
}

if (surfaces.functionsConfig && surfaces.webConfig) {
  for (const field of [
    "label",
    "proofMode",
    "generationWorkflow",
    "provider",
    "providerModel",
    "enabled",
  ]) {
    if (surfaces.functionsConfig[field] !== surfaces.webConfig[field]) {
      issues.push(
        `${styleId} ${field} differs: functions=${surfaces.functionsConfig[field]} web=${surfaces.webConfig[field]}`,
      );
    }
  }
}

if (label) {
  for (const [surface, summary] of Object.entries(surfaces)) {
    if (summary && summary.label !== label) {
      issues.push(`${surface} label is "${summary.label}", expected "${label}".`);
    }
  }
}

if (
  surfaces.functionsConfig?.generationWorkflow === "direct_multi_image_to_3d" &&
  (!surfaces.functionsConfig.provider || !surfaces.functionsConfig.providerModel)
) {
  issues.push(`${styleId} is direct Multi-Image-to-3D but lacks provider/model.`);
}

const docsDir = path.join(root, "docs/Workflows");
const matchingDocs = listMarkdownFiles(docsDir)
  .filter((filePath) => {
    const source = fs.readFileSync(filePath, "utf8");
    return source.includes(styleId) || (label ? source.includes(label) : false);
  })
  .map((filePath) => path.relative(root, filePath).replaceAll("\\", "/"));

if (matchingDocs.length === 0) {
  warnings.push(
    `${styleId} was not found in docs/Workflows. Add docs if this is durable/public.`,
  );
}

const seedScriptsDir = path.join(root, "apps/functions/scripts");
const seedScriptMatches = fs.existsSync(seedScriptsDir)
  ? fs
      .readdirSync(seedScriptsDir)
      .filter(
        (name) =>
          name.startsWith("seed-") &&
          name.endsWith(".mjs") &&
          name.includes(styleId.replaceAll("_", "-").split("-")[0]),
      )
  : [];

if (
  surfaces.functionsConfig?.proofMode === "template_face_swap" &&
  seedScriptMatches.length === 0
) {
  warnings.push(
    `${styleId} uses template_face_swap. Confirm a seed path uploads/enables its reference image.`,
  );
}

const summary = {
  ok: issues.length === 0,
  styleId,
  surfaces,
  matchingDocs,
  seedScriptMatches,
  adminHasDirectWorkflowSelector: sources.admin.includes(
    '"direct_multi_image_to_3d"',
  ),
  issues,
  warnings,
};

console.log(JSON.stringify(summary, null, 2));
if (issues.length > 0) {
  process.exitCode = 1;
}
