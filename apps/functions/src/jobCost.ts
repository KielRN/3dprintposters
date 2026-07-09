export type JobCostPhase =
  | "proof_generation"
  | "figurine_generation"
  | "scene_preview"
  | "assembled_print_tooling"
  | "total";

export type JobCostProvider =
  | "Google Vertex/Gemini"
  | "Meshy"
  | "All AI providers";

export type JobCostConfidence =
  | "actual"
  | "estimated"
  | "actual_credits_estimated_usd"
  | "mixed";

export type JobCostStatus = "estimated" | "partial" | "final";

export type JobCostItem = {
  phase: JobCostPhase;
  provider: JobCostProvider;
  modelOrEndpoint: string;
  taskId?: string;
  status: string;
  quantity: number;
  unit: string;
  credits?: number;
  creditUnitCostUsd?: number;
  estimatedCostUsd: number;
  confidence: JobCostConfidence;
  pricingBasis: string;
  notes?: string;
};

export type JobCost = {
  status: JobCostStatus;
  currency: "USD";
  updatedAt: Date;
  providerCostUsd: number;
  providerCreditTotals: {
    meshy: number;
  };
  totalsByProvider: {
    gemini?: { estimatedUsd: number; confidence: "estimated" | "actual" };
    meshy?: {
      credits: number;
      estimatedUsd: number;
      confidence: "actual_credits_estimated_usd" | "estimated" | "actual";
    };
  };
  items: JobCostItem[];
  assumptions: {
    pricingVersion: string;
    meshyCreditUnitCostUsd: number;
    geminiPricingSource: string;
    meshyPricingSource: string;
  };
};

type CalculateJobCostOptions = {
  now?: Date;
};

type MutableCostState = {
  items: JobCostItem[];
  sawEstimated: boolean;
  sawPartial: boolean;
  taskIds: Set<string>;
};

const pricing = {
  version: "provider-cost-assumptions-2026-06-17-v1",
  meshyCreditUnitCostUsd: 0.02,
  geminiInputImageUsd: 0.0011,
  geminiOutputImageUsd: 0.134,
  geminiTextAllowanceUsd: 0.005,
  meshyCreativeLabPrototypeFallbackCredits: 6,
  meshyCreativeLabBuildFallbackCredits: 30,
  meshyDirectMultiImageFallbackCredits: 30,
  meshyAnalyzeFallbackCredits: 0,
  meshyRepairFallbackCredits: 10,
  meshyRemeshFallbackCredits: 5,
  geminiPricingSource:
    "Initial Gemini 3 Pro Image estimate: input image equivalent $0.0011, 1K/2K output image $0.134, plus $0.005 text/thinking allowance.",
  meshyPricingSource:
    "Meshy public Pro-plan reference used for USD estimate: $20 for 1000 credits, or $0.02 per credit.",
} as const;

