import {
  derivePipelineStage,
  pipelineStageLabels,
  type PipelineStage,
} from "./pipeline.js";

export const adminSupportStatuses = [
  "open",
  "watching",
  "blocked",
  "resolved",
] as const;

export const adminSupportIssueTypes = [
  "failed",
  "payment",
  "print_readiness",
  "cost",
  "needs_review",
  "open_support",
] as const;

export type AdminSupportStatus = (typeof adminSupportStatuses)[number];
export type AdminSupportIssueType = (typeof adminSupportIssueTypes)[number];

export type AdminSupportPrincipal = {
  uid: string;
  email: string | null;
};

export type AdminSupportFilters = {
  productType?: "poster" | "figurine";
  jobStatus?: string;
  supportStatus?: AdminSupportStatus;
  issueType?: AdminSupportIssueType;
  pipelineStage?: PipelineStage;
};

export type AdminSupportJobSummary = {
  jobId: string;
  uid: string | null;
  productType: string | null;
  status: string | null;
  selectedStyle: string | null;
  selectedStyleLabel: string | null;
  readinessStatus: string | null;
  printFileStatus: string | null;
  figurinePreviewStatus: string | null;
  figurinePrintReadiness: string | null;
  figurineAssemblyStatus: string | null;
  figurinePrintToolingStatus: string | null;
  figurineReviewStatus: string | null;
  checkoutEligible: boolean | null;
  checkoutReason: string | null;
  generatedImageCount: number;
  supportSummary: {
    status: AdminSupportStatus;
    noteCount: number;
    lastNoteAt: string | null;
    lastNotePreview: string | null;
  };
  jobCost: {
    status: string | null;
    currency: string;
    providerCostUsd: number | null;
    meshyCredits: number | null;
  };
  error: {
    stage: string | null;
    message: string | null;
  } | null;
  issueTypes: AdminSupportIssueType[];
  pipelineStage: PipelineStage;
  pipelineStageLabel: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AdminSupportNote = {
  id: string;
  body: string;
  statusChange: AdminSupportStatus | null;
  createdAt: string | null;
  createdByUid: string | null;
  createdByEmail: string | null;
};

export type AdminSupportJobDetail = AdminSupportJobSummary & {
  order: {
    status: string | null;
    paymentStatus: string | null;
    fulfillmentStatus: string | null;
    checkoutAttempt: number | null;
    priceCurrency: string | null;
    priceUnitAmount: number | null;
    updatedAt: string | null;
    createdAt: string | null;
    customerName: string | null;
    shippingAddress: Record<string, string | null> | null;
    paintOption: string | null;
    fulfillment: {
      stage: string | null;
      productionSubState: string | null;
      acceptedByEmail: string | null;
      trackingCarrier: string | null;
      trackingNumber: string | null;
      rejectionReason: string | null;
      history: Array<{ stage: string | null; at: string | null; by: string | null; note: string | null }>;
    } | null;
  } | null;
  aiGeneration: {
    provider: string | null;
    status: string | null;
    completedAt: string | null;
    failedAt: string | null;
  };
  figurineGeneration: {
    provider: string | null;
    workflow: string | null;
    status: string | null;
    consumedCredits: number | null;
  };
  printFileGeneration: {
    provider: string | null;
    status: string | null;
    completedAt: string | null;
  };
  printFileAudit: {
    status: string | null;
    heightProvider: string | null;
    segmentationStatus: string | null;
    geometryAnalysisWidthPx: number | null;
    capturedAt: string | null;
  } | null;
  artifactSummary: {
    proofCount: number;
    printFileArtifactCount: number;
    figurineArtifactCount: number;
  };
  supportNotes: AdminSupportNote[];
};

type Allowlist = {
  emails: Set<string>;
  uids: Set<string>;
};

const adminSupportDevelopmentProjectIds = new Set([
  "dev",
  "gen-lang-client-0675309660",
]);
const truthyDevBypassValues = new Set(["1", "true", "yes", "on"]);

function firebaseConfigProjectId(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as { projectId?: unknown };
    return typeof parsed.projectId === "string" ? parsed.projectId : null;
  } catch {
    return null;
  }
}

