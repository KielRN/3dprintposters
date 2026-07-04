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
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  Search,
  Wrench,
} from "lucide-react";
import { httpsCallable } from "firebase/functions";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
  supportNotes: SupportNote[];
};

type ListAdminSupportJobsRequest = {
  productType?: ProductType;
  jobStatus?: string;
  supportStatus?: SupportStatus;
  issueType?: IssueType;
  search?: string;
  pageSize?: number;
  cursor?: string;
};

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

function compactRequest(input: ListAdminSupportJobsRequest) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== "" && value != null),
  ) as ListAdminSupportJobsRequest;
}

function statusTone(status: string | null | undefined) {
  if (status === "resolved" || status === "paid" || status === "generated") {
    return "border-[var(--teal)]/30 bg-[var(--teal)]/10 text-[var(--teal)]";
  }
  if (status === "blocked" || status === "failed" || status === "expired") {
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
  const [productType, setProductType] = useState<"" | ProductType>("");
  const [jobStatus, setJobStatus] = useState("");
  const [supportStatus, setSupportStatus] = useState<"" | SupportStatus>("");
  const [issueType, setIssueType] = useState<"" | IssueType>("");
  const [jobsLoading, setJobsLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [noteStatus, setNoteStatus] = useState<"" | SupportStatus>("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const filterKey = [
    search,
    productType,
    jobStatus,
    supportStatus,
    issueType,
  ].join("|");

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
        search,
        productType: productType || undefined,
        jobStatus: jobStatus.trim() || undefined,
        supportStatus: supportStatus || undefined,
        issueType: issueType || undefined,
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
      return;
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
    } catch (loadError) {
      setError(callableErrorMessage(loadError, "Job detail did not load."));
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

  return (
    <section className="grid gap-5">
      <div className="panel rounded-lg p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(180px,1.2fr)_150px_150px_150px_180px_auto]">
          <label className="grid gap-1 text-xs font-bold uppercase text-[var(--muted)]">
            Search
            <div className="relative">
              <Search className="absolute left-3 top-3 text-[var(--muted)]" size={16} aria-hidden="true" />
              <input
                className="text-input pl-9"
                placeholder="Job ID or UID"
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
                    <p className="truncate text-sm font-black">{job.jobId}</p>
                    <p className="truncate text-xs font-semibold text-[var(--muted)]">
                      {job.uid ?? "No UID"}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-1 text-xs font-black ${statusTone(job.status)}`}>
                    {label(job.status)}
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
                  <h2 className="mt-1 break-all text-xl font-semibold">{selectedJob.jobId}</h2>
                  <p className="mt-1 break-all text-sm font-semibold text-[var(--muted)]">{selectedJob.uid}</p>
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
                    ["Job", label(selectedJob.status)],
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
