"use client";

import { getFirebaseClients } from "@/lib/firebase";
import {
  callableErrorMessage,
  callWithTransientRetry,
} from "@/lib/callableRetry";
import {
  AlertCircle,
  Box,
  CheckCircle2,
  Clock3,
  Download,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  Search,
  Wrench,
} from "lucide-react";
import { httpsCallable } from "firebase/functions";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { pipelineStageLabels, pipelineStages, type PipelineStage } from "@/lib/pipeline";
import { normalizeFigurineWorkflowConfigResponse } from "@/lib/figurineWorkflowConfig";

type SupportStatus = "open" | "watching" | "blocked" | "resolved";
type ProductType = "poster" | "figurine";
type IssueType =
  | "failed"
  | "payment"
  | "print_readiness"
  | "cost"
  | "needs_review"
  | "open_support";

type SupportSummary = {
  status: SupportStatus;
  noteCount: number;
  lastNoteAt: string | null;
  lastNotePreview: string | null;
};

type JobCostSummary = {
  status: string | null;
  currency: string;
  providerCostUsd: number | null;
  meshyCredits: number | null;
};

type JobSummary = {
  jobId: string;
  uid: string | null;
  customerName: string | null;
  customerEmail: string | null;
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
  supportSummary: SupportSummary;
  jobCost: JobCostSummary;
  error: { stage: string | null; message: string | null } | null;
  issueTypes: IssueType[];
  pipelineStage: PipelineStage;
  pipelineStageLabel: string;
  createdAt: string | null;
  updatedAt: string | null;
};

type SupportNote = {
  id: string;
  body: string;
  statusChange: SupportStatus | null;
  createdAt: string | null;
  createdByUid: string | null;
  createdByEmail: string | null;
};

type JobDetail = JobSummary & {
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
  assets?: JobAsset[];
  supportNotes: SupportNote[];
};

type JobAsset = {
  label: string;
  category: string;
  ext: string;
  url: string;
};

type ListAdminSupportJobsRequest = {
  productType?: ProductType;
  jobStatus?: string;
  supportStatus?: SupportStatus;
  issueType?: IssueType;
  pipelineStage?: PipelineStage;
  selectedStyle?: string;
  search?: string;
  pageSize?: number;
  cursor?: string;
};

type StyleOption = { id: string; label: string };

type ListAdminSupportJobsResult = {
  items: JobSummary[];
  nextCursor: string | null;
};

type GetAdminSupportJobResult = {
  job: JobDetail;
};

type AddAdminSupportNoteRequest = {
  jobId: string;
  body: string;
  status?: SupportStatus;
};

const supportStatuses: SupportStatus[] = [
  "open",
  "watching",
  "blocked",
  "resolved",
];

const issueTypes: IssueType[] = [
  "failed",
  "payment",
  "print_readiness",
  "cost",
  "needs_review",
  "open_support",
];

function formatDate(value: string | null) {
  if (!value) {
    return "Not recorded";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function formatMoney(value: number | null, currency = "USD") {
  if (typeof value !== "number") {
    return "Unknown";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(value);
}

function label(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "Not recorded";
  }
  return String(value).replaceAll("_", " ");
}

// Human-readable style for a job card: prefer the stored label, fall back to a
// prettified style id, and empty when the job has no style (e.g. posters).
function jobStyleLabel(job: JobSummary): string {
  if (job.selectedStyleLabel) {
    return job.selectedStyleLabel;
  }
  if (job.selectedStyle) {
    return job.selectedStyle.replaceAll("_", " ");
  }
  return "";
}

// Groups job assets by category, preserving the server's ordering (Source,
// Proofs, 3D preview, Print files, Assembly & tooling, Order bundle).
function groupAssets(assets: JobAsset[]): Array<[string, JobAsset[]]> {
  const groups = new Map<string, JobAsset[]>();
  for (const asset of assets) {
    const list = groups.get(asset.category);
    if (list) {
      list.push(asset);
    } else {
      groups.set(asset.category, [asset]);
    }
  }
  return Array.from(groups.entries());
}

function compactRequest(input: ListAdminSupportJobsRequest) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== "" && value != null),
  ) as ListAdminSupportJobsRequest;
}

