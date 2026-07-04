export const fulfillmentStages = [
  "paid",
  "accepted",
  "in_production",
  "shipped",
  "completed",
  "rejected_by_operator",
  "refunded",
] as const;

export type FulfillmentStage = (typeof fulfillmentStages)[number];

export const pipelineStages = [
  "draft",
  "generating",
  "preview_ready",
  "2d_approved",
  "3d_ready",
  ...fulfillmentStages,
  "canceled",
  "failed",
] as const;

export type PipelineStage = (typeof pipelineStages)[number];

export const pipelineStageLabels: Record<PipelineStage, string> = {
  draft: "Draft",
  generating: "Generating",
  preview_ready: "Preview Ready",
  "2d_approved": "2D Approved",
  "3d_ready": "3D Ready",
  paid: "Paid",
  accepted: "Accepted",
  in_production: "In Production",
  shipped: "Shipped",
  completed: "Completed",
  rejected_by_operator: "Rejected — needs attention",
  refunded: "Refunded",
  canceled: "Canceled",
  failed: "Failed",
};

const legalTransitions: Record<FulfillmentStage, readonly FulfillmentStage[]> = {
  paid: ["accepted", "refunded"],
  accepted: ["in_production", "rejected_by_operator", "refunded"],
  in_production: ["shipped", "rejected_by_operator", "refunded"],
  shipped: ["completed", "refunded"],
  completed: ["refunded"],
  rejected_by_operator: ["paid", "refunded"],
  refunded: [],
};

export function isFulfillmentStage(value: unknown): value is FulfillmentStage {
  return fulfillmentStages.includes(value as FulfillmentStage);
}

export function isPipelineStage(value: unknown): value is PipelineStage {
  return pipelineStages.includes(value as PipelineStage);
}

export function canTransition(from: unknown, to: unknown): boolean {
  if (!isFulfillmentStage(from) || !isFulfillmentStage(to)) {
    return false;
  }
  return legalTransitions[from].includes(to);
}

export function displayJobId(jobId: string): string {
  return jobId.slice(-5).toUpperCase();
}

const previewStatuses = new Set([
  "preview_ready",
  "needs_review",
  "ready",
  "generated",
]);

type LooseRecord = Record<string, unknown>;

function record(value: unknown): LooseRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as LooseRecord)
    : {};
}

export function derivePipelineStage(input: {
  job: LooseRecord;
  order?: LooseRecord | null;
}): PipelineStage {
  const job = record(input.job);
  const order = record(input.order ?? undefined);

  if (isPipelineStage(job.pipelineStage)) {
    return job.pipelineStage;
  }

  const fulfillment = record(order.fulfillment);
  if (isFulfillmentStage(fulfillment.stage)) {
    return fulfillment.stage;
  }

  if (order.paymentStatus === "paid" || order.status === "paid") {
    return "paid";
  }

  const status = typeof job.status === "string" ? job.status : null;
  if (status === "failed") {
    return "failed";
  }
  if (status === "canceled") {
    return "canceled";
  }

  const threeDReady =
    (job.productType === "poster" && job.printFileStatus === "generated") ||
    (job.productType === "figurine" &&
      record(job.checkoutEligibility).eligible === true);
  if (threeDReady) {
    return "3d_ready";
  }

  if (status === "approved") {
    return "2d_approved";
  }
  if (status && previewStatuses.has(status)) {
    return "preview_ready";
  }
  if (status) {
    return "generating";
  }
  return "draft";
}