export function adminSupportDevelopmentAccessReason(
  env: Record<string, string | undefined>,
): string | null {
  const explicitBypass = env.ADMIN_SUPPORT_DEV_BYPASS?.trim().toLowerCase();
  if (explicitBypass && truthyDevBypassValues.has(explicitBypass)) {
    return "explicit_dev_bypass";
  }

  if (env.FUNCTIONS_EMULATOR === "true") {
    return "functions_emulator";
  }

  const projectId =
    env.GCLOUD_PROJECT ||
    env.GCP_PROJECT ||
    env.GOOGLE_CLOUD_PROJECT ||
    firebaseConfigProjectId(env.FIREBASE_CONFIG);
  return projectId && adminSupportDevelopmentProjectIds.has(projectId)
    ? "dev_project"
    : null;
}

export function parseAdminSupportAllowlist(rawAllowlist: string): Allowlist {
  const emails = new Set<string>();
  const uids = new Set<string>();

  for (const entry of rawAllowlist
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)) {
    if (entry.includes("@")) {
      emails.add(entry.toLowerCase());
    } else {
      uids.add(entry);
    }
  }

  return { emails, uids };
}

export function isAdminSupportAllowed(input: {
  allowlist: string;
  principal: AdminSupportPrincipal;
}): boolean {
  const allowlist = parseAdminSupportAllowlist(input.allowlist);
  return (
    allowlist.uids.has(input.principal.uid) ||
    (input.principal.email
      ? allowlist.emails.has(input.principal.email.toLowerCase())
      : false)
  );
}

export function normalizeAdminSupportStatus(
  value: unknown,
): AdminSupportStatus | null {
  return adminSupportStatuses.includes(value as AdminSupportStatus)
    ? (value as AdminSupportStatus)
    : null;
}

export function normalizeAdminSupportNoteBody(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const body = value.trim().replace(/\s+\n/g, "\n").slice(0, 2000);
  return body.length > 0 ? body : null;
}

export function sanitizeAdminSupportJobSummary(input: {
  jobId: string;
  jobData: Record<string, unknown>;
}): AdminSupportJobSummary {
  const jobData = input.jobData;
  const supportSummary = asRecord(jobData.supportSummary);
  const jobCost = asRecord(jobData.jobCost);
  const checkoutEligibility = asRecord(jobData.checkoutEligibility);
  const figurinePreview = asRecord(jobData.figurinePreview);
  const figurineAssembly = asRecord(jobData.figurineAssembly);
  const figurinePrintTooling = asRecord(jobData.figurinePrintTooling);
  const figurineReview = asRecord(jobData.figurineReview);
  const error = summarizeError(jobData.error);
  const pipelineStage = derivePipelineStage({ job: jobData });
  const summary: AdminSupportJobSummary = {
    jobId: input.jobId,
    uid: asString(jobData.uid),
    productType: asString(jobData.productType),
    status: asString(jobData.status),
    selectedStyle: asString(jobData.selectedStyle),
    selectedStyleLabel: asString(jobData.selectedStyleLabel),
    readinessStatus: asString(jobData.readinessStatus),
    printFileStatus: asString(jobData.printFileStatus),
    figurinePreviewStatus: asString(figurinePreview?.status),
    figurinePrintReadiness: asString(figurinePreview?.printReadiness),
    figurineAssemblyStatus: asString(figurineAssembly?.status),
    figurinePrintToolingStatus: asString(figurinePrintTooling?.status),
    figurineReviewStatus: asString(figurineReview?.status),
    checkoutEligible:
      typeof checkoutEligibility?.eligible === "boolean"
        ? checkoutEligibility.eligible
        : null,
    checkoutReason: asString(checkoutEligibility?.reason),
    generatedImageCount: Array.isArray(jobData.generatedImages)
      ? jobData.generatedImages.length
      : 0,
    supportSummary: {
      status: normalizeAdminSupportStatus(supportSummary?.status) ?? "open",
      noteCount: asNumber(supportSummary?.noteCount) ?? 0,
      lastNoteAt: toIsoString(supportSummary?.lastNoteAt),
      lastNotePreview: asString(supportSummary?.lastNotePreview),
    },
    jobCost: {
      status: asString(jobCost?.status),
      currency: asString(jobCost?.currency) ?? "USD",
      providerCostUsd: asNumber(jobCost?.providerCostUsd),
      meshyCredits: asNumber(asRecord(jobCost?.providerCreditTotals)?.meshy),
    },
    error,
    issueTypes: [],
    pipelineStage,
    pipelineStageLabel: pipelineStageLabels[pipelineStage],
    createdAt: toIsoString(jobData.createdAt),
    updatedAt: toIsoString(jobData.updatedAt),
  };
  summary.issueTypes = issueTypesForSummary(summary);
  return summary;
}

