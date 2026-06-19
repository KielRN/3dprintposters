"use client";

import { getFirebaseClients } from "@/lib/firebase";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileCheck2,
  Loader2,
  PackageCheck,
  Play,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref } from "firebase/storage";
import { FigurineArtifactPreview } from "./PrintFilePreview";

type FigurineAssembly = {
  status?: string;
  assemblyId?: string;
  artifacts?: Record<string, string>;
  metrics?: {
    targetBodyHeightMm?: number;
    scaleFactor?: number;
    assembledExtentsMm?: { x?: number; y?: number; z?: number };
  };
  warnings?: string[];
  error?: { message?: string };
};

type ProviderAsset = {
  kind?: string;
  format?: string;
  storagePath?: string;
};

type PrintToolingStage = {
  printabilityStatus?: string;
  task?: {
    status?: string;
  };
  artifacts?: ProviderAsset[];
};

type FigurinePrintTooling = {
  status?: string;
  originalAnalyze?: PrintToolingStage;
  repairedAnalyze?: PrintToolingStage | null;
  repair?: PrintToolingStage;
  remesh?: PrintToolingStage;
  remeshAnalyzeByFormat?: Record<string, PrintToolingStage>;
  recommendedPath?: string;
  warnings?: string[];
  error?: { message?: string };
};

type FigurineReview = {
  status?: string;
  decision?: string | null;
  notes?: string | null;
};

type JobCost = {
  status?: string;
  currency?: "USD";
  providerCostUsd?: number;
  providerCreditTotals?: {
    meshy?: number;
  };
  items?: Array<{
    phase?: string;
    provider?: string;
    estimatedCostUsd?: number;
  }>;
};

type JobDocument = {
  uid: string;
  productType?: string;
  selectedStyle?: string;
  figurinePreview?: {
    status?: string;
    previewGlb?: string;
    printReadiness?: string;
  } | null;
  baseConfig?: {
    baseId?: string;
    sign?: {
      enabled?: boolean;
      text?: string | null;
    } | null;
  } | null;
  figurineNamedBase?: {
    status?: string;
    artifacts?: Record<string, string>;
  } | null;
  figurineAssembly?: FigurineAssembly | null;
  figurinePrintTooling?: FigurinePrintTooling | null;
  figurineReview?: FigurineReview | null;
  jobCost?: JobCost | null;
};

type CallableJobRequest = {
  jobId: string;
};

type CallableJobResult = {
  jobId: string;
  status: string;
};

const CALLABLE_TIMEOUT_MS = 540_000;

function labelize(value: string | undefined, fallback: string) {
  return value ? value.replaceAll("_", " ") : fallback;
}

function formatNumber(value: number | undefined, digits = 2) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(digits)
    : "Pending";
}

function formatMoney(value: number | undefined, currency = "USD") {
  return typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", {
        currency,
        style: "currency",
      }).format(value)
    : "Pending";
}

function totalProviderCostUsd(jobCost: JobCost | null | undefined) {
  if (
    typeof jobCost?.providerCostUsd === "number" &&
    Number.isFinite(jobCost.providerCostUsd)
  ) {
    return jobCost.providerCostUsd;
  }

  const totalItem = jobCost?.items?.find(
    (item) => item.phase === "total" && item.provider === "All AI providers",
  );
  return typeof totalItem?.estimatedCostUsd === "number" &&
    Number.isFinite(totalItem.estimatedCostUsd)
    ? totalItem.estimatedCostUsd
    : undefined;
}

function modelAsset(
  stage: PrintToolingStage | undefined,
  format: "glb" | "stl",
) {
  return stage?.artifacts?.find(
    (asset) => asset.kind === "model" && asset.format === format && asset.storagePath,
  );
}

function analyzeStatus(stage: PrintToolingStage | undefined | null) {
  return (
    stage?.printabilityStatus ??
    stage?.task?.status ??
    "not_run"
  );
}