export function calculateJobCost(
  jobData: Record<string, unknown>,
  options: CalculateJobCostOptions = {},
): JobCost {
  const state: MutableCostState = {
    items: [],
    sawEstimated: false,
    sawPartial: false,
    taskIds: new Set(),
  };

  addGeminiProofItems(state, jobData);
  addScenePreviewItems(state, jobData);
  addCreativeLabItems(state, jobData);
  addDirectMultiImageItems(state, jobData);
  addPrintToolingItems(state, jobData);
  addFailedProviderTaskItems(state, jobData);

  const providerItems = state.items.filter((item) => item.phase !== "total");
  const meshyCredits = sum(
    providerItems
      .filter((item) => item.provider === "Meshy")
      .map((item) => item.credits ?? 0),
  );
  const meshyEstimatedUsd = roundMoney(
    providerItems
      .filter((item) => item.provider === "Meshy")
      .reduce((total, item) => total + item.estimatedCostUsd, 0),
  );
  const geminiEstimatedUsd = roundMoney(
    providerItems
      .filter((item) => item.provider === "Google Vertex/Gemini")
      .reduce((total, item) => total + item.estimatedCostUsd, 0),
  );

  addTotalItems(state, {
    meshyCredits,
    meshyEstimatedUsd,
    geminiEstimatedUsd,
  });

  const providerCostUsd = roundMoney(meshyEstimatedUsd + geminiEstimatedUsd);

  return {
    status: state.sawPartial
      ? "partial"
      : state.sawEstimated
        ? "estimated"
        : "final",
    currency: "USD",
    updatedAt: options.now ?? new Date(),
    providerCostUsd,
    providerCreditTotals: {
      meshy: meshyCredits,
    },
    totalsByProvider: {
      ...(geminiEstimatedUsd > 0
        ? {
            gemini: {
              estimatedUsd: geminiEstimatedUsd,
              confidence: "estimated" as const,
            },
          }
        : {}),
      ...(meshyCredits > 0 || meshyEstimatedUsd > 0
        ? {
            meshy: {
              credits: meshyCredits,
              estimatedUsd: meshyEstimatedUsd,
              confidence: state.sawPartial
                ? ("estimated" as const)
                : ("actual_credits_estimated_usd" as const),
            },
          }
        : {}),
    },
    items: state.items,
    assumptions: {
      pricingVersion: pricing.version,
      meshyCreditUnitCostUsd: pricing.meshyCreditUnitCostUsd,
      geminiPricingSource: pricing.geminiPricingSource,
      meshyPricingSource: pricing.meshyPricingSource,
    },
  };
}

export function summarizeProviderCredits(jobCost: JobCost): {
  meshy: number;
} {
  return {
    meshy: jobCost.providerCreditTotals.meshy,
  };
}

function addGeminiProofItems(
  state: MutableCostState,
  jobData: Record<string, unknown>,
): void {
  const aiGeneration = asRecord(jobData.aiGeneration);
  const provider = asString(aiGeneration?.provider);
  const status = normalizeStatus(asString(aiGeneration?.status) ?? "unknown");

  if (provider !== "vertex-gemini-direct" || status === "STUBBED") {
    return;
  }

  const metadata = asRecord(aiGeneration?.metadata);
  const model = asString(metadata?.model) ?? "gemini-3-pro-image";
  const sourceImagePath = asString(jobData.sourceImagePath);
  const generatedImageRecords = Array.isArray(jobData.generatedImages)
    ? jobData.generatedImages
        .map((entry) => asRecord(entry))
        .filter((entry): entry is Record<string, unknown> =>
          Boolean(asString(entry?.storagePath)),
        )
    : [];
  const generatedImagePath = asString(generatedImageRecords[0]?.storagePath);
  const outputMimeType = asString(metadata?.outputMimeType);
  const proofGenerationCount = Math.max(
    1,
    asNumber(metadata?.proofGenerationCount) ??
      generatedImageRecords.length ??
      1,
  );

  if (!metadata && !generatedImagePath) {
    return;
  }

  state.sawEstimated = true;
  state.items.push(
    {
      phase: "proof_generation",
      provider: "Google Vertex/Gemini",
      modelOrEndpoint: model,
      taskId: "input-image",
      status,
      quantity: proofGenerationCount,
      unit: proofGenerationCount === 1 ? "image" : "images",
      credits: 0,
      estimatedCostUsd: roundMoney(
        pricing.geminiInputImageUsd * proofGenerationCount,
      ),
      confidence: "estimated",
      pricingBasis:
        "Gemini proof-generation input image estimate from the current pricing assumptions.",
      notes: sourceImagePath
        ? `Source image: ${sourceImagePath}. Exact provider token usage is not stored on the job.`
        : "Exact provider token usage is not stored on the job.",
    },
    {
      phase: "proof_generation",
      provider: "Google Vertex/Gemini",
      modelOrEndpoint: model,
      taskId: "output-image",
      status,
      quantity: proofGenerationCount,
      unit: outputMimeType
        ? `${outputMimeType} proof image${proofGenerationCount === 1 ? "" : "s"}`
        : `proof image${proofGenerationCount === 1 ? "" : "s"}`,
      credits: 0,
      estimatedCostUsd: roundMoney(
        pricing.geminiOutputImageUsd * proofGenerationCount,
      ),
      confidence: "estimated",
      pricingBasis:
        "Gemini proof-generation output image estimate from the current pricing assumptions.",
      notes: generatedImagePath
        ? generatedImageRecords.length > 1
          ? `Generated proof 1 of ${generatedImageRecords.length}: ${generatedImagePath}.`
          : `Generated proof: ${generatedImagePath}.`
        : "Generated proof path is not stored on the job.",
    },
    {
      phase: "proof_generation",
      provider: "Google Vertex/Gemini",
      modelOrEndpoint: model,
      taskId: "text-prompt-and-response",
      status,
      quantity: proofGenerationCount,
      unit:
        proofGenerationCount === 1
          ? "estimated text call"
          : "estimated text calls",
      credits: 0,
      estimatedCostUsd: roundMoney(
        pricing.geminiTextAllowanceUsd * proofGenerationCount,
      ),
      confidence: "estimated",
      pricingBasis:
        "Placeholder allowance for prompt text, response text, and possible thinking tokens.",
      notes:
        "Replace this estimate with persisted provider usage or Google Cloud Billing Export reconciliation when available.",
    },
  );
}

