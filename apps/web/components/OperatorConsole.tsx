"use client";

import { getFirebaseClients } from "@/lib/firebase";
import {
  callableErrorMessage,
  callWithTransientRetry,
} from "@/lib/callableRetry";
import { pipelineStageLabels, type FulfillmentStage } from "@/lib/pipeline";
import { httpsCallable } from "firebase/functions";
import { useEffect, useMemo, useState } from "react";

type OperatorTab = "available" | "mine" | "done";

type OperatorJobSummary = {
  jobId: string;
  displayId: string;
  customerName: string;
  stage: FulfillmentStage;
  productionSubState: "printing" | "painting" | null;
  paintOption: "painted" | "unpainted" | null;
  productType: string | null;
  updatedAt: string | null;
};

type OperatorJobDetail = OperatorJobSummary & {
  shipTo: {
    name: string | null;
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  } | null;
  customerEmail: string | null;
  tracking: { carrier: string | null; number: string | null; at: string | null } | null;
  rejection: { reason: string | null; at: string | null } | null;
  bundle: { status: string; storagePath: string | null; error: string | null };
  history: Array<{ stage: string | null; at: string | null; by: string | null; note: string | null }>;
  previewUrl: string | null;
  bundleUrl: string | null;
  files: Array<{ name: string; url: string | null }>;
};

const tabs: Array<{ id: OperatorTab; label: string }> = [
  { id: "available", label: "Available" },
  { id: "mine", label: "My jobs" },
  { id: "done", label: "Shipped & Done" },
];

function formatWhen(value: string | null) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function stageTone(stage: FulfillmentStage) {
  if (stage === "paid") {
    return "border-[var(--gold)]/40 bg-[var(--gold)]/10 text-[#8a6412]";
  }
  if (stage === "rejected_by_operator" || stage === "refunded") {
    return "border-[var(--coral)]/40 bg-[var(--coral)]/10 text-[var(--coral)]";
  }
  return "border-[var(--teal)]/40 bg-[var(--teal)]/10 text-[var(--teal)]";
}

