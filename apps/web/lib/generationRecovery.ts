export const studioReviewMessage =
  "Your hero is ready for personal studio review. Our team will evaluate your photo, style, and production path before creation.";

export function customerSafeGenerationMessage(error: unknown, fallback = studioReviewMessage) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const normalized = message.trim().toLowerCase();
  if (
    !normalized ||
    normalized === "internal" ||
    normalized === "functions/internal" ||
    normalized.includes("internal")
  ) {
    return fallback;
  }
  return message;
}

export function isStudioReviewReadyJob(job: unknown): boolean {
  if (!job || typeof job !== "object" || Array.isArray(job)) {
    return false;
  }
  const data = job as {
    productType?: unknown;
    status?: unknown;
    generationState?: { state?: unknown } | null;
  };
  return (
    data.productType === "figurine" &&
    (data.status === "failed" ||
      data.generationState?.state === "failed" ||
      data.generationState?.state === "stale")
  );
}