// Page-4 scene renders (generateScenePreview): one Vertex edit call per
// attempt, two inline input images (scene plate + concept) per call. Fixture
// renders copy the plate and never call Vertex, so they cost nothing.
function addScenePreviewItems(
  state: MutableCostState,
  jobData: Record<string, unknown>,
): void {
  const scenePreviews = asRecord(jobData.scenePreviews);
  if (!scenePreviews) {
    return;
  }

  for (const [sceneId, rawScene] of Object.entries(scenePreviews)) {
    const scene = asRecord(rawScene);
    if (!scene) {
      continue;
    }
    const attempts = asNumber(scene.attempts) ?? 0;
    if (attempts <= 0 || asString(scene.mode) === "fixture") {
      continue;
    }

    state.sawEstimated = true;
    const status = normalizeStatus(asString(scene.status) ?? "unknown");
    const model = "gemini-3-pro-image";
    const storagePath = asString(scene.storagePath);
    state.items.push(
      {
        phase: "scene_preview",
        provider: "Google Vertex/Gemini",
        modelOrEndpoint: model,
        taskId: `scene-${sceneId}-input-image`,
        status,
        quantity: attempts * 2,
        unit: "images",
        credits: 0,
        estimatedCostUsd: roundMoney(
          pricing.geminiInputImageUsd * attempts * 2,
        ),
        confidence: "estimated",
        pricingBasis:
          "Gemini scene-preview input image estimate (scene plate + concept per render attempt).",
      },
      {
        phase: "scene_preview",
        provider: "Google Vertex/Gemini",
        modelOrEndpoint: model,
        taskId: `scene-${sceneId}-output-image`,
        status,
        quantity: attempts,
        unit: attempts === 1 ? "scene render" : "scene renders",
        credits: 0,
        estimatedCostUsd: roundMoney(pricing.geminiOutputImageUsd * attempts),
        confidence: "estimated",
        pricingBasis:
          "Gemini scene-preview output image estimate from the current pricing assumptions.",
        ...(storagePath ? { notes: `Scene render: ${storagePath}.` } : {}),
      },
      {
        phase: "scene_preview",
        provider: "Google Vertex/Gemini",
        modelOrEndpoint: model,
        taskId: `scene-${sceneId}-text-prompt`,
        status,
        quantity: attempts,
        unit: attempts === 1 ? "estimated text call" : "estimated text calls",
        credits: 0,
        estimatedCostUsd: roundMoney(pricing.geminiTextAllowanceUsd * attempts),
        confidence: "estimated",
        pricingBasis:
          "Placeholder allowance for the scene-preview prompt and response text.",
      },
    );
  }
}