export function OperatorConsole() {
  const firebaseClients = useMemo(() => getFirebaseClients(), []);
  const [role, setRole] = useState<{ isOperator: boolean } | null>(null);
  const [tab, setTab] = useState<OperatorTab>("available");
  const [jobs, setJobs] = useState<OperatorJobSummary[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [detail, setDetail] = useState<OperatorJobDetail | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");

  useEffect(() => {
    if (!firebaseClients) {
      return;
    }
    const getRole = httpsCallable<Record<string, never>, { isOperator: boolean }>(
      firebaseClients.functions,
      "getConsoleRole",
    );
    callWithTransientRetry(() => getRole({}))
      .then((result) => setRole(result.data))
      .catch(() => setRole({ isOperator: false }));
  }, [firebaseClients]);

  async function loadJobs(nextTab: OperatorTab) {
    if (!firebaseClients) {
      return;
    }
    setListLoading(true);
    setError("");
    try {
      const list = httpsCallable<{ tab: OperatorTab }, { items: OperatorJobSummary[] }>(
        firebaseClients.functions,
        "listOperatorJobs",
      );
      const result = await callWithTransientRetry(() => list({ tab: nextTab }));
      setJobs(result.data.items);
    } catch (listError) {
      setError(callableErrorMessage(listError, "Loading jobs failed."));
    } finally {
      setListLoading(false);
    }
  }

  async function loadDetail(jobId: string) {
    if (!firebaseClients) {
      return;
    }
    setDetailLoading(true);
    setError("");
    try {
      const getJob = httpsCallable<{ jobId: string }, { job: OperatorJobDetail }>(
        firebaseClients.functions,
        "getOperatorJob",
      );
      const result = await callWithTransientRetry(() => getJob({ jobId }));
      setDetail(result.data.job);
    } catch (detailError) {
      setError(callableErrorMessage(detailError, "Loading the job failed."));
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    if (role?.isOperator) {
      void loadJobs(tab);
      setSelectedJobId("");
      setDetail(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, tab]);

  async function runAction(input: Record<string, unknown>, callableName: string) {
    if (!firebaseClients || !detail) {
      return;
    }
    setActionBusy(true);
    setError("");
    try {
      const callable = httpsCallable<Record<string, unknown>, { job: OperatorJobDetail }>(
        firebaseClients.functions,
        callableName,
      );
      const result = await callable({ jobId: detail.jobId, ...input });
      if (result.data?.job) {
        setDetail(result.data.job);
      }
      await loadJobs(tab);
    } catch (actionError) {
      setError(callableErrorMessage(actionError, "The action failed."));
    } finally {
      setActionBusy(false);
    }
  }

  if (role === null) {
    return <section className="panel rounded-lg p-6">Checking access…</section>;
  }
  if (!role.isOperator) {
    return (
      <section className="panel rounded-lg p-6">
        <h1 className="display text-2xl">Print Console</h1>
        <p className="mt-2 text-[var(--muted)]">
          This account is not on the operator allowlist. Contact the site admin.
        </p>
      </section>
    );
  }

  return (
    <section className="panel min-w-0 rounded-lg p-5 sm:p-6">
      <h1 className="display text-2xl">Print Console</h1>
      <div className="mt-4 flex gap-2">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={`rounded-full px-4 py-2 text-sm font-black ${
              tab === entry.id
                ? "bg-[var(--teal)] text-white"
                : "bg-black/5 text-[var(--muted)]"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-[var(--coral)]/40 bg-[var(--coral)]/10 p-3 text-sm font-bold text-[var(--coral)]">
          {error}
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_3fr]">
        <div className="flex flex-col gap-2">
          {listLoading ? <p className="text-sm text-[var(--muted)]">Loading…</p> : null}
          {!listLoading && jobs.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No jobs in this queue.</p>
          ) : null}
          {jobs.map((job) => (
            <button
              key={job.jobId}
              type="button"
              onClick={() => {
                setSelectedJobId(job.jobId);
                void loadDetail(job.jobId);
              }}
              className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-left ${
                selectedJobId === job.jobId
                  ? "border-[var(--teal)] bg-[var(--teal)]/5"
                  : "border-black/10 bg-white"
              }`}
            >
              <span className="min-w-0">
                <span className="font-black">{job.customerName}</span>{" "}
                <span className="text-[var(--muted)]">#{job.displayId}</span>
              </span>
              <span
                className={`shrink-0 rounded-full border px-2 py-1 text-xs font-black ${stageTone(job.stage)}`}
              >
                {pipelineStageLabels[job.stage]}
                {job.productionSubState ? ` · ${job.productionSubState}` : ""}
              </span>
              <span className="shrink-0 text-xs text-[var(--muted)]">
                {formatWhen(job.updatedAt)}
              </span>
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-black/10 p-4">
          {detailLoading ? <p className="text-sm text-[var(--muted)]">Loading job…</p> : null}
          {!detailLoading && !detail ? (
            <p className="text-sm text-[var(--muted)]">Select a job to see details.</p>
          ) : null}
          {detail && !detailLoading ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-black">
                  {detail.customerName} — #{detail.displayId}
                </h2>
                <span
                  className={`rounded-full border px-3 py-1 text-sm font-black ${stageTone(detail.stage)}`}
                >
                  {pipelineStageLabels[detail.stage]}
                </span>
              </div>
              <p className="text-sm text-[var(--muted)]">
                {detail.productType ?? "product"} ·{" "}
                {detail.paintOption === "painted" ? "Painted & finished" : "Unpainted"} ·
                last action {formatWhen(detail.updatedAt)}
              </p>

              {detail.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={detail.previewUrl}
                  alt="Job preview"
                  className="max-h-56 w-fit rounded-lg border border-black/10"
                />
              ) : null}

              {detail.shipTo ? (
                <div className="rounded-lg bg-black/5 p-3 text-sm">
                  <p className="font-black">Ship to</p>
                  <p>{detail.shipTo.name}</p>
                  <p>{detail.shipTo.line1}</p>
                  {detail.shipTo.line2 ? <p>{detail.shipTo.line2}</p> : null}
                  <p>
                    {detail.shipTo.city}, {detail.shipTo.state} {detail.shipTo.postalCode}{" "}
                    {detail.shipTo.country}
                  </p>
                </div>
              ) : null}

              {detail.rejection?.reason ? (
                <p className="rounded-lg border border-[var(--coral)]/40 bg-[var(--coral)]/10 p-3 text-sm">
                  Rejected: {detail.rejection.reason}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {detail.stage === "paid" ? (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void runAction({}, "operatorAcceptJob")}
                    className="rounded-lg bg-[var(--teal)] px-4 py-2 font-black text-white disabled:opacity-50"
                  >
                    {actionBusy ? "Accepting…" : "Accept job"}
                  </button>
                ) : null}

                {detail.stage !== "paid" && detail.bundle.status === "ready" && detail.bundleUrl ? (
                  <a
                    href={detail.bundleUrl}
                    className="rounded-lg border border-[var(--teal)] px-4 py-2 font-black text-[var(--teal)]"
                  >
                    Download print bundle (.zip)
                  </a>
                ) : null}
                {detail.stage !== "paid" && detail.bundle.status === "building" ? (
                  <span className="px-2 py-2 text-sm text-[var(--muted)]">
                    Bundle building — refresh shortly.
                  </span>
                ) : null}
                {detail.stage !== "paid" && detail.bundle.status === "failed" ? (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void loadDetail(detail.jobId)}
                    className="rounded-lg border border-[var(--coral)] px-4 py-2 font-black text-[var(--coral)]"
                  >
                    Bundle failed — use individual files below
                  </button>
                ) : null}

                {detail.stage === "accepted" ? (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() =>
                      void runAction({ action: "start_production" }, "operatorUpdateFulfillment")
                    }
                    className="rounded-lg bg-[var(--teal)] px-4 py-2 font-black text-white disabled:opacity-50"
                  >
                    Start production
                  </button>
                ) : null}

                {detail.stage === "in_production" && detail.paintOption === "painted" ? (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() =>
                      void runAction(
                        {
                          action: "set_production_substate",
                          subState:
                            detail.productionSubState === "painting" ? "printing" : "painting",
                        },
                        "operatorUpdateFulfillment",
                      )
                    }
                    className="rounded-lg border border-[var(--teal)] px-4 py-2 font-black text-[var(--teal)] disabled:opacity-50"
                  >
                    {detail.productionSubState === "painting"
                      ? "Back to printing"
                      : "Move to painting"}
                  </button>
                ) : null}
              </div>

              {detail.stage === "in_production" ? (
                <div className="rounded-lg border border-black/10 p-3">
                  <p className="text-sm font-black">Mark shipped</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      className="rounded-lg border border-black/20 px-3 py-2 text-sm"
                      placeholder="Carrier (USPS, UPS…)"
                      value={carrier}
                      onChange={(event) => setCarrier(event.target.value)}
                    />
                    <input
                      className="rounded-lg border border-black/20 px-3 py-2 text-sm"
                      placeholder="Tracking number"
                      value={trackingNumber}
                      onChange={(event) => setTrackingNumber(event.target.value)}
                    />
                    <button
                      type="button"
                      disabled={actionBusy || carrier.length < 2 || trackingNumber.length < 4}
                      onClick={() =>
                        void runAction(
                          { action: "ship", carrier, trackingNumber },
                          "operatorUpdateFulfillment",
                        )
                      }
                      className="rounded-lg bg-[var(--teal)] px-4 py-2 font-black text-white disabled:opacity-50"
                    >
                      Mark shipped
                    </button>
                  </div>
                </div>
              ) : null}

              {detail.stage === "accepted" || detail.stage === "in_production" ? (
                <div className="rounded-lg border border-black/10 p-3">
                  <p className="text-sm font-black">Reject job</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      className="min-w-64 flex-1 rounded-lg border border-black/20 px-3 py-2 text-sm"
                      placeholder="Reason (required)"
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                    />
                    <button
                      type="button"
                      disabled={actionBusy || rejectReason.trim().length < 5}
                      onClick={() =>
                        void runAction(
                          { action: "reject", reason: rejectReason.trim() },
                          "operatorUpdateFulfillment",
                        )
                      }
                      className="rounded-lg border border-[var(--coral)] px-4 py-2 font-black text-[var(--coral)] disabled:opacity-50"
                    >
                      Reject for printing
                    </button>
                  </div>
                </div>
              ) : null}

              {detail.tracking?.number ? (
                <p className="text-sm">
                  Shipped via {detail.tracking.carrier} — tracking{" "}
                  <span className="font-black">{detail.tracking.number}</span>
                </p>
              ) : null}

              {detail.stage !== "paid" && detail.files.length > 0 ? (
                <details className="rounded-lg border border-black/10 p-3">
                  <summary className="cursor-pointer text-sm font-black">
                    Additional files
                  </summary>
                  <ul className="mt-2 flex flex-col gap-1 text-sm">
                    {detail.files.map((file) => (
                      <li key={file.name}>
                        {file.url ? (
                          <a className="text-[var(--teal)] underline" href={file.url}>
                            {file.name}
                          </a>
                        ) : (
                          <span className="text-[var(--muted)]">{file.name} (unavailable)</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              {detail.history.length > 0 ? (
                <div className="rounded-lg bg-black/5 p-3">
                  <p className="text-sm font-black">History</p>
                  <ul className="mt-1 flex flex-col gap-1 text-xs text-[var(--muted)]">
                    {detail.history.map((entry, index) => (
                      <li key={index}>
                        {formatWhen(entry.at)} — {entry.stage} by {entry.by}
                        {entry.note ? ` — ${entry.note}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
