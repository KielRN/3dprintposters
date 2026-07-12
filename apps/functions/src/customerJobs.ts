import { derivePipelineStage, isFulfillmentStage } from "./pipeline.js";

type LooseRecord = Record<string, unknown>;

function record(value: unknown): LooseRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as LooseRecord)
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

const terminalUnpaidOrderStatuses = new Set([
  "checkout_expired",
  "payment_failed",
  "canceled",
]);

const terminalUnpaidPaymentStatuses = new Set([
  "expired",
  "failed",
  "canceled",
]);

export function isCustomerDeletedJob(jobData: unknown): boolean {
  const job = record(jobData);
  return job.customerDeleted === true || job.customerDeletedAt != null;
}

export function customerJobDeletionBlock(input: {
  jobData: LooseRecord;
  orderData?: LooseRecord | null;
}): string | null {
  const job = record(input.jobData);
  const order = record(input.orderData ?? null);
  const hasOrder =
    Boolean(input.orderData) && Object.keys(order).length > 0;
  const pipelineStage = derivePipelineStage({
    job,
    order: hasOrder ? order : null,
  });

  if (isFulfillmentStage(pipelineStage)) {
    return "Paid orders stay in your account history. Contact support if this hero needs to be removed.";
  }

  const jobStatus = stringValue(job.status);
  const orderStatus = stringValue(order.status);
  const paymentStatus = stringValue(order.paymentStatus);
  if (
    jobStatus === "checkout_created" ||
    orderStatus === "checkout_created" ||
    paymentStatus === "pending"
  ) {
    return "This hero has an active checkout. Let checkout expire before deleting it.";
  }

  if (
    hasOrder &&
    !terminalUnpaidOrderStatuses.has(orderStatus) &&
    !terminalUnpaidPaymentStatuses.has(paymentStatus)
  ) {
    return "This hero has checkout history. Contact support if it needs to be removed.";
  }

  return null;
}