function addCreativeLabItems(
  state: MutableCostState,
  jobData: Record<string, unknown>,
): void {
  const figurineGeneration = asRecord(jobData.figurineGeneration);
  if (
    asString(figurineGeneration?.workflow) === "direct_multi_image_to_3d"
  ) {
    return;
  }
  const modelRows = Array.isArray(jobData.models) ? jobData.models : [];
  const modelRecords = modelRows
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
  const modelRecord =
    modelRecords.find(
      (entry) => asString(entry.workflow) === "creative_lab_figure",
    ) ?? modelRecords[0];

  if (!figurineGeneration && !modelRecord) {
    return;
  }

  const status = normalizeStatus(
    asString(figurineGeneration?.status) ??
      asString(modelRecord?.status) ??
      "unknown",
  );
  const prototypeTaskId =
    asString(figurineGeneration?.prototypeTaskId) ??
    asString(modelRecord?.prototypeTaskId);
  const buildTaskId =
    asString(figurineGeneration?.buildTaskId) ??
    asString(modelRecord?.providerTaskId);
  const generationTotalCredits =
    asNumber(figurineGeneration?.consumedCredits) ??
    asNumber(modelRecord?.consumedCredits);

  const rawPrototypeTask = asRecord(figurineGeneration?.prototypeTask);
  const rawBuildTask = asRecord(figurineGeneration?.buildTask);
  const explicitPrototypeCredits = taskCredits(rawPrototypeTask);
  const explicitBuildCredits = taskCredits(rawBuildTask);

  let prototypeCredits = explicitPrototypeCredits;
  let buildCredits = explicitBuildCredits;
  let usedFallback = false;

  if (prototypeCredits === undefined || buildCredits === undefined) {
    const inferred = inferCreativeLabCredits(generationTotalCredits);
    prototypeCredits ??= inferred.prototypeCredits;
    buildCredits ??= inferred.buildCredits;
    usedFallback = inferred.usedFallback;
  }

  addMeshyItem(state, {
    phase: "figurine_generation",
    modelOrEndpoint: "Creative Lab Figure Prototype",
    taskId: prototypeTaskId,
    status,
    credits: prototypeCredits,
    usedFallback,
    pricingBasis:
      "Meshy Creative Lab Figure Prototype pricing assumption is 6 credits unless stored task metadata says otherwise.",
    notes:
      generationTotalCredits === undefined
        ? "Prototype task-level credits are not stored on this job; using configured fallback credits."
        : "Credits are derived from stored Creative Lab generation metadata.",
  });
  addMeshyItem(state, {
    phase: "figurine_generation",
    modelOrEndpoint: "Creative Lab Figure Build",
    taskId: buildTaskId,
    status,
    credits: buildCredits,
    usedFallback,
    pricingBasis:
      "Meshy Creative Lab Figure Build pricing assumption is 30 credits unless stored task metadata says otherwise.",
    notes:
      generationTotalCredits === undefined
        ? "Build task-level credits are not stored on this job; using configured fallback credits."
        : "GLB remains the canonical upstream preview asset; USD is estimated from credit price.",
  });
}

