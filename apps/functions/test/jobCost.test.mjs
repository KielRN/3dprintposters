import assert from "node:assert/strict";
import { test } from "node:test";

import {
  calculateJobCost,
  summarizeProviderCredits,
} from "../lib/jobCost.js";

const now = new Date("2026-06-17T12:00:00.000Z");

function baseFigurineJob() {
  return {
    uid: "user-1",
    productType: "figurine",
    sourceImagePath: "uploads/user-1/job-1/source.jpg",
    generatedImages: [1, 2, 3, 4].map((index) => ({
      id: `preview-${index}`,
      storagePath: `generated/user-1/job-1/preview-${index}.png`,
      status: "ready",
    })),
    aiGeneration: {
      provider: "vertex-gemini-direct",
      status: "succeeded",
      metadata: {
        model: "gemini-3-pro-image",
        outputMimeType: "image/png",
        proofGenerationCount: 4,
      },
    },
  };
}

function creativeLabJob() {
  return {
    ...baseFigurineJob(),
    figurineGeneration: {
      provider: "meshy",
      workflow: "creative_lab_figure",
      status: "preview_ready",
      prototypeTaskId: "prototype-task",
      buildTaskId: "build-task",
      consumedCredits: 36,
    },
  };
}

function printToolingJob() {
  return {
    ...creativeLabJob(),
    figurinePrintTooling: {
      status: "completed",
      originalAnalyze: {
        taskId: "analyze-original",
        task: { status: "SUCCEEDED", consumed_credits: 0 },
      },
      repair: {
        taskId: "repair",
        task: { status: "SUCCEEDED", consumed_credits: 10 },
      },
      repairedAnalyze: {
        taskId: "analyze-repaired",
        task: { status: "SUCCEEDED", consumed_credits: 0 },
      },
      remesh: {
        taskId: "remesh",
        request: {
          topology: "quad",
          targetPolycount: 100000,
          targetFormats: ["glb", "stl", "3mf"],
        },
        task: { status: "SUCCEEDED", consumed_credits: 5 },
      },
      remeshAnalyzeByFormat: {
        glb: {
          taskId: "analyze-remesh-glb",
          task: { status: "SUCCEEDED", consumed_credits: 0 },
        },
        stl: {
          taskId: "analyze-remesh-stl",
          task: { status: "SUCCEEDED", consumed_credits: 0 },
        },
        "3mf": {
          status: "not_run",
          reason: "format_not_supported_by_meshy_analyze",
        },
      },
    },
  };
}

test("estimates Gemini proof generation cost", () => {
  const cost = calculateJobCost(baseFigurineJob(), { now });

  assert.equal(cost.status, "estimated");
  assert.equal(cost.totalsByProvider.gemini?.estimatedUsd, 0.5604);
  assert.equal(cost.providerCostUsd, 0.5604);
  assert.equal(
    cost.items.filter((item) => item.phase === "proof_generation").length,
    3,
  );
  assert.deepEqual(
    cost
      .items
      .filter((item) => item.phase === "proof_generation")
      .map((item) => item.quantity),
    [4, 4, 4],
  );
});

test("summarizes Creative Lab prototype and build credits", () => {
  const cost = calculateJobCost(creativeLabJob(), { now });

  assert.equal(summarizeProviderCredits(cost).meshy, 36);
  assert.equal(cost.totalsByProvider.meshy?.estimatedUsd, 0.72);
  assert.deepEqual(
    cost
      .items
      .filter((item) => item.phase === "figurine_generation")
      .map((item) => item.credits),
    [6, 30],
  );
});

test("totals successful print tooling without double-counting analyze rows", () => {
  const cost = calculateJobCost(printToolingJob(), { now });

  assert.equal(cost.providerCreditTotals.meshy, 51);
  assert.equal(cost.totalsByProvider.meshy?.estimatedUsd, 1.02);
  assert.equal(cost.providerCostUsd, 1.5804);
  assert.equal(
    cost.items.find((item) => item.provider === "All AI providers")
      ?.estimatedCostUsd,
    1.5804,
  );
});

test("uses fallback credits when provider task metadata is incomplete", () => {
  const job = {
    ...baseFigurineJob(),
    figurineGeneration: {
      provider: "meshy",
      workflow: "creative_lab_figure",
      status: "preview_ready",
      prototypeTaskId: "prototype-task",
      buildTaskId: "build-task",
    },
    figurinePrintTooling: {
      status: "completed",
      originalAnalyze: {
        taskId: "analyze-original",
        task: { status: "SUCCEEDED" },
      },
      repair: { taskId: "repair", task: { status: "SUCCEEDED" } },
      repairedAnalyze: {
        taskId: "analyze-repaired",
        task: { status: "SUCCEEDED" },
      },
      remesh: { taskId: "remesh", task: { status: "SUCCEEDED" } },
    },
  };

  const cost = calculateJobCost(job, { now });

  assert.equal(cost.status, "partial");
  assert.equal(cost.providerCreditTotals.meshy, 51);
  assert.ok(cost.items.some((item) => item.confidence === "estimated"));
});

test("includes failed Meshy provider task credits as partial cost", () => {
  const cost = calculateJobCost(
    {
      ...baseFigurineJob(),
      error: {
        stage: "figurine_preview_generation",
        providerTask: {
          taskId: "failed-prototype",
          label: "figure prototype",
          status: "FAILED",
          consumedCredits: 6,
        },
      },
    },
    { now },
  );

  assert.equal(cost.status, "partial");
  assert.equal(cost.providerCreditTotals.meshy, 6);
  assert.equal(
    cost.items.find((item) => item.taskId === "failed-prototype")
      ?.estimatedCostUsd,
    0.12,
  );
});