function statusTone(status: string | null | undefined) {
  if (
    status === "resolved" || status === "paid" || status === "generated" ||
    status === "accepted" || status === "in_production" || status === "shipped" ||
    status === "completed" || status === "3d_ready"
  ) {
    return "border-[var(--teal)]/30 bg-[var(--teal)]/10 text-[var(--teal)]";
  }
  if (
    status === "blocked" || status === "failed" || status === "expired" ||
    status === "rejected_by_operator" || status === "refunded" || status === "canceled"
  ) {
    return "border-[var(--coral)]/30 bg-[var(--coral)]/10 text-[var(--coral)]";
  }
  return "border-[var(--gold)]/30 bg-[var(--gold)]/10 text-[#8a6412]";
}

function hasPreviewPageAssets(job: JobSummary) {
  return (
    job.generatedImageCount > 0 ||
    job.printFileStatus === "generated" ||
    job.figurinePreviewStatus === "preview_ready"
  );
}

function hasPrintReadinessAssets(job: JobSummary) {
  return (
    job.productType === "figurine" &&
    Boolean(
      job.figurinePreviewStatus ||
        job.figurinePrintReadiness ||
        job.figurineAssemblyStatus ||
        job.figurinePrintToolingStatus ||
        job.figurineReviewStatus,
    )
  );
}