export function sanitizeAdminSupportJobDetail(input: {
  jobId: string;
  jobData: Record<string, unknown>;
  orderData?: Record<string, unknown> | null;
  printFileAuditData?: Record<string, unknown> | null;
  supportNotes: Array<{ id: string; data: Record<string, unknown> }>;
}): AdminSupportJobDetail {
  const summary = sanitizeAdminSupportJobSummary({
    jobId: input.jobId,
    jobData: input.jobData,
  });
  const aiGeneration = asRecord(input.jobData.aiGeneration);
  const figurineGeneration = asRecord(input.jobData.figurineGeneration);
  const printFileGeneration = asRecord(input.jobData.printFileGeneration);
  const printFileArtifacts = asRecord(input.jobData.printFileArtifacts);
  const figurinePreview = asRecord(input.jobData.figurinePreview);
  const figurineNamedBase = asRecord(input.jobData.figurineNamedBase);
  const figurineAssembly = asRecord(input.jobData.figurineAssembly);
  const figurinePrintTooling = asRecord(input.jobData.figurinePrintTooling);

  return {
    ...summary,
    order: input.orderData ? sanitizeOrder(input.orderData) : null,
    aiGeneration: {
      provider: asString(aiGeneration?.provider),
      status: asString(aiGeneration?.status),
      completedAt: toIsoString(aiGeneration?.completedAt),
      failedAt: toIsoString(aiGeneration?.failedAt),
    },
    figurineGeneration: {
      provider: asString(figurineGeneration?.provider),
      workflow: asString(figurineGeneration?.workflow),
      status: asString(figurineGeneration?.status),
      consumedCredits: asNumber(figurineGeneration?.consumedCredits),
    },
    printFileGeneration: {
      provider: asString(printFileGeneration?.provider),
      status: asString(printFileGeneration?.status),
      completedAt: toIsoString(printFileGeneration?.completedAt),
    },
    printFileAudit: sanitizePrintFileAudit(
      input.printFileAuditData ?? asRecord(input.jobData.printFileAudit) ?? null,
    ),
    artifactSummary: {
      proofCount: summary.generatedImageCount,
      printFileArtifactCount: printFileArtifacts
        ? Object.keys(printFileArtifacts).length
        : 0,
      figurineArtifactCount:
        countRecordKeys(asRecord(figurinePreview?.artifacts)) +
        countRecordKeys(asRecord(figurineNamedBase?.artifacts)) +
        countRecordKeys(asRecord(figurineAssembly?.artifacts)) +
        countRecordKeys(asRecord(figurinePrintTooling?.artifacts)),
    },
    supportNotes: input.supportNotes.map((note) =>
      sanitizeAdminSupportNote({ noteId: note.id, noteData: note.data }),
    ),
  };
}

export function sanitizeAdminSupportNote(input: {
  noteId: string;
  noteData: Record<string, unknown>;
}): AdminSupportNote {
  return {
    id: input.noteId,
    body: normalizeAdminSupportNoteBody(input.noteData.body) ?? "",
    statusChange: normalizeAdminSupportStatus(input.noteData.statusChange),
    createdAt: toIsoString(input.noteData.createdAt),
    createdByUid: asString(input.noteData.createdByUid),
    createdByEmail: asString(input.noteData.createdByEmail),
  };
}

export function jobMatchesAdminSupportFilters(
  summary: AdminSupportJobSummary,
  filters: AdminSupportFilters,
): boolean {
  if (filters.productType && summary.productType !== filters.productType) {
    return false;
  }
  if (filters.jobStatus && summary.status !== filters.jobStatus) {
    return false;
  }
  if (
    filters.supportStatus &&
    summary.supportSummary.status !== filters.supportStatus
  ) {
    return false;
  }
  if (
    filters.issueType &&
    !summary.issueTypes.includes(filters.issueType)
  ) {
    return false;
  }
  if (filters.pipelineStage && summary.pipelineStage !== filters.pipelineStage) {
    return false;
  }
  return true;
}