function addDirectMultiImageItems(
  state: MutableCostState,
  jobData: Record<string, unknown>,
): void {
  const figurineGeneration = asRecord(jobData.figurineGeneration);
  const modelRows = Array.isArray(jobData.models) ? jobData.models : [];
  const modelRecords = modelRows
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
  const modelRecord =
    modelRecords.find(
      (entry) => asString(entry.workflow) === "direct_multi_image_to_3d",
    ) ?? modelRecords.find((entry) => asString(entry.modelTaskId));

  if (
    asString(figurineGeneration?.workflow) !== "direct_multi_image_to_3d" &&
    asString(modelRecord?.workflow) !== "direct_multi_image_to_3d"
  ) {
    return;
  }

  const credits =
    asNumber(figurineGeneration?.consumedCredits) ??
    asNumber(modelRecord?.consumedCredits) ??
    pricing.meshyDirectMultiImageFallbackCredits;
  const usedFallback =
    asNumber(figurineGeneration?.consumedCredits) === undefined &&
    asNumber(modelRecord?.consumedCredits) === undefined;

  addMeshyItem(state, {
    phase: "figurine_generation",
    modelOrEndpoint: "Direct Multi-Image-to-3D",
    taskId:
      asString(figurineGeneration?.modelTaskId) ??
      asString(modelRecord?.modelTaskId) ??
      asString(modelRecord?.providerTaskId),
    status: normalizeStatus(
      asString(figurineGeneration?.status) ??
        asString(modelRecord?.status) ??
        "unknown",
    ),
    credits,
    usedFallback,
    pricingBasis:
      "Meshy direct Multi-Image-to-3D generation is treated as the 30-credit task proven in Experiments 014 and 018a/b unless stored metadata says otherwise.",
    notes:
      "Analyze Printability is free and preview success does not imply print readiness.",
  });
}

function addPrintToolingItems(
  state: MutableCostState,
  jobData: Record<string, unknown>,
): void {
  const tooling = asRecord(jobData.figurinePrintTooling);
  if (!tooling) {
    return;
  }

  addMeshyTaskContainer(state, {
    phase: "assembled_print_tooling",
    container: asRecord(tooling.originalAnalyze),
    modelOrEndpoint: "3D Print Analyze Printability",
    fallbackCredits: pricing.meshyAnalyzeFallbackCredits,
    pricingBasis: "Meshy API pricing: Analyze Printability is free.",
    notes: "Original assembled GLB analysis.",
  });
  addMeshyTaskContainer(state, {
    phase: "assembled_print_tooling",
    container: asRecord(tooling.repair),
    modelOrEndpoint: "3D Print Repair Printability",
    fallbackCredits: pricing.meshyRepairFallbackCredits,
    pricingBasis: "Meshy API pricing: Repair Printability costs 10 credits.",
    notes:
      "Repair output requires operator comparison because it may remove textures.",
  });
  addMeshyTaskContainer(state, {
    phase: "assembled_print_tooling",
    container: asRecord(tooling.repairedAnalyze),
    modelOrEndpoint: "3D Print Analyze Printability",
    fallbackCredits: pricing.meshyAnalyzeFallbackCredits,
    pricingBasis: "Meshy API pricing: Analyze Printability is free.",
    notes: "Repaired GLB follow-up analysis.",
  });
  addMeshyTaskContainer(state, {
    phase: "assembled_print_tooling",
    container: asRecord(tooling.remesh),
    modelOrEndpoint: remeshEndpointName(asRecord(tooling.remesh)),
    fallbackCredits: pricing.meshyRemeshFallbackCredits,
    pricingBasis: "Meshy API pricing: Remesh costs 5 credits.",
    notes:
      "Remesh output still requires Blender or slicer review before checkout eligibility changes.",
  });

  const remeshAnalyzeByFormat = asRecord(tooling.remeshAnalyzeByFormat);
  if (!remeshAnalyzeByFormat) {
    return;
  }
  for (const [format, value] of Object.entries(remeshAnalyzeByFormat)) {
    const container = asRecord(value);
    if (!container || asString(container.status) === "not_run") {
      continue;
    }
    addMeshyTaskContainer(state, {
      phase: "assembled_print_tooling",
      container,
      modelOrEndpoint: "3D Print Analyze Printability",
      fallbackCredits: pricing.meshyAnalyzeFallbackCredits,
      pricingBasis: "Meshy API pricing: Analyze Printability is free.",
      notes: `Remeshed ${format.toUpperCase()} follow-up analysis.`,
    });
  }
}

