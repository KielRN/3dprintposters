// Pure presentation mapping for job cards and the reveal pages. No Firebase
// imports so the module stays unit-testable.

export type JobChipTone = "moss" | "gold" | "ember" | "coral" | "muted";

export type JobStatusChip = {
  label: string;
  tone: JobChipTone;
  pulse?: boolean;
};

export type JobCardSource = {
  status: string;
  pipelineStage?: string;
  printFileStatus?: string;
  approvedImagePath?: string | null;
  sourceImagePath?: string;
  generatedImages?: Array<{ storagePath?: string; isPlaceholder?: boolean }>;
  baseConfig?: { sign?: { text?: string | null } | null } | null;
  figurineBuild?: { status?: string } | null;
  selectedStyle?: string;
  selectedStyleLabel?: string;
  customerDeleted?: boolean;
  customerDeletedAt?: unknown;
  updatedAt?: { toDate?: () => Date } | null;
};

// Chip table from the storyfront contract, evaluated in order. Post-payment
// build failures intentionally stay "In production": figurineBuild internals
// are operator-only, support handles customer comms. Terminal pre-payment
// states route to studio/support review chips before the approved state.
export function jobStatusChip(job: JobCardSource): JobStatusChip {
  if (job.pipelineStage === "paid") {
    return { label: "In production", tone: "moss" };
  }
  if (job.status === "checkout_created") {
    return { label: "In checkout", tone: "gold" };
  }
  if (job.status === "failed") {
    return { label: "Studio review", tone: "gold" };
  }
  if (job.printFileStatus === "failed") {
    return { label: "Support review", tone: "gold" };
  }
  if (job.status === "approved") {
    return { label: "Ready to order", tone: "moss", pulse: true };
  }
  if (job.status === "preview_ready") {
    return { label: "Concept ready — pick one", tone: "moss" };
  }
  return { label: "In progress", tone: "muted" };
}

// Thumbnail resolution order: approved image, first non-placeholder
// generation, source photo. Placeholders are temporary source-photo proofs
// and must not masquerade as generations.
export function thumbnailPath(job: JobCardSource): string | null {
  if (job.approvedImagePath) {
    return job.approvedImagePath;
  }
  for (const image of job.generatedImages ?? []) {
    if (image?.storagePath && image.isPlaceholder !== true) {
      return image.storagePath;
    }
  }
  return job.sourceImagePath ?? null;
}

export function heroName(job: JobCardSource): string {
  const text = job.baseConfig?.sign?.text;
  return typeof text === "string" && text.trim() ? text.trim() : "your hero";
}