function sanitizeOrder(orderData: Record<string, unknown>) {
  const priceSnapshot = asRecord(orderData.priceSnapshot);
  const fulfillment = asRecord(orderData.fulfillment);
  const acceptedBy = asRecord(fulfillment?.acceptedBy);
  const tracking = asRecord(fulfillment?.tracking);
  const rejection = asRecord(fulfillment?.rejection);
  const shippingAddress = asRecord(orderData.shippingAddress);
  const historyRaw = Array.isArray(fulfillment?.history) ? fulfillment.history : [];
  return {
    status: asString(orderData.status),
    paymentStatus: asString(orderData.paymentStatus),
    fulfillmentStatus: asString(orderData.fulfillmentStatus),
    checkoutAttempt: asNumber(orderData.checkoutAttempt),
    priceCurrency: asString(priceSnapshot?.currency),
    priceUnitAmount: asNumber(priceSnapshot?.unitAmount),
    updatedAt: toIsoString(orderData.updatedAt),
    createdAt: toIsoString(orderData.createdAt),
    customerName: asString(orderData.customerName),
    shippingAddress: shippingAddress
      ? {
          name: asString(shippingAddress.name),
          line1: asString(shippingAddress.line1),
          line2: asString(shippingAddress.line2),
          city: asString(shippingAddress.city),
          state: asString(shippingAddress.state),
          postalCode: asString(shippingAddress.postalCode),
          country: asString(shippingAddress.country),
        }
      : null,
    paintOption: asString(orderData.paintOption),
    fulfillment: fulfillment
      ? {
          stage: asString(fulfillment.stage),
          productionSubState: asString(fulfillment.productionSubState),
          acceptedByEmail: asString(acceptedBy?.email),
          trackingCarrier: asString(tracking?.carrier),
          trackingNumber: asString(tracking?.number),
          rejectionReason: asString(rejection?.reason),
          history: historyRaw.map((entry) => {
            const item = asRecord(entry as Record<string, unknown>);
            return {
              stage: asString(item?.stage),
              at: toIsoString(item?.at),
              by: asString(item?.by),
              note: asString(item?.note),
            };
          }),
        }
      : null,
  };
}

function sanitizePrintFileAudit(auditData: Record<string, unknown> | null) {
  if (!auditData) {
    return null;
  }
  const segmentationStatus = asRecord(auditData.segmentationStatus);
  return {
    status: asString(auditData.status),
    heightProvider: asString(auditData.heightProvider),
    segmentationStatus: asString(segmentationStatus?.status),
    geometryAnalysisWidthPx: asNumber(auditData.geometryAnalysisWidthPx),
    capturedAt: toIsoString(auditData.capturedAt),
  };
}

function issueTypesForSummary(
  summary: AdminSupportJobSummary,
): AdminSupportIssueType[] {
  const issueTypes = new Set<AdminSupportIssueType>();
  if (summary.status === "failed" || summary.error) {
    issueTypes.add("failed");
  }
  if (
    summary.figurinePrintReadiness === "needs_review" ||
    summary.figurineReviewStatus === "needs_review" ||
    summary.figurineAssemblyStatus === "failed" ||
    summary.figurinePrintToolingStatus === "failed"
  ) {
    issueTypes.add("print_readiness");
  }
  if (
    summary.readinessStatus === "concept_ready" ||
    summary.figurineReviewStatus === "needs_review"
  ) {
    issueTypes.add("needs_review");
  }
  if (
    summary.jobCost.status === "partial" ||
    summary.jobCost.providerCostUsd === null
  ) {
    issueTypes.add("cost");
  }
  if (summary.supportSummary.status !== "resolved") {
    issueTypes.add("open_support");
  }
  return Array.from(issueTypes);
}

function summarizeError(value: unknown): AdminSupportJobSummary["error"] {
  const error = asRecord(value);
  if (!error) {
    return null;
  }
  const providerTask = asRecord(error.providerTask);
  return {
    stage: asString(error.stage),
    message:
      asString(error.message) ??
      asString(providerTask?.taskError) ??
      "Job failed without a stored error message.",
  };
}

function countRecordKeys(value: Record<string, unknown> | undefined): number {
  return value ? Object.keys(value).length : 0;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toIsoString(value: unknown): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    return value;
  }
  if (
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate: unknown }).toDate === "function"
  ) {
    const date = (value as { toDate: () => Date }).toDate();
    return date instanceof Date ? date.toISOString() : null;
  }
  return null;
}