function addFailedProviderTaskItems(
  state: MutableCostState,
  jobData: Record<string, unknown>,
): void {
  const error = asRecord(jobData.error);
  const providerTask = asRecord(error?.providerTask);
  if (!providerTask) {
    return;
  }
  const taskId = asString(providerTask.taskId);
  if (taskId && state.taskIds.has(taskId)) {
    return;
  }
  const label = asString(providerTask.label) ?? "provider task";
  const credits = asNumber(providerTask.consumedCredits) ?? 0;

  addMeshyItem(state, {
    phase: "figurine_generation",
    modelOrEndpoint: `Failed ${label}`,
    taskId,
    status: normalizeStatus(asString(providerTask.status) ?? "FAILED"),
    credits,
    usedFallback: asNumber(providerTask.consumedCredits) === undefined,
    pricingBasis:
      "Failed Meshy task cost is included when provider task metadata reports consumed credits.",
    notes:
      "This item represents a provider failure path and should be reviewed separately from successful job margin.",
  });
  state.sawPartial = true;
}

function addMeshyTaskContainer(
  state: MutableCostState,
  input: {
    phase: Exclude<JobCostPhase, "proof_generation" | "total">;
    container: Record<string, unknown> | undefined;
    modelOrEndpoint: string;
    fallbackCredits: number;
    pricingBasis: string;
    notes: string;
  },
): void {
  if (!input.container) {
    return;
  }
  const task = asRecord(input.container.task);
  const taskId = asString(input.container.taskId) ?? asString(task?.id);
  const actualCredits = taskCredits(task);
  addMeshyItem(state, {
    phase: input.phase,
    modelOrEndpoint: input.modelOrEndpoint,
    taskId,
    status: normalizeStatus(
      asString(task?.status) ?? asString(input.container.status) ?? "unknown",
    ),
    credits: actualCredits ?? input.fallbackCredits,
    usedFallback: actualCredits === undefined,
    pricingBasis: input.pricingBasis,
    notes: input.notes,
  });
}

function addMeshyItem(
  state: MutableCostState,
  input: {
    phase: Exclude<JobCostPhase, "proof_generation" | "total">;
    modelOrEndpoint: string;
    taskId?: string;
    status: string;
    credits: number;
    usedFallback: boolean;
    pricingBasis: string;
    notes: string;
  },
): void {
  if (input.taskId) {
    if (state.taskIds.has(input.taskId)) {
      return;
    }
    state.taskIds.add(input.taskId);
  }

  const estimatedCostUsd = roundMoney(
    input.credits * pricing.meshyCreditUnitCostUsd,
  );
  const confidence: JobCostConfidence = input.usedFallback
    ? "estimated"
    : estimatedCostUsd === 0
      ? "actual"
      : "actual_credits_estimated_usd";
  if (input.usedFallback || input.status !== "SUCCEEDED") {
    state.sawPartial = true;
  }

  state.items.push({
    phase: input.phase,
    provider: "Meshy",
    modelOrEndpoint: input.modelOrEndpoint,
    ...(input.taskId ? { taskId: input.taskId } : {}),
    status: input.status,
    quantity: 1,
    unit: "task",
    credits: input.credits,
    creditUnitCostUsd: pricing.meshyCreditUnitCostUsd,
    estimatedCostUsd,
    confidence,
    pricingBasis: input.pricingBasis,
    notes: input.notes,
  });
}

