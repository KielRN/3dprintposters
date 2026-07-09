import { FieldValue } from "firebase-admin/firestore";

import { isFigurineStyle } from "./figurineWorkflow.js";

export type FigurineBuildStatus = "queued" | "running" | "ready" | "failed";

export type FigurineBuildRecord = {
  status: FigurineBuildStatus;
  queuedAt?: unknown;
  startedAt?: unknown;
  completedAt?: unknown;
  failedAt?: unknown;
  attempts?: number;
  error?: { message: string; stage: string } | null;
};

function figurineBuildStatus(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const status = (value as { status?: unknown }).status;
  return typeof status === "string" ? status : null;
}

export function jobDataIsFigurine(
  jobData: Record<string, unknown> | undefined,
): boolean {
  return (
    jobData?.productType === "figurine" ||
    (typeof jobData?.selectedStyle === "string" &&
      isFigurineStyle(jobData.selectedStyle))
  );
}

// The trigger writes the doc it watches, so it must gate strictly on the
// transition INTO "queued": echo writes (queued -> running, running -> ready)
// and unrelated job updates while queued must not re-enter the build.
export function shouldRunFigurineBuild(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): boolean {
  if (!after || !jobDataIsFigurine(after)) {
    return false;
  }
  return (
    figurineBuildStatus(after.figurineBuild) === "queued" &&
    figurineBuildStatus(before?.figurineBuild) !== "queued"
  );
}

// Transaction payload claiming queued -> running. This claim is the only
// thing standing between a duplicate Stripe delivery and a double provider
// spend, so it must refuse every non-queued state.
export function claimFigurineBuildUpdate(
  figurineBuild: unknown,
): Record<string, unknown> | null {
  if (figurineBuildStatus(figurineBuild) !== "queued") {
    return null;
  }
  return {
    status: "running",
    startedAt: FieldValue.serverTimestamp(),
  };
}

export function requeueFigurineBuildUpdate(
  figurineBuild: unknown,
): Record<string, unknown> | null {
  if (figurineBuildStatus(figurineBuild) !== "failed") {
    return null;
  }
  const attempts =
    typeof (figurineBuild as { attempts?: unknown }).attempts === "number"
      ? (figurineBuild as { attempts: number }).attempts
      : 0;
  return {
    status: "queued",
    queuedAt: FieldValue.serverTimestamp(),
    attempts: attempts + 1,
    error: null,
  };
}

// Stripe redelivers webhooks. Stamping "queued" over an existing record would
// reset a running/finished build back to queued and double-build, so the
// stamp only applies when no figurineBuild record exists at all.
export function shouldQueueFigurineBuildOnPayment(
  jobData: Record<string, unknown> | undefined,
): boolean {
  if (!jobData || !jobDataIsFigurine(jobData)) {
    return false;
  }
  return jobData.figurineBuild === undefined || jobData.figurineBuild === null;
}
