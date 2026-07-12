#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

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

function extractUnionValues(source, typeName) {
  const match = source.match(
    new RegExp(`export\\s+type\\s+${typeName}\\s*=([\\s\\S]*?);`),
  );
  if (!match) {
    return null;
  }
  return Array.from(match[1].matchAll(/"([^"]+)"/g), (value) => value[1]);
}

function extractPromptConstants(source) {
  return Array.from(
    source.matchAll(/export\s+const\s+([A-Za-z0-9]+Prompt)\s*=/g),
    (match) => match[1],
  ).sort();
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort();
}

const root = findRepoRoot(process.cwd());
const paths = {
  functionsConfig: path.join(
    root,
    "apps/functions/src/figurineWorkflowConfig.ts",
  ),
  webConfig: path.join(root, "apps/web/lib/figurineWorkflowConfig.ts"),
  admin: path.join(root, "apps/web/components/AdminWorkflowConfig.tsx"),
  aiProvider: path.join(root, "apps/functions/src/aiProvider.ts"),
  workflowConfigTest: path.join(
    root,
    "apps/functions/test/figurineWorkflowConfig.test.mjs",
  ),
};

const sources = Object.fromEntries(
  Object.entries(paths).map(([key, filePath]) => [key, readRequired(filePath)]),
);

const issues = [];
const warnings = [];

for (const typeName of [
  "WorkflowProofMode",
  "WorkflowGenerationWorkflow",
  "WorkflowFigurineProvider",
]) {
  const functionsValues = extractUnionValues(sources.functionsConfig, typeName);
  const webValues = extractUnionValues(sources.webConfig, typeName);
  if (!functionsValues || !webValues) {
    issues.push(`Could not read ${typeName} from both workflow config files.`);
    continue;
  }
  if (functionsValues.join("|") !== webValues.join("|")) {
    issues.push(
      `${typeName} differs: functions=${functionsValues.join(",")} web=${webValues.join(",")}`,
    );
  }
}

const functionsPrompts = extractPromptConstants(sources.functionsConfig);
const webPrompts = extractPromptConstants(sources.webConfig);
for (const promptName of functionsPrompts) {
  if (!webPrompts.includes(promptName)) {
    issues.push(`Prompt constant ${promptName} exists in Functions only.`);
  }
}
for (const promptName of webPrompts) {
  if (!functionsPrompts.includes(promptName)) {
    issues.push(`Prompt constant ${promptName} exists in Web only.`);
  }
}

for (const requiredPrompt of [
  "defaultTemplateFaceSwapPrompt",
  "templateFaceSwapFemaleCollectiblePrompt",
]) {
  if (!sources.admin.includes(requiredPrompt)) {
    issues.push(`Admin Workflow Controls does not import/use ${requiredPrompt}.`);
  }
}

if (
  sources.webConfig.includes("templateFaceSwapFemaleCollectiblePrompt") &&
  !sources.admin.includes('"template_face_swap_female_collectible"')
) {
  issues.push(
    "Female collectible face-swap prompt exists but admin preset value is missing.",
  );
}

if (!sources.aiProvider.includes("resolveTemplateFaceSwapPrompt")) {
  issues.push("aiProvider.ts is missing resolveTemplateFaceSwapPrompt.");
}

if (!sources.aiProvider.includes("buildFigurineProofPrompt")) {
  issues.push("aiProvider.ts is missing buildFigurineProofPrompt.");
}

for (const promptName of webPrompts) {
  if (!sources.workflowConfigTest.includes(promptName)) {
    warnings.push(
      `No direct workflow-config test reference found for ${promptName}.`,
    );
  }
}

const summary = {
  ok: issues.length === 0,
  promptConstants: {
    functions: functionsPrompts,
    web: webPrompts,
  },
  adminPresetValues: uniqueSorted(
    Array.from(
      sources.admin.matchAll(
        /"((?:generated_options|template_face_swap)[a-z0-9_]*)"/g,
      ),
      (match) => match[1],
    ),
  ),
  issues,
  warnings,
};

console.log(JSON.stringify(summary, null, 2));
if (issues.length > 0) {
  process.exitCode = 1;
}