function addTotalItems(
  state: MutableCostState,
  totals: {
    meshyCredits: number;
    meshyEstimatedUsd: number;
    geminiEstimatedUsd: number;
  },
): void {
  if (totals.meshyCredits > 0 || totals.meshyEstimatedUsd > 0) {
    state.items.push({
      phase: "total",
      provider: "Meshy",
      modelOrEndpoint: "all Meshy provider tasks",
      status: state.sawPartial ? "PARTIAL" : "SUCCEEDED",
      quantity: 1,
      unit: "job",
      credits: totals.meshyCredits,
      creditUnitCostUsd: pricing.meshyCreditUnitCostUsd,
      estimatedCostUsd: totals.meshyEstimatedUsd,
      confidence: state.sawPartial
        ? "estimated"
        : "actual_credits_estimated_usd",
      pricingBasis:
        "Total Meshy credits from unique stored task IDs converted with the current credit-price assumption.",
      notes:
        "Provider-only estimate; excludes infrastructure, print materials, machine time, labor, payment fees, support, and failed jobs outside this record.",
    });
  }

  if (totals.geminiEstimatedUsd > 0) {
    state.items.push({
      phase: "total",
      provider: "Google Vertex/Gemini",
      modelOrEndpoint: "gemini-3-pro-image",
      status: "SUCCEEDED",
      quantity: 1,
      unit: "proof call",
      credits: 0,
      estimatedCostUsd: totals.geminiEstimatedUsd,
      confidence: "estimated",
      pricingBasis:
        "Approximate Gemini proof generation cost from current configured assumptions.",
      notes: "Use Cloud Billing export for exact production accounting.",
    });
  }

  if (totals.meshyEstimatedUsd > 0 || totals.geminiEstimatedUsd > 0) {
    state.items.push({
      phase: "total",
      provider: "All AI providers",
      modelOrEndpoint: "successful figurine job through print tooling",
      status: state.sawPartial ? "PARTIAL" : "SUCCEEDED",
      quantity: 1,
      unit: "job",
      credits: totals.meshyCredits,
      estimatedCostUsd: roundMoney(
        totals.meshyEstimatedUsd + totals.geminiEstimatedUsd,
      ),
      confidence: "mixed",
      pricingBasis:
        "Meshy actual or assumed credits converted with public credit-price estimate plus approximate Gemini pricing.",
      notes:
        "Provider-only estimate; target selling price still needs print material, failures, labor, fees, support, and margin.",
    });
  }
}

function inferCreativeLabCredits(totalCredits: number | undefined): {
  prototypeCredits: number;
  buildCredits: number;
  usedFallback: boolean;
} {
  if (totalCredits === 0) {
    return { prototypeCredits: 0, buildCredits: 0, usedFallback: false };
  }
  const fallbackPrototype = pricing.meshyCreativeLabPrototypeFallbackCredits;
  const fallbackBuild = pricing.meshyCreativeLabBuildFallbackCredits;
  const fallbackTotal = fallbackPrototype + fallbackBuild;
  if (totalCredits === fallbackTotal) {
    return {
      prototypeCredits: fallbackPrototype,
      buildCredits: fallbackBuild,
      usedFallback: false,
    };
  }
  if (typeof totalCredits === "number" && totalCredits > 0) {
    return {
      prototypeCredits: Math.min(fallbackPrototype, totalCredits),
      buildCredits: Math.max(0, totalCredits - fallbackPrototype),
      usedFallback: false,
    };
  }
  return {
    prototypeCredits: fallbackPrototype,
    buildCredits: fallbackBuild,
    usedFallback: true,
  };
}

function remeshEndpointName(
  container: Record<string, unknown> | undefined,
): string {
  const request = asRecord(container?.request);
  const topology = asString(request?.topology) ?? "quad";
  const targetPolycount = asNumber(request?.targetPolycount) ?? 100_000;
  const targetFormats = Array.isArray(request?.targetFormats)
    ? request.targetFormats.filter(
        (format): format is string => typeof format === "string",
      )
    : ["glb", "stl", "3mf"];
  return `Remesh ${topology} ${targetPolycount} ${targetFormats.join("/")}`;
}

function taskCredits(
  task: Record<string, unknown> | undefined,
): number | undefined {
  return asNumber(task?.consumed_credits) ?? asNumber(task?.consumedCredits);
}

function normalizeStatus(status: string): string {
  const trimmed = status.trim();
  return trimmed ? trimmed.toUpperCase() : "UNKNOWN";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}
