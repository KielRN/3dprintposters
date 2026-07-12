export const manualProofFulfillmentMode = "manual_proof_required" as const;
export const defaultGenerationStaleAfterMs = 11 * 60 * 1000;

export type ManualProofFulfillmentMode = typeof manualProofFulfillmentMode;

export type FallbackEligibility =
  | { eligible: true }
  | { eligible: false; reason: string };

type LooseRecord = Record<string, unknown>;

function record(value: unknown): LooseRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as LooseRecord)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function publicGenerationRecoveryMessage(): string {
  return "Your hero is ready for personal studio review. Our team will evaluate your photo, style, and production path before creation.";
}

export function publicGenerationProgressMessage(stage: string): string {
  if (stage === "job_created") {
    return "Your hero is in the studio queue.";
  }
  if (stage === "proof_generation_started") {
    return "Your hero concept is being shaped.";
  }
  if (stage === "proof_generation_completed") {
    return "Your hero concept is moving into review.";
  }
  if (stage === "meshy_prototype_started") {
    return "Your hero is getting a 3D-ready concept pass.";
  }
  if (stage === "finalized") {
    return "Your hero concept is ready.";
  }
  return "Your hero is moving through the studio.";
}

export function fallbackFigurineCheckoutEligibility(input: {
  jobId: string;
  uid: string;
  jobData: LooseRecord | undefined;
}): FallbackEligibility {
  const jobData = input.jobData;
  if (!jobData) {
    return { eligible: false, reason: "job_missing" };
  }
  if (jobData.uid !== input.uid) {
    return { eligible: false, reason: "owner_mismatch" };
  }
  if (jobData.productType !== "figurine") {
    return { eligible: false, reason: "product_mismatch" };
  }

  const sourceImagePath = stringValue(jobData.sourceImagePath);
  if (
    !sourceImagePath ||
    !sourceImagePath.startsWith(`uploads/${input.uid}/${input.jobId}/`) ||
    !/\.(jpe?g|png)$/i.test(sourceImagePath)
  ) {
    return { eligible: false, reason: "source_image_mismatch" };
  }

  const baseConfig = record(jobData.baseConfig);
  const sign = record(baseConfig.sign);
  if (!stringValue(sign.text)) {
    return { eligible: false, reason: "base_name_required" };
  }

  const generationState = record(jobData.generationState);
  const terminalState = stringValue(generationState.state);
  if (
    jobData.status !== "failed" &&
    terminalState !== "failed" &&
    terminalState !== "stale"
  ) {
    return { eligible: false, reason: "generation_state_active" };
  }

  return { eligible: true };
}

export function timestampMillis(value: unknown): number | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (
    typeof value === "object" &&
    "toMillis" in value &&
    typeof (value as { toMillis: unknown }).toMillis === "function"
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate: unknown }).toDate === "function"
  ) {
    const date = (value as { toDate: () => Date }).toDate();
    return date instanceof Date ? date.getTime() : null;
  }
  return null;
}

export function generationLastProgressMillis(jobData: LooseRecord): number | null {
  const generationState = record(jobData.generationState);
  const aiGeneration = record(jobData.aiGeneration);
  return (
    timestampMillis(generationState.lastProgressAt) ??
    timestampMillis(aiGeneration.startedAt) ??
    timestampMillis(jobData.updatedAt) ??
    timestampMillis(jobData.createdAt)
  );
}

export function shouldMarkGenerationStale(input: {
  jobData: LooseRecord;
  nowMs: number;
  staleAfterMs?: number;
}): boolean {
  if (
    input.jobData.status !== "generating" ||
    input.jobData.productType !== "figurine"
  ) {
    return false;
  }
  const generationState = record(input.jobData.generationState);
  const aiGeneration = record(input.jobData.aiGeneration);
  const state = stringValue(generationState.state);
  const aiStatus = stringValue(aiGeneration.status);
  if (
    state === "ready" ||
    state === "failed" ||
    state === "stale" ||
    aiStatus === "completed" ||
    aiStatus === "failed"
  ) {
    return false;
  }
  const lastProgressMs = generationLastProgressMillis(input.jobData);
  if (lastProgressMs === null) {
    return false;
  }
  return input.nowMs - lastProgressMs > (input.staleAfterMs ?? defaultGenerationStaleAfterMs);
}

export function hasManualProofFulfillmentMode(input: {
  jobData?: LooseRecord | null;
  orderData?: LooseRecord | null;
}): boolean {
  const jobData = record(input.jobData);
  const orderData = record(input.orderData);
  const fulfillment = record(orderData.fulfillment);
  return (
    jobData.fulfillmentMode === manualProofFulfillmentMode ||
    orderData.fulfillmentMode === manualProofFulfillmentMode ||
    fulfillment.productionSubState === manualProofFulfillmentMode
  );
}
