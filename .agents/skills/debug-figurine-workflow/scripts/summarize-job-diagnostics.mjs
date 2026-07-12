#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

function usage() {
  return [
    "Usage:",
    "  node .agents/skills/debug-figurine-workflow/scripts/summarize-job-diagnostics.mjs <jobId> [--project <projectId>]",
    "  node .agents/skills/debug-figurine-workflow/scripts/summarize-job-diagnostics.mjs --from-json .tmp/job.json",
    "",
    "Prints curated, non-secret figurine workflow fields from Firestore or an exported JSON artifact.",
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

function positionalJobId() {
  return (
    process.argv
      .slice(2)
      .find((arg, index, args) => {
        if (arg.startsWith("-")) {
          return false;
        }
        const previous = args[index - 1];
        return previous !== "--project" && previous !== "--from-json";
      }) ?? null
  );
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function stringOrNull(value) {
  return typeof value === "string" && value.trim().length > 0
    ? sanitizeString(value.trim())
    : null;
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizeString(value) {
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return `${url.origin}${url.pathname}`;
    } catch {
      return value.replace(/\?.*$/, "?[redacted]");
    }
  }
  return value;
}

function timestampToIso(value) {
  if (!value) {
    return null;
  }
  if (typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value.seconds === "number") {
    return new Date(value.seconds * 1000).toISOString();
  }
  return null;
}

function pickStrings(source, keys) {
  const output = {};
  for (const key of keys) {
    const value = stringOrNull(record(source)[key]);
    if (value !== null) {
      output[key] = value;
    }
  }
  return output;
}

function pickNumbers(source, keys) {
  const output = {};
  for (const key of keys) {
    const value = numberOrNull(record(source)[key]);
    if (value !== null) {
      output[key] = value;
    }
  }
  return output;
}

function pickTimes(source, keys) {
  const output = {};
  for (const key of keys) {
    const value = timestampToIso(record(source)[key]);
    if (value !== null) {
      output[key] = value;
    }
  }
  return output;
}

function summarizeStorageLikeArray(value) {
  if (!Array.isArray(value)) {
    return { count: 0, paths: [] };
  }
  const paths = value
    .flatMap((item) => {
      const entry = record(item);
      return [
        entry.storagePath,
        entry.previewStoragePath,
        entry.imageStoragePath,
        entry.url,
      ];
    })
    .map(stringOrNull)
    .filter(Boolean);
  return { count: value.length, paths };
}

function summarizeJob(input) {
  const job = record(input.job);
  const order = input.order ? record(input.order) : null;
  const generationState = record(job.generationState);
  const aiGeneration = record(job.aiGeneration);
  const aiMetadata = record(aiGeneration.metadata);
  const workflowConfig = record(job.workflowConfig);
  const figurineConcept = record(job.figurineConcept);
  const figurineGeneration = record(job.figurineGeneration);
  const figurinePreview = record(job.figurinePreview);
  const figurineBuild = record(job.figurineBuild);
  const orderFulfillment = record(order?.fulfillment);

  const generatedOptions =
    Array.isArray(job.generatedOptions) || Array.isArray(job.generated_options)
      ? summarizeStorageLikeArray(job.generatedOptions ?? job.generated_options)
      : summarizeStorageLikeArray(job.proofOptions);

  const boundaryHints = [];
  if (
    aiGeneration.status === "succeeded" &&
    (figurineGeneration.status === "failed" ||
      figurineConcept.status === "failed")
  ) {
    boundaryHints.push(
      "Vertex/Gemini appears to have succeeded; inspect the generated-3D provider boundary.",
    );
  }
  if (!aiGeneration.status && generatedOptions.count === 0) {
    boundaryHints.push(
      "No AI generation status or proof options found; inspect upload/callable/auth/config first.",
    );
  }
  if (
    figurineGeneration.workflow === "creative_lab_figure" &&
    figurineGeneration.prototypeTaskId &&
    !figurineGeneration.buildTaskId
  ) {
    boundaryHints.push(
      "Creative Lab prototype exists without build task; inspect concept/prototype stage.",
    );
  }
  if (
    figurineGeneration.workflow === "direct_multi_image_to_3d" &&
    !figurinePreview.storagePath &&
    !figurinePreview.glbStoragePath
  ) {
    boundaryHints.push(
      "Direct workflow has no preview artifact; inspect Hi3D/Meshy direct task output.",
    );
  }
  if (figurinePreview.printReadiness === "needs_review") {
    boundaryHints.push(
      "Preview exists but print readiness needs review; this is an operator/print-readiness boundary.",
    );
  }

  return {
    target: input.target,
    jobId: input.jobId ?? stringOrNull(job.jobId) ?? null,
    job: {
      productType: stringOrNull(job.productType),
      selectedStyle: stringOrNull(job.selectedStyle),
      selectedStyleLabel: stringOrNull(job.selectedStyleLabel),
      status: stringOrNull(job.status),
      pipelineStage: stringOrNull(job.pipelineStage),
      createdAt: timestampToIso(job.createdAt),
      updatedAt: timestampToIso(job.updatedAt),
    },
    workflowConfig: {
      proofGenerationCount: numberOrNull(workflowConfig.proofGenerationCount),
      proofMode: stringOrNull(workflowConfig.proofMode),
      proofRendering: stringOrNull(workflowConfig.proofRendering),
      generationWorkflow: stringOrNull(workflowConfig.generationWorkflow),
      generated3dProvider: stringOrNull(workflowConfig.generated3dProvider),
      generated3dProviderModel: stringOrNull(
        workflowConfig.generated3dProviderModel,
      ),
    },
    generationState: {
      ...pickStrings(generationState, [
        "state",
        "stage",
        "status",
        "publicMessage",
        "failureCode",
        "errorCode",
        "errorMessage",
      ]),
      ...pickTimes(generationState, [
        "startedAt",
        "lastProgressAt",
        "completedAt",
        "failedAt",
      ]),
    },
    aiGeneration: {
      ...pickStrings(aiGeneration, [
        "provider",
        "status",
        "previewStoragePath",
        "outputStoragePath",
        "errorCode",
        "errorMessage",
      ]),
      ...pickStrings(aiMetadata, [
        "proofMode",
        "requestRoute",
        "modelVersion",
        "templateReferenceImageId",
      ]),
      ...pickTimes(aiGeneration, ["startedAt", "completedAt", "failedAt"]),
    },
    generatedOptions,
    figurineConcept: {
      ...pickStrings(figurineConcept, [
        "status",
        "conceptSource",
        "prototypeTaskId",
        "imageStoragePath",
        "previewStoragePath",
        "errorCode",
        "errorMessage",
      ]),
      ...pickTimes(figurineConcept, ["startedAt", "completedAt", "failedAt"]),
    },
    figurineGeneration: {
      ...pickStrings(figurineGeneration, [
        "provider",
        "providerModel",
        "workflow",
        "status",
        "prototypeTaskId",
        "buildTaskId",
        "modelTaskId",
        "providerTaskId",
        "storagePath",
        "glbStoragePath",
        "previewStoragePath",
        "printReadiness",
        "errorCode",
        "errorMessage",
      ]),
      ...pickNumbers(figurineGeneration, ["consumedCredits"]),
      ...pickTimes(figurineGeneration, [
        "startedAt",
        "completedAt",
        "failedAt",
      ]),
    },
    figurinePreview: {
      ...pickStrings(figurinePreview, [
        "storagePath",
        "glbStoragePath",
        "previewStoragePath",
        "printReadiness",
        "source",
      ]),
    },
    figurineBuild: {
      ...pickStrings(figurineBuild, ["status", "errorCode", "errorMessage"]),
      ...pickNumbers(figurineBuild, ["attempts"]),
      ...pickTimes(figurineBuild, ["queuedAt", "startedAt", "completedAt"]),
    },
    order: order
      ? {
          status: stringOrNull(order.status),
          paymentStatus: stringOrNull(order.paymentStatus),
          fulfillmentStage: stringOrNull(orderFulfillment.stage),
          updatedAt: timestampToIso(order.updatedAt),
        }
      : null,
    boundaryHints,
  };
}

async function readLiveFirestore(jobId, projectId) {
  const { initializeApp, getApps } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");

  if (getApps().length === 0) {
    initializeApp({ projectId });
  }

  const db = getFirestore();
  const [jobSnap, orderSnap] = await Promise.all([
    db.collection("jobs").doc(jobId).get(),
    db.collection("orders").doc(jobId).get(),
  ]);

  if (!jobSnap.exists) {
    throw new Error(`jobs/${jobId} does not exist in project ${projectId}.`);
  }

  return {
    target: process.env.FIRESTORE_EMULATOR_HOST
      ? `firestore-emulator:${process.env.FIRESTORE_EMULATOR_HOST}`
      : `project:${projectId}`,
    jobId,
    job: jobSnap.data() ?? {},
    order: orderSnap.exists ? orderSnap.data() ?? {} : null,
  };
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(usage());
    return;
  }

  const fromJson = readArg("--from-json");
  if (fromJson) {
    const parsed = JSON.parse(fs.readFileSync(fromJson, "utf8"));
    const input =
      parsed.job || parsed.order
        ? parsed
        : { target: `json:${fromJson}`, job: parsed, order: null };
    console.log(JSON.stringify(summarizeJob(input), null, 2));
    return;
  }

  const jobId = readArg("--job-id") ?? positionalJobId();
  if (!jobId) {
    console.error(usage());
    process.exit(2);
  }

  const projectId =
    readArg("--project") ??
    process.env.GCLOUD_PROJECT ??
    process.env.GOOGLE_CLOUD_PROJECT ??
    "gen-lang-client-0675309660";

  const input = await readLiveFirestore(jobId, projectId);
  console.log(JSON.stringify(summarizeJob(input), null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