export function FigurinePrintReadinessReview({ jobId }: { jobId: string }) {
  const firebaseClients = useMemo(() => getFirebaseClients(), []);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(firebaseClients));
  const [job, setJob] = useState<JobDocument | null>(null);
  const [jobLoading, setJobLoading] = useState(Boolean(firebaseClients));
  const [artifactUrls, setArtifactUrls] = useState<Record<string, string>>({});
  const [busyAction, setBusyAction] = useState<"assemble" | "tooling" | null>(
    null,
  );
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const assembly = job?.figurineAssembly ?? null;
  const tooling = job?.figurinePrintTooling ?? null;
  const providerCostUsd = totalProviderCostUsd(job?.jobCost);
  const meshyCredits = job?.jobCost?.providerCreditTotals?.meshy;
  const previewReady =
    job?.figurinePreview?.status === "preview_ready" &&
    Boolean(job.figurinePreview.previewGlb);
  const namedBaseReady =
    job?.figurineNamedBase?.status === "generated" &&
    Boolean(job.figurineNamedBase.artifacts?.stl);
  const canAssemble = previewReady && namedBaseReady && busyAction === null;
  const canRunTooling =
    assembly?.status === "assembled" &&
    Boolean(assembly.artifacts?.assembledPreviewGlb) &&
    busyAction === null;

  const repairedGlb = modelAsset(tooling?.repair, "glb");
  const remeshedGlb = modelAsset(tooling?.remesh, "glb");
  const remeshedStl = modelAsset(tooling?.remesh, "stl");
  const artifactPaths = useMemo(
    () =>
      Array.from(
        new Set(
          [
            assembly?.artifacts?.assembledPreviewGlb,
            repairedGlb?.storagePath,
            remeshedGlb?.storagePath,
          ].filter((path): path is string => Boolean(path)),
        ),
      ),
    [
      assembly?.artifacts?.assembledPreviewGlb,
      repairedGlb?.storagePath,
      remeshedGlb?.storagePath,
    ],
  );

  useEffect(() => {
    if (!firebaseClients) {
      setAuthLoading(false);
      setJobLoading(false);
      return;
    }

    return onAuthStateChanged(firebaseClients.auth, (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
    });
  }, [firebaseClients]);

  useEffect(() => {
    if (!firebaseClients || !user) {
      return;
    }

    setJobLoading(true);
    setError("");
    return onSnapshot(
      doc(firebaseClients.firestore, "jobs", jobId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setJob(null);
          setError("Job not found for this signed-in account.");
          setJobLoading(false);
          return;
        }
        setJob(snapshot.data() as JobDocument);
        setJobLoading(false);
      },
      (snapshotError) => {
        setError(snapshotError.message);
        setJobLoading(false);
      },
    );
  }, [firebaseClients, jobId, user]);

  useEffect(() => {
    if (!firebaseClients || artifactPaths.length === 0) {
      setArtifactUrls({});
      return;
    }

    let cancelled = false;
    void Promise.all(
      artifactPaths.map(async (path) => {
        const url = await getDownloadURL(ref(firebaseClients.storage, path));
        return [path, url] as const;
      }),
    )
      .then((entries) => {
        if (!cancelled) {
          setArtifactUrls(Object.fromEntries(entries));
        }
      })
      .catch((downloadError) => {
        if (!cancelled) {
          setError(
            downloadError instanceof Error
              ? downloadError.message
              : "Could not load model artifacts.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [artifactPaths, firebaseClients]);

  async function callJobFunction(
    name: "generateFigurineAssembly" | "runFigurinePrintTooling",
    action: "assemble" | "tooling",
  ) {
    if (!firebaseClients) {
      setError("Firebase Functions are not configured yet.");
      return;
    }

    setBusyAction(action);
    setNotice("");
    setError("");

    try {
      const callable = httpsCallable<CallableJobRequest, CallableJobResult>(
        firebaseClients.functions,
        name,
        { timeout: CALLABLE_TIMEOUT_MS },
      );
      const result = await callable({ jobId });
      setNotice(
        result.data.status === "assembled"
          ? "Assembled package is ready for print-tooling review."
          : "Print tooling completed. Review the provider outputs before changing checkout eligibility.",
      );
    } catch (callError) {
      setError(
        callError instanceof Error
          ? callError.message
          : "Print-readiness action failed.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="panel min-w-0 rounded-lg p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            className="inline-flex items-center gap-2 text-sm font-bold text-[var(--muted)]"
            href={`/jobs/${jobId}`}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Job preview
          </Link>
          <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">
            Figurine print readiness
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            Review assembled body/base artifacts and provider print-tooling output.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="secondary-button"
            disabled={!canAssemble}
            onClick={() => callJobFunction("generateFigurineAssembly", "assemble")}
            type="button"
          >
            {busyAction === "assemble" ? (
              <Loader2 className="animate-spin" size={18} aria-hidden="true" />
            ) : (
              <PackageCheck size={18} aria-hidden="true" />
            )}
            Assemble package
          </button>
          <button
            className="primary-button"
            disabled={!canRunTooling}
            onClick={() => callJobFunction("runFigurinePrintTooling", "tooling")}
            type="button"
          >
            {busyAction === "tooling" ? (
              <Loader2 className="animate-spin" size={18} aria-hidden="true" />
            ) : (
              <Play size={18} aria-hidden="true" />
            )}
            Run print tooling
          </button>
        </div>
      </div>

      {!firebaseClients ? (
        <p className="mt-5 rounded-lg border border-[var(--coral)]/30 bg-[var(--coral)]/10 px-3 py-2 text-sm font-semibold text-[var(--coral)]">
          Add Firebase web env values in{" "}
          <code className="break-all">apps/web/.env.local</code>.
        </p>
      ) : null}

      {notice ? (
        <p className="mt-5 flex items-start gap-2 rounded-lg border border-[var(--teal)]/30 bg-[var(--teal)]/10 px-3 py-2 text-sm font-semibold text-[var(--teal)]">
          <CheckCircle2 className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
          {notice}
        </p>
      ) : null}

      {error ? (
        <p className="mt-5 flex items-start gap-2 rounded-lg border border-[var(--coral)]/30 bg-[var(--coral)]/10 px-3 py-2 text-sm font-semibold text-[var(--coral)]">
          <AlertCircle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 rounded-lg border border-black/10 bg-black/[0.025] p-4 text-sm sm:grid-cols-5">
        <div>
          <p className="text-[var(--muted)]">Preview GLB</p>
          <strong>{previewReady ? "Ready" : "Missing"}</strong>
        </div>
        <div>
          <p className="text-[var(--muted)]">Named base</p>
          <strong>{namedBaseReady ? "Ready" : "Missing"}</strong>
        </div>
        <div>
          <p className="text-[var(--muted)]">Assembly</p>
          <strong>{labelize(assembly?.status, "Not started")}</strong>
        </div>
        <div>
          <p className="text-[var(--muted)]">Tooling</p>
          <strong>{labelize(tooling?.status, "Not started")}</strong>
        </div>
        <div>
          <p className="text-[var(--muted)]">Approx. provider cost</p>
          <strong>{formatMoney(providerCostUsd, job?.jobCost?.currency)}</strong>
          {typeof meshyCredits === "number" && meshyCredits > 0 ? (
            <p className="mt-1 text-xs text-[var(--muted)]">
              {meshyCredits} Meshy credits
            </p>
          ) : null}
        </div>
      </div>

      {authLoading || jobLoading ? (
        <div className="mt-8 flex min-h-60 items-center justify-center gap-3 rounded-lg border border-black/10 bg-white text-sm font-bold text-[var(--muted)]">
          <RefreshCw className="animate-spin" size={18} aria-hidden="true" />
          Loading print-readiness state
        </div>
      ) : null}

      {!authLoading && !user ? (
        <div className="mt-8 rounded-lg border border-black/10 bg-white p-5">
          <p className="font-bold">Sign in to view this job.</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Use the same account or guest session that created the upload.
          </p>
        </div>
      ) : null}

      {assembly?.error?.message || tooling?.error?.message ? (
        <p className="mt-6 flex items-start gap-2 rounded-lg border border-[var(--coral)]/30 bg-[var(--coral)]/10 px-3 py-2 text-sm font-semibold text-[var(--coral)]">
          <TriangleAlert className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
          {assembly?.error?.message ?? tooling?.error?.message}
        </p>
      ) : null}

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <FigurineArtifactPreview
          artifactLabel="assembled GLB"
          details={[
            {
              label: "Body height",
              value: `${formatNumber(assembly?.metrics?.targetBodyHeightMm, 1)}mm`,
            },
            {
              label: "Scale factor",
              value: formatNumber(assembly?.metrics?.scaleFactor, 4),
            },
          ]}
          previewUrl={
            assembly?.artifacts?.assembledPreviewGlb
              ? artifactUrls[assembly.artifacts.assembledPreviewGlb]
              : undefined
          }
          modelOrientation="print-z-up"
          status={assembly?.status}
          title="Assembled original"
        />
        <FigurineArtifactPreview
          artifactLabel="repaired GLB"
          details={[
            {
              label: "Analysis",
              value: labelize(analyzeStatus(tooling?.repairedAnalyze), "Not run"),
            },
            {
              label: "Repair task",
              value: labelize(tooling?.repair?.task?.status, "Not run"),
            },
          ]}
          previewUrl={
            repairedGlb?.storagePath ? artifactUrls[repairedGlb.storagePath] : undefined
          }
          modelOrientation="print-z-up"
          status={tooling?.repair?.task?.status}
          title="Meshy repair"
        />
        <FigurineArtifactPreview
          artifactLabel="remeshed GLB"
          details={[
            {
              label: "GLB analysis",
              value: labelize(
                analyzeStatus(tooling?.remeshAnalyzeByFormat?.glb),
                "Not run",
              ),
            },
            {
              label: "STL output",
              value: remeshedStl?.storagePath ? "Stored" : "Pending",
            },
          ]}
          previewUrl={
            remeshedGlb?.storagePath ? artifactUrls[remeshedGlb.storagePath] : undefined
          }
          modelOrientation="print-z-up"
          status={tooling?.remesh?.task?.status}
          title="Meshy remesh"
        />
      </div>

      <div className="mt-6 grid gap-4 rounded-lg border border-black/10 bg-white p-4 text-sm sm:grid-cols-3">
        <div>
          <p className="text-[var(--muted)]">Original analysis</p>
          <strong>{labelize(analyzeStatus(tooling?.originalAnalyze), "Not run")}</strong>
        </div>
        <div>
          <p className="text-[var(--muted)]">Recommendation</p>
          <strong>{labelize(tooling?.recommendedPath, "Undecided")}</strong>
        </div>
        <div>
          <p className="text-[var(--muted)]">Review decision</p>
          <strong>{labelize(job?.figurineReview?.decision ?? undefined, "Needs review")}</strong>
        </div>
        {[...(assembly?.warnings ?? []), ...(tooling?.warnings ?? [])].map((warning) => (
          <p
            className="rounded-lg border border-[var(--gold)]/30 bg-[var(--gold)]/10 px-3 py-2 font-semibold text-[var(--ink)] sm:col-span-3"
            key={warning}
          >
            <FileCheck2 className="mr-2 inline" size={16} aria-hidden="true" />
            {warning}
          </p>
        ))}
      </div>
    </section>
  );
}