export function AdminSupportJobs({ active }: { active: boolean }) {
  const firebaseClients = useMemo(() => getFirebaseClients(), []);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedJob, setSelectedJob] = useState<JobDetail | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [productType, setProductType] = useState<"" | ProductType>("");
  const [jobStatus, setJobStatus] = useState("");
  const [supportStatus, setSupportStatus] = useState<"" | SupportStatus>("");
  const [issueType, setIssueType] = useState<"" | IssueType>("");
  const [pipelineStage, setPipelineStage] = useState<"" | PipelineStage>("");
  const [selectedStyle, setSelectedStyle] = useState("");
  const [styleOptions, setStyleOptions] = useState<StyleOption[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [noteStatus, setNoteStatus] = useState<"" | SupportStatus>("");
  const [fulfillmentBusy, setFulfillmentBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const filterKey = [
    debouncedSearch,
    productType,
    jobStatus,
    supportStatus,
    issueType,
    pipelineStage,
    selectedStyle,
  ].join("|");

  // Debounce the free-text search: customer lookups scan recent jobs and join
  // their orders, so reloading on every keystroke would be needlessly costly.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  async function loadJobs(options: { append?: boolean; cursor?: string } = {}) {
    if (!firebaseClients) {
      setError("Firebase Functions are not configured.");
      return;
    }

    setJobsLoading(true);
    setError("");
    setNotice("");

    try {
      const listJobs = httpsCallable<
        ListAdminSupportJobsRequest,
        ListAdminSupportJobsResult
      >(firebaseClients.functions, "listAdminSupportJobs");
      const request = compactRequest({
        search: debouncedSearch,
        productType: productType || undefined,
        jobStatus: jobStatus.trim() || undefined,
        supportStatus: supportStatus || undefined,
        issueType: issueType || undefined,
        pipelineStage: pipelineStage || undefined,
        selectedStyle: selectedStyle || undefined,
        pageSize: 25,
        cursor: options.cursor,
      });
      const result = await callWithTransientRetry(
        () => listJobs(request),
        {
          onRetry: () => {
            setNotice("Operator console is starting. Retrying...");
          },
        },
      );
      const items = result.data.items ?? [];
      setJobs((currentJobs) => (options.append ? [...currentJobs, ...items] : items));
      setNextCursor(result.data.nextCursor ?? null);
      setNotice("");
      if (!selectedJobId && items[0]) {
        setSelectedJobId(items[0].jobId);
      }
      if (!options.append && selectedJobId && !items.some((job) => job.jobId === selectedJobId)) {
        setSelectedJobId(items[0]?.jobId ?? "");
        setSelectedJob(null);
      }
    } catch (loadError) {
      setError(callableErrorMessage(loadError, "Support jobs did not load."));
    } finally {
      setJobsLoading(false);
    }
  }

  async function loadJob(jobId: string) {
    if (!firebaseClients || !jobId) {
      return null;
    }

    setDetailLoading(true);
    setError("");

    try {
      const getJob = httpsCallable<{ jobId: string }, GetAdminSupportJobResult>(
        firebaseClients.functions,
        "getAdminSupportJob",
      );
      const result = await callWithTransientRetry(() => getJob({ jobId }));
      setSelectedJob(result.data.job);
      setJobs((currentJobs) =>
        currentJobs.map((job) =>
          job.jobId === result.data.job.jobId ? result.data.job : job,
        ),
      );
      return result.data.job;
    } catch (loadError) {
      setError(callableErrorMessage(loadError, "Job detail did not load."));
      return null;
    } finally {
      setDetailLoading(false);
    }
  }

  async function submitNote() {
    if (!firebaseClients || !selectedJobId) {
      return;
    }

    setNoteBusy(true);
    setError("");
    setNotice("");

    try {
      const addNote = httpsCallable<
        AddAdminSupportNoteRequest,
        GetAdminSupportJobResult
      >(firebaseClients.functions, "addAdminSupportNote");
      const result = await addNote({
        jobId: selectedJobId,
        body: noteBody,
        ...(noteStatus ? { status: noteStatus } : {}),
      });
      setSelectedJob(result.data.job);
      setJobs((currentJobs) =>
        currentJobs.map((job) =>
          job.jobId === result.data.job.jobId ? result.data.job : job,
        ),
      );
      setNoteBody("");
      setNoteStatus("");
      setNotice("Support note saved.");
    } catch (noteError) {
      setError(callableErrorMessage(noteError, "Support note did not save."));
    } finally {
      setNoteBusy(false);
    }
  }

  async function refundJob() {
    if (!firebaseClients || !selectedJob) {
      return;
    }
    if (!window.confirm("Refund this job in Stripe? This cannot be undone.")) {
      return;
    }
    setFulfillmentBusy(true);
    setError("");
    setNotice("");
    try {
      const refund = httpsCallable<{ jobId: string }, { refundId: string }>(
        firebaseClients.functions,
        "adminRefundJob",
      );
      await refund({ jobId: selectedJob.jobId });
      setNotice("Refund issued.");
      await loadJob(selectedJob.jobId);
    } catch (refundError) {
      setError(callableErrorMessage(refundError, "Refund failed."));
    } finally {
      setFulfillmentBusy(false);
    }
  }

  async function setFulfillment(action: "complete" | "requeue" | "cancel") {
    if (!firebaseClients || !selectedJob) {
      return;
    }
    setFulfillmentBusy(true);
    setError("");
    setNotice("");
    try {
      const update = httpsCallable<{ jobId: string; action: string }, { ok: boolean }>(
        firebaseClients.functions,
        "adminSetFulfillment",
      );
      await update({ jobId: selectedJob.jobId, action });
      setNotice("Fulfillment updated.");
      await loadJob(selectedJob.jobId);
    } catch (updateError) {
      setError(callableErrorMessage(updateError, "Updating fulfillment failed."));
    } finally {
      setFulfillmentBusy(false);
    }
  }

  useEffect(() => {
    if (active) {
      void loadJobs();
    }
  }, [active, filterKey]);

  useEffect(() => {
    if (active && selectedJobId) {
      void loadJob(selectedJobId);
    }
  }, [active, selectedJobId]);

  useEffect(() => {
    if (!firebaseClients || !active) {
      return;
    }

    let cancelled = false;
    const getWorkflowConfig = httpsCallable<Record<string, never>, unknown>(
      firebaseClients.functions,
      "getAdminFigurineWorkflowConfig",
    );
    void getWorkflowConfig({})
      .then((result) => {
        if (cancelled) {
          return;
        }
        const config = normalizeFigurineWorkflowConfigResponse(result.data);
        setStyleOptions(
          config.styles.map((style) => ({ id: style.id, label: style.label })),
        );
      })
      .catch(() => {
        // Non-fatal: the Style filter simply stays empty if the workflow
        // config cannot be loaded.
      });

    return () => {
      cancelled = true;
    };
  }, [active, firebaseClients]);

  return (
    <section className="grid gap-5">
      <div className="panel rounded-lg p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(180px,1.2fr)_150px_150px_150px_150px_150px_180px_auto]">
          <label className="grid gap-1 text-xs font-bold uppercase text-[var(--muted)]">
            Search
            <div className="relative">
              <Search className="absolute left-3 top-3 text-[var(--muted)]" size={16} aria-hidden="true" />
              <input
                className="text-input pl-9"
                placeholder="Customer, Job ID, or UID"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </label>
          <label className="grid gap-1 text-xs font-bold uppercase text-[var(--muted)]">
            Product
            <select className="text-input" value={productType} onChange={(event) => setProductType(event.target.value as "" | ProductType)}>
              <option value="">All</option>
              <option value="figurine">Figurine</option>
              <option value="poster">Poster</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-bold uppercase text-[var(--muted)]">
            Style
            <select
              className="text-input"
              value={selectedStyle}
              onChange={(event) => setSelectedStyle(event.target.value)}
            >
              <option value="">All styles</option>
              {styleOptions.map((style) => (
                <option value={style.id} key={style.id}>
                  {style.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-bold uppercase text-[var(--muted)]">
            Job status
            <input
              className="text-input"
              placeholder="failed"
              value={jobStatus}
              onChange={(event) => setJobStatus(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs font-bold uppercase text-[var(--muted)]">
            Support
            <select className="text-input" value={supportStatus} onChange={(event) => setSupportStatus(event.target.value as "" | SupportStatus)}>
              <option value="">All</option>
              {supportStatuses.map((status) => (
                <option value={status} key={status}>
                  {label(status)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-bold uppercase text-[var(--muted)]">
            Issue
            <select className="text-input" value={issueType} onChange={(event) => setIssueType(event.target.value as "" | IssueType)}>
              <option value="">All</option>
              {issueTypes.map((issue) => (
                <option value={issue} key={issue}>
                  {label(issue)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-bold uppercase text-[var(--muted)]">
            Pipeline stage
            <select
              className="text-input"
              value={pipelineStage}
              onChange={(event) =>
                setPipelineStage(event.target.value as "" | PipelineStage)
              }
            >
              <option value="">All stages</option>
              {pipelineStages.map((stage) => (
                <option value={stage} key={stage}>
                  {pipelineStageLabels[stage]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button className="secondary-button h-11 min-h-0 w-full px-3" type="button" disabled={jobsLoading} onClick={() => void loadJobs()}>
              {jobsLoading ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
              Refresh
            </button>
          </div>
        </div>
      </div>

      {notice ? (
        <p className="flex items-start gap-2 rounded-lg border border-[var(--teal)]/30 bg-[var(--teal)]/10 px-3 py-2 text-sm font-semibold text-[var(--teal)]">
          <CheckCircle2 className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
          {notice}
        </p>
      ) : null}

      {error ? (
        <p className="flex items-start gap-2 rounded-lg border border-[var(--coral)]/30 bg-[var(--coral)]/10 px-3 py-2 text-sm font-semibold text-[var(--coral)]">
          <AlertCircle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(380px,0.9fr)_minmax(0,1.4fr)]">
        <section className="panel min-h-96 rounded-lg p-3">
          <div className="flex items-center justify-between gap-3 px-2 py-1">
            <h2 className="text-lg font-semibold">Jobs</h2>
            <span className="text-sm font-bold text-[var(--muted)]">{jobs.length}</span>
          </div>
          <div className="mt-3 grid gap-2">
            {jobs.map((job) => (
              <button
                className={`grid gap-2 rounded-lg border p-3 text-left transition ${
                  selectedJobId === job.jobId
                    ? "border-[var(--teal)] bg-[var(--teal)]/10"
                    : "border-black/10 bg-white hover:border-[var(--teal)]/50"
                }`}
                key={job.jobId}
                type="button"
                onClick={() => setSelectedJobId(job.jobId)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">
                      {job.customerName ?? "No customer yet"}
                    </p>
                    <p className="truncate text-xs font-semibold text-[var(--muted)]">
                      {jobStyleLabel(job)
                        ? `${jobStyleLabel(job)} · #${job.jobId.slice(0, 8)}`
                        : `#${job.jobId.slice(0, 8)}`}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-1 text-xs font-black ${statusTone(job.pipelineStage)}`}>
                    {job.pipelineStageLabel}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  <span className="rounded-full bg-black/5 px-2 py-1 text-xs font-bold">{label(job.productType)}</span>
                  <span className="rounded-full bg-black/5 px-2 py-1 text-xs font-bold">{label(job.supportSummary.status)}</span>
                  {job.issueTypes.slice(0, 3).map((issue) => (
                    <span className="rounded-full bg-black/5 px-2 py-1 text-xs font-bold" key={issue}>
                      {label(issue)}
                    </span>
                  ))}
                </div>
                <p className="text-xs font-semibold text-[var(--muted)]">
                  Updated {formatDate(job.updatedAt)}
                </p>
              </button>
            ))}
            {!jobsLoading && jobs.length === 0 ? (
              <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-black/15 text-sm font-bold text-[var(--muted)]">
                No jobs matched
              </div>
            ) : null}
            {jobsLoading ? (
              <div className="flex min-h-24 items-center justify-center gap-3 text-sm font-bold text-[var(--muted)]">
                <Loader2 className="animate-spin" size={18} aria-hidden="true" />
                Loading jobs
              </div>
            ) : null}
            {nextCursor ? (
              <button className="secondary-button" type="button" disabled={jobsLoading} onClick={() => void loadJobs({ append: true, cursor: nextCursor })}>
                Load more
              </button>
            ) : null}
          </div>
        </section>

        <section className="panel min-h-96 rounded-lg p-4">
          {!selectedJob && !detailLoading ? (
            <div className="flex min-h-80 items-center justify-center rounded-lg border border-dashed border-black/15 text-sm font-bold text-[var(--muted)]">
              Select a job
            </div>
          ) : null}
          {detailLoading ? (
            <div className="flex min-h-80 items-center justify-center gap-3 text-sm font-bold text-[var(--muted)]">
              <Loader2 className="animate-spin" size={18} aria-hidden="true" />
              Loading detail
            </div>
          ) : null}
          {selectedJob && !detailLoading ? (
            <div className="grid gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/10 pb-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase text-[var(--muted)]">Selected job</p>
                  <h2 className="mt-1 break-words text-xl font-semibold">
                    {selectedJob.customerName ?? "No customer yet"}
                  </h2>
                  <p className="mt-1 break-all text-sm font-semibold text-[var(--muted)]">#{selectedJob.jobId}</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {hasPreviewPageAssets(selectedJob) ? (
                    <Link
                      className="secondary-button h-10 min-h-0 px-3"
                      href={`/jobs/${selectedJob.jobId}?operator=1`}
                    >
                      <Box size={16} aria-hidden="true" />
                      Preview Page
                    </Link>
                  ) : null}
                  {hasPrintReadinessAssets(selectedJob) ? (
                    <Link
                      className="primary-button h-10 min-h-0 px-3"
                      href={`/jobs/${selectedJob.jobId}/print-readiness?operator=1`}
                    >
                      <Wrench size={16} aria-hidden="true" />
                      Print Readiness
                    </Link>
                  ) : null}
                  <span className={`rounded-full border px-3 py-1 text-sm font-black ${statusTone(selectedJob.supportSummary.status)}`}>
                    {label(selectedJob.supportSummary.status)}
                  </span>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <Metric label="Provider cost" value={formatMoney(selectedJob.jobCost.providerCostUsd, selectedJob.jobCost.currency)} />
                <Metric label="Meshy credits" value={label(selectedJob.jobCost.meshyCredits)} />
                <Metric label="Notes" value={selectedJob.supportSummary.noteCount} />
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <DetailBlock
                  title="Job state"
                  rows={[
                    ["Product", label(selectedJob.productType)],
                    ["Pipeline", selectedJob.pipelineStageLabel],
                    ["Internal status", label(selectedJob.status)],
                    ["Readiness", label(selectedJob.readinessStatus)],
                    ["Print files", label(selectedJob.printFileStatus)],
                    ["Checkout", selectedJob.checkoutEligible === true ? "Eligible" : selectedJob.checkoutReason ?? "Not eligible"],
                    ["Updated", formatDate(selectedJob.updatedAt)],
                  ]}
                />
                <DetailBlock
                  title="Figurine state"
                  rows={[
                    ["Preview", label(selectedJob.figurinePreviewStatus)],
                    ["Print readiness", label(selectedJob.figurinePrintReadiness)],
                    ["Assembly", label(selectedJob.figurineAssemblyStatus)],
                    ["Print tooling", label(selectedJob.figurinePrintToolingStatus)],
                    ["Review", label(selectedJob.figurineReviewStatus)],
                    ["Figurine credits", label(selectedJob.figurineGeneration.consumedCredits)],
                  ]}
                />
                <DetailBlock
                  title="Order"
                  rows={[
                    ["Status", label(selectedJob.order?.status)],
                    ["Payment", label(selectedJob.order?.paymentStatus)],
                    ["Fulfillment", label(selectedJob.order?.fulfillmentStatus)],
                    ["Attempt", label(selectedJob.order?.checkoutAttempt)],
                    ["Price", selectedJob.order?.priceUnitAmount ? formatMoney(selectedJob.order.priceUnitAmount / 100, selectedJob.order.priceCurrency ?? "USD") : "Not recorded"],
                    ["Updated", formatDate(selectedJob.order?.updatedAt ?? null)],
                  ]}
                />
                <DetailBlock
                  title="Audit"
                  rows={[
                    ["AI provider", label(selectedJob.aiGeneration.provider)],
                    ["AI status", label(selectedJob.aiGeneration.status)],
                    ["3D provider", label(selectedJob.figurineGeneration.provider)],
                    ["3D workflow", label(selectedJob.figurineGeneration.workflow)],
                    ["Height provider", label(selectedJob.printFileAudit?.heightProvider)],
                    ["Segmentation", label(selectedJob.printFileAudit?.segmentationStatus)],
                  ]}
                />
              </div>

              {selectedJob.assets && selectedJob.assets.length > 0 ? (
                <div className="grid gap-3 rounded-lg border border-black/10 p-3">
                  <div className="flex items-center gap-2">
                    <Download size={18} className="text-[var(--teal)]" aria-hidden="true" />
                    <h3 className="font-semibold">Assets</h3>
                    <span className="text-sm font-bold text-[var(--muted)]">
                      {selectedJob.assets.length}
                    </span>
                  </div>
                  {groupAssets(selectedJob.assets).map(([category, items]) => (
                    <div className="grid gap-1.5" key={category}>
                      <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
                        {category}
                      </p>
                      {items.map((asset, index) => (
                        <a
                          className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-semibold transition hover:border-[var(--teal)]/50"
                          key={`${category}-${index}`}
                          href={asset.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="shrink-0 rounded bg-black/5 px-1.5 py-0.5 text-xs font-black uppercase tracking-wide">
                              {asset.ext}
                            </span>
                            <span className="truncate">{asset.label}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1 text-[var(--teal)]">
                            <Download size={14} aria-hidden="true" />
                            Download
                          </span>
                        </a>
                      ))}
                    </div>
                  ))}
                </div>
              ) : null}

              {selectedJob.order?.fulfillment ? (
                <div className="mt-4 rounded-lg border border-black/10 p-3">
                  <h3 className="text-sm font-black">Fulfillment</h3>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <dt className="text-[var(--muted)]">Stage</dt>
                    <dd>{label(selectedJob.order.fulfillment.stage)}</dd>
                    <dt className="text-[var(--muted)]">Operator</dt>
                    <dd>{label(selectedJob.order.fulfillment.acceptedByEmail)}</dd>
                    <dt className="text-[var(--muted)]">Sub-state</dt>
                    <dd>{label(selectedJob.order.fulfillment.productionSubState)}</dd>
                    <dt className="text-[var(--muted)]">Tracking</dt>
                    <dd>
                      {selectedJob.order.fulfillment.trackingNumber
                        ? `${selectedJob.order.fulfillment.trackingCarrier ?? ""} ${selectedJob.order.fulfillment.trackingNumber}`
                        : "Not shipped"}
                    </dd>
                    {selectedJob.order.fulfillment.rejectionReason ? (
                      <>
                        <dt className="text-[var(--muted)]">Rejected</dt>
                        <dd>{selectedJob.order.fulfillment.rejectionReason}</dd>
                      </>
                    ) : null}
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {["paid", "accepted", "in_production", "shipped", "completed"].includes(
                      selectedJob.order.fulfillment.stage ?? "",
                    ) ? (
                      <button
                        type="button"
                        disabled={fulfillmentBusy}
                        onClick={() => void refundJob()}
                        className="rounded-lg border border-[var(--coral)] px-3 py-2 text-sm font-black text-[var(--coral)] disabled:opacity-50"
                      >
                        Refund
                      </button>
                    ) : null}
                    {selectedJob.order.fulfillment.stage === "rejected_by_operator" ? (
                      <button
                        type="button"
                        disabled={fulfillmentBusy}
                        onClick={() => void setFulfillment("requeue")}
                        className="rounded-lg border border-[var(--teal)] px-3 py-2 text-sm font-black text-[var(--teal)] disabled:opacity-50"
                      >
                        Re-queue for operator
                      </button>
                    ) : null}
                    {selectedJob.order.fulfillment.stage === "shipped" ? (
                      <button
                        type="button"
                        disabled={fulfillmentBusy}
                        onClick={() => void setFulfillment("complete")}
                        className="rounded-lg border border-[var(--teal)] px-3 py-2 text-sm font-black text-[var(--teal)] disabled:opacity-50"
                      >
                        Mark completed
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {selectedJob.error ? (
                <div className="rounded-lg border border-[var(--coral)]/30 bg-[var(--coral)]/10 p-3 text-sm">
                  <p className="font-black text-[var(--coral)]">{label(selectedJob.error.stage)}</p>
                  <p className="mt-1 font-semibold">{selectedJob.error.message}</p>
                </div>
              ) : null}

              <div className="grid gap-3 rounded-lg border border-black/10 p-3">
                <div className="flex items-center gap-2">
                  <MessageSquarePlus size={18} className="text-[var(--teal)]" aria-hidden="true" />
                  <h3 className="font-semibold">Support note</h3>
                </div>
                <textarea
                  className="min-h-28 rounded-lg border border-black/15 px-3 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-[var(--teal)]/60"
                  value={noteBody}
                  onChange={(event) => setNoteBody(event.target.value)}
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <select className="text-input max-w-52" value={noteStatus} onChange={(event) => setNoteStatus(event.target.value as "" | SupportStatus)}>
                    <option value="">No status change</option>
                    {supportStatuses.map((status) => (
                      <option value={status} key={status}>
                        {label(status)}
                      </option>
                    ))}
                  </select>
                  <button className="primary-button h-11 min-h-0 px-4" type="button" disabled={noteBusy || noteBody.trim().length === 0} onClick={submitNote}>
                    {noteBusy ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <MessageSquarePlus size={16} aria-hidden="true" />}
                    Save note
                  </button>
                </div>
              </div>

              <div className="grid gap-2">
                <h3 className="font-semibold">Recent notes</h3>
                {selectedJob.supportNotes.map((note) => (
                  <article className="rounded-lg border border-black/10 bg-white p-3" key={note.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[var(--muted)]">
                      <span>{note.createdByEmail ?? note.createdByUid ?? "Admin"}</span>
                      <span className="flex items-center gap-1">
                        <Clock3 size={13} aria-hidden="true" />
                        {formatDate(note.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6">{note.body}</p>
                    {note.statusChange ? (
                      <p className="mt-2 text-xs font-black uppercase text-[var(--teal)]">
                        Status: {label(note.statusChange)}
                      </p>
                    ) : null}
                  </article>
                ))}
                {selectedJob.supportNotes.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-black/15 px-3 py-6 text-center text-sm font-bold text-[var(--muted)]">
                    No support notes
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </section>
  );
}

function Metric({ label: metricLabel, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-3">
      <p className="text-xs font-bold uppercase text-[var(--muted)]">{metricLabel}</p>
      <p className="mt-1 break-words text-lg font-black">{value}</p>
    </div>
  );
}

function DetailBlock({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-3">
      <h3 className="font-semibold">{title}</h3>
      <dl className="mt-3 grid gap-2 text-sm">
        {rows.map(([rowLabel, value]) => (
          <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3" key={rowLabel}>
            <dt className="font-bold text-[var(--muted)]">{rowLabel}</dt>
            <dd className="min-w-0 break-words font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

