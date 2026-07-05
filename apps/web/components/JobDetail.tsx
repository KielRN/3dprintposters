"use client";

import { getFirebaseClients } from "@/lib/firebase";
import {
  callableErrorMessage,
  callWithTransientRetry,
} from "@/lib/callableRetry";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  Loader2,
  RefreshCw,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref } from "firebase/storage";
import {
  FigurineBaseSignPanel,
  FigurineModelPreview,
  PrintFilePreview,
  PrintFileStatusPanel,
} from "./PrintFilePreview";

type GeneratedImage = {
  id: string;
  label: string;
  storagePath: string;
  status: string;
  isPlaceholder?: boolean;
};

type JobDocument = {
  uid: string;
  productType?: string;
  status: string;
  sourceImagePath: string;
  selectedStyle: string;
  selectedStyleLabel?: string;
  conceptSource?: string;
  generatedImages?: GeneratedImage[];
  approvedImagePath?: string | null;
  figurinePreview?: FigurinePreview | null;
  baseConfig?: FigurineBaseConfig | null;
  figurineNamedBase?: FigurineNamedBase | null;
  printFileStatus?: string;
  printFileArtifacts?: PrintFileArtifacts | null;
  printability?: PrintabilitySummary | null;
  printFileError?: {
    message?: string;
  } | null;
  checkoutEligibility?: {
    eligible?: boolean;
    reason?: string;
  } | null;
};

type FigurineBaseConfig = {
  shape?: string;
  baseId?: string;
  sign?: {
    enabled?: boolean;
    text?: string | null;
  } | null;
};

type FigurineNamedBase = {
  status?: string;
  baseId?: string;
  normalizedName?: string;
  artifacts?: Record<string, string>;
  warnings?: string[];
};

type UpdateFigurineBaseConfigRequest = {
  jobId: string;
  baseShape: "square";
  baseId: "figurine-square-v1";
  signEnabled: boolean;
  signText?: string;
};

type UpdateFigurineBaseConfigResult = {
  jobId: string;
  status: string;
  baseConfig: {
    shape: string;
    baseId: string;
    sign: { enabled: boolean; text: string | null };
  };
  namedBase: {
    baseId: string;
    normalizedName: string;
    outputPrefix: string;
    artifacts: Record<string, string>;
  } | null;
  assembly?: Record<string, unknown>;
};

type GetAdminJobPreviewResult = {
  jobId: string;
  job: JobDocument;
  assetUrls: Record<string, string>;
};

type ApproveGeneratedImageRequest = {
  jobId: string;
  imagePath: string;
};

type ApproveGeneratedImageResult = {
  jobId: string;
  status: string;
  approvedImagePath: string;
  printFileStatus?: string;
  printFileArtifacts?: PrintFileArtifacts;
};

type CreateCheckoutSessionRequest = {
  jobId: string;
  paintOption?: "painted" | "unpainted";
};

type CreateCheckoutSessionResult = {
  orderId: string;
  checkoutUrl: string | null;
};

type PrintFileArtifacts = {
  modelStl?: string;
  heightmapPng?: string;
  previewGlb?: string;
  metadataJson?: string;
  fullColor3mf?: string;
  fullColorObj?: string;
  fullColorObjMtl?: string;
  fullColorTexturePng?: string;
  fullColorVrml?: string;
  fullColorPly?: string;
  filamentPaletteJson?: string;
  filamentLayerSwapsTxt?: string;
  filamentPrintSettingsJson?: string;
  filamentPreviewPng?: string;
  debugArtifacts?: Record<string, string>;
};

type FigurinePreview = {
  previewGlb?: string;
  status?: string;
  printReadiness?: string;
  warnings?: string[];
};

type PrintabilitySummary = {
  status: string;
  checks: string[];
  warnings?: string[];
};

const PRINT_FILE_GENERATION_TIMEOUT_MS = 540_000;
const BASE_SIGN_GENERATION_TIMEOUT_MS = 540_000;

const styleLabels: Record<string, string> = {
  "gallery-relief": "Gallery Relief",
  "anime-poster": "Anime Poster",
  cyberpunk: "Cyberpunk",
  storybook: "Storybook",
  creative_lab_figure: "Creative Lab Figure",
  "creative-lab-figure": "Creative Lab Figure",
  emoji_avatar: "Emoji Avatar",
  chibi_figure: "Chibi",
  heroic_fantasy_male: "Heroic fantasy male",
  bobblehead: "Bobblehead",
  cartoon_figure: "Cartoon Figure",
};

function normalizeGeneratedImages(rawImages: unknown): GeneratedImage[] {
  if (!Array.isArray(rawImages)) {
    return [];
  }

  return rawImages.flatMap((rawImage, index) => {
    if (!rawImage || typeof rawImage !== "object") {
      return [];
    }

    const image = rawImage as Partial<GeneratedImage>;
    if (!image.storagePath) {
      return [];
    }

    return [
      {
        id: image.id ?? `preview-${index + 1}`,
        label: image.label ?? `Preview ${index + 1}`,
        storagePath: image.storagePath,
        status: image.status ?? "ready",
        isPlaceholder: image.isPlaceholder,
      },
    ];
  });
}

function statusCopy(job: JobDocument) {
  if (job.productType === "figurine") {
    if (job.figurinePreview?.printReadiness === "print_ready") {
      return "Print-ready review complete";
    }

    if (job.figurinePreview?.status === "preview_ready") {
      return "Color preview ready";
    }

    return "Figurine preview pending";
  }

  if (job.status === "approved" && job.printFileStatus === "generated") {
    return "3D preview ready";
  }

  if (job.status === "approved" && job.printFileStatus === "generating") {
    return "Generating 3D preview";
  }

  if (job.status === "approved" && job.printFileStatus === "failed") {
    return "3D generation failed";
  }

  if (job.status === "approved") {
    return "Proof approved";
  }

  if (job.status === "preview_ready") {
    return "Ready for approval";
  }

  if (job.status === "checkout_created") {
    return "Checkout started";
  }

  return job.status.replaceAll("_", " ");
}

function signedAssetUrlMap(
  paths: string[],
  assetUrls: Record<string, string>,
) {
  const entries: Array<[string, string]> = [];
  for (const path of paths) {
    const url = assetUrls[path];
    if (url) {
      entries.push([path, url]);
    }
  }
  return Object.fromEntries(entries);
}

export function JobDetail({
  jobId,
  operatorMode = false,
}: {
  jobId: string;
  operatorMode?: boolean;
}) {
  const firebaseClients = useMemo(() => getFirebaseClients(), []);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(firebaseClients));
  const [job, setJob] = useState<JobDocument | null>(null);
  const [jobLoading, setJobLoading] = useState(Boolean(firebaseClients));
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [artifactUrls, setArtifactUrls] = useState<Record<string, string>>({});
  const [operatorAssetUrls, setOperatorAssetUrls] = useState<Record<string, string>>({});
  const [approvalBusyPath, setApprovalBusyPath] = useState("");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [paintOption, setPaintOption] = useState<"painted" | "unpainted">(
    "unpainted",
  );
  const [baseSignBusy, setBaseSignBusy] = useState(false);
  const [baseSignNotice, setBaseSignNotice] = useState("");
  const [baseSignError, setBaseSignError] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const generatedImages = useMemo(
    () => normalizeGeneratedImages(job?.generatedImages),
    [job?.generatedImages],
  );
  const isFigurineJob = job?.productType === "figurine";
  const approvedImagePath = job?.approvedImagePath ?? null;
  const canCheckout = isFigurineJob
    ? job?.status === "approved" && job?.checkoutEligibility?.eligible === true
    : job?.status === "approved" &&
      Boolean(approvedImagePath) &&
      job.printFileStatus === "generated" &&
      Boolean(job.printFileArtifacts?.modelStl) &&
      Boolean(job.printFileArtifacts?.previewGlb);
  const approvedProofUrl = approvedImagePath
    ? imageUrls[approvedImagePath] ?? ""
    : "";
  const printFileArtifacts = job?.printFileArtifacts;
  const previewGlbUrl = printFileArtifacts?.previewGlb
    ? artifactUrls[printFileArtifacts.previewGlb] ?? ""
    : "";
  const heightmapUrl = printFileArtifacts?.heightmapPng
    ? artifactUrls[printFileArtifacts.heightmapPng] ?? ""
    : "";
  const figurinePreviewPath = job?.figurinePreview?.previewGlb;
  const figurinePreviewUrl = figurinePreviewPath
    ? artifactUrls[figurinePreviewPath] ?? ""
    : "";
  const namedBasePreviewPath = job?.figurineNamedBase?.artifacts?.previewGlb;
  const namedBasePreviewUrl = namedBasePreviewPath
    ? artifactUrls[namedBasePreviewPath] ?? ""
    : "";

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
    const checkoutStatus = new URLSearchParams(window.location.search).get(
      "checkout",
    );
    if (checkoutStatus === "cancelled") {
      setNotice("Checkout was cancelled. Your approved proof is still saved.");
    }
  }, []);

  useEffect(() => {
    if (approvalBusyPath && job?.printFileStatus === "generated") {
      setApprovalBusyPath("");
      setNotice("3D relief preview is ready. Checkout is unlocked.");
    }
  }, [approvalBusyPath, job?.printFileStatus]);

  useEffect(() => {
    if (!firebaseClients || !user || !operatorMode) {
      return;
    }

    let cancelled = false;
    setJobLoading(true);
    setError("");

    const getPreview = httpsCallable<
      { jobId: string },
      GetAdminJobPreviewResult
    >(firebaseClients.functions, "getAdminJobPreview");

    void callWithTransientRetry(() => getPreview({ jobId }))
      .then((result) => {
        if (cancelled) {
          return;
        }
        setJob(result.data.job);
        setOperatorAssetUrls(result.data.assetUrls ?? {});
        setJobLoading(false);
      })
      .catch((previewError) => {
        if (cancelled) {
          return;
        }
        setError(
          callableErrorMessage(previewError, "Operator preview did not load."),
        );
        setJob(null);
        setJobLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [firebaseClients, jobId, operatorMode, user]);

  useEffect(() => {
    if (!firebaseClients || !user || operatorMode) {
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
    if (!firebaseClients || !job) {
      return;
    }

    let cancelled = false;
    const paths = Array.from(
      new Set([
        job.sourceImagePath,
        ...generatedImages.map((image) => image.storagePath),
      ]),
    );

    if (operatorMode) {
      setImageUrls(signedAssetUrlMap(paths, operatorAssetUrls));
      return;
    }

    void Promise.all(
      paths.map(async (path) => {
        const url = await getDownloadURL(ref(firebaseClients.storage, path));
        return [path, url] as const;
      }),
    )
      .then((entries) => {
        if (!cancelled) {
          setImageUrls(Object.fromEntries(entries));
        }
      })
      .catch((downloadError) => {
        if (!cancelled) {
          setError(
            downloadError instanceof Error
              ? downloadError.message
              : "Could not load proof images.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [firebaseClients, generatedImages, job, operatorAssetUrls, operatorMode]);

  useEffect(() => {
    const artifacts = job?.printFileArtifacts;
    const figurinePath = job?.figurinePreview?.previewGlb;
    const namedBasePath = job?.figurineNamedBase?.artifacts?.previewGlb;
    if (!firebaseClients || (!artifacts && !figurinePath && !namedBasePath)) {
      setArtifactUrls({});
      return;
    }

    const paths = Array.from(
      new Set(
        [
          artifacts?.previewGlb,
          artifacts?.heightmapPng,
          figurinePath,
          namedBasePath,
        ].filter((path): path is string => Boolean(path)),
      ),
    );

    if (paths.length === 0) {
      setArtifactUrls({});
      return;
    }

    if (operatorMode) {
      setArtifactUrls(signedAssetUrlMap(paths, operatorAssetUrls));
      return;
    }

    let cancelled = false;
    void Promise.all(
      paths.map(async (path) => {
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
              : "Could not load 3D preview.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    firebaseClients,
    job?.figurineNamedBase?.artifacts?.previewGlb,
    job?.figurinePreview?.previewGlb,
    job?.printFileArtifacts,
    operatorAssetUrls,
    operatorMode,
  ]);

  async function approveImage(imagePath: string) {
    if (!firebaseClients) {
      setError("Firebase is not configured for approval yet.");
      return;
    }

    setApprovalBusyPath(imagePath);
    setError("");

    try {
      const approveGeneratedImage = httpsCallable<
        ApproveGeneratedImageRequest,
        ApproveGeneratedImageResult
      >(firebaseClients.functions, "approveGeneratedImage", {
        timeout: PRINT_FILE_GENERATION_TIMEOUT_MS,
      });
      await approveGeneratedImage({ jobId, imagePath });
      setNotice(
        isFigurineJob
          ? "Color figurine preview is ready. Checkout stays locked for print review."
          : "3D relief preview is ready. Checkout is unlocked.",
      );
    } catch (approvalError) {
      setError(
        approvalError instanceof Error
          ? approvalError.message
          : "Approval failed.",
      );
    } finally {
      setApprovalBusyPath("");
    }
  }

  async function saveBaseSign(input: {
    signEnabled: boolean;
    signText: string;
  }) {
    if (!firebaseClients) {
      setBaseSignError("Firebase Functions are not configured yet.");
      return;
    }

    setBaseSignBusy(true);
    setBaseSignError("");
    setBaseSignNotice("");

    try {
      const updateFigurineBaseConfig = httpsCallable<
        UpdateFigurineBaseConfigRequest,
        UpdateFigurineBaseConfigResult
      >(firebaseClients.functions, "updateFigurineBaseConfig", {
        timeout: BASE_SIGN_GENERATION_TIMEOUT_MS,
      });
      const result = await callWithTransientRetry(() =>
        updateFigurineBaseConfig({
          jobId,
          baseShape: "square",
          baseId: "figurine-square-v1",
          signEnabled: input.signEnabled,
          signText: input.signEnabled ? input.signText : undefined,
        }),
      );

      setBaseSignNotice(
        result.data.namedBase
          ? `Base sign "${result.data.namedBase.normalizedName}" was generated and assembled.`
          : "Base saved without a name sign.",
      );
    } catch (baseSignSaveError) {
      setBaseSignError(
        callableErrorMessage(baseSignSaveError, "Saving the base sign failed."),
      );
    } finally {
      setBaseSignBusy(false);
    }
  }

  async function startCheckout() {
    if (!firebaseClients) {
      setError("Firebase Functions are not configured for checkout yet.");
      return;
    }

    setCheckoutBusy(true);
    setError("");

    try {
      const createCheckout = httpsCallable<
        CreateCheckoutSessionRequest,
        CreateCheckoutSessionResult
      >(firebaseClients.functions, "createCheckoutSession");
      const result = await createCheckout(
        isFigurineJob ? { jobId, paintOption } : { jobId },
      );

      if (result.data.checkoutUrl) {
        window.location.assign(result.data.checkoutUrl);
        return;
      }

      setError("Stripe did not return a checkout URL.");
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Checkout failed.",
      );
    } finally {
      setCheckoutBusy(false);
    }
  }

  return (
    <section className="panel min-w-0 rounded-lg p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            className="inline-flex items-center gap-2 text-sm font-bold text-[var(--muted)]"
            href="/start"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            New order
          </Link>
          <h1 className="display mt-3 text-2xl sm:text-3xl">
            {isFigurineJob ? "Review your 3D preview" : "Review your proof"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            {isFigurineJob
              ? job?.conceptSource === "meshy_prototype_concept" &&
                !figurinePreviewUrl
                ? "Review the figure concept below. Generate 3D figurine builds the printable color model from this concept."
                : canCheckout
                  ? "Your figurine is ready. Choose a finish and check out below."
                  : "Inspect the generated color model. Print files are still under review, so checkout stays locked."
              : "Approve the generated proof before payment. Checkout unlocks only after you approve the image for this poster."}
          </p>
        </div>
        {!operatorMode ? (
          <div>
            {isFigurineJob ? (
              <fieldset className="mt-4 rounded-lg border border-black/10 p-3">
                <legend className="px-1 text-sm font-bold">Finish</legend>
                <label className="mr-4 inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="paintOption"
                    checked={paintOption === "unpainted"}
                    onChange={() => setPaintOption("unpainted")}
                  />
                  Unpainted
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="paintOption"
                    checked={paintOption === "painted"}
                    onChange={() => setPaintOption("painted")}
                  />
                  Painted &amp; finished
                </label>
              </fieldset>
            ) : null}
            <button
              className="primary-button"
              type="button"
              disabled={!canCheckout || checkoutBusy}
              onClick={startCheckout}
            >
              {checkoutBusy ? (
                <Loader2 className="animate-spin" size={18} aria-hidden="true" />
              ) : (
                <CreditCard size={18} aria-hidden="true" />
              )}
              Checkout
            </button>
          </div>
        ) : null}
      </div>

      {!firebaseClients ? (
        <p className="mt-5 rounded-lg border border-[var(--coral)]/30 bg-[var(--coral)]/10 px-3 py-2 text-sm font-semibold text-[var(--coral)]">
          Add Firebase web env values in{" "}
          <code className="break-all">apps/web/.env.local</code>.
        </p>
      ) : null}

      {notice ? (
        <p className="mt-5 flex items-start gap-2 rounded-lg border border-[var(--teal)]/30 bg-[var(--teal)]/10 px-3 py-2 text-sm font-semibold text-[var(--teal)]">
          <CheckCircle2
            className="mt-0.5 shrink-0"
            size={16}
            aria-hidden="true"
          />
          {notice}
        </p>
      ) : null}

      {error ? (
        <p className="mt-5 flex items-start gap-2 rounded-lg border border-[var(--coral)]/30 bg-[var(--coral)]/10 px-3 py-2 text-sm font-semibold text-[var(--coral)]">
          <AlertCircle
            className="mt-0.5 shrink-0"
            size={16}
            aria-hidden="true"
          />
          {error}
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 rounded-lg border border-black/10 bg-black/[0.025] p-4 text-sm sm:grid-cols-4">
        <div>
          <p className="text-[var(--muted)]">Job</p>
          <strong className="break-all">{jobId}</strong>
        </div>
        <div>
          <p className="text-[var(--muted)]">Style</p>
          <strong>
            {job?.selectedStyleLabel ??
              styleLabels[job?.selectedStyle ?? ""] ??
              "Loading"}
          </strong>
        </div>
        <div>
          <p className="text-[var(--muted)]">Status</p>
          <strong>{job ? statusCopy(job) : "Loading"}</strong>
        </div>
        <div>
          <p className="text-[var(--muted)]">
            {isFigurineJob ? "Model" : "3D files"}
          </p>
          <strong>
            {isFigurineJob
              ? job?.figurinePreview?.status?.replaceAll("_", " ") ?? "Pending"
              : job?.printFileStatus?.replaceAll("_", " ") ?? "Pending"}
          </strong>
        </div>
      </div>

      {isFigurineJob && figurinePreviewUrl ? (
        <>
          <FigurineModelPreview
            previewUrl={figurinePreviewUrl}
            status={job?.figurinePreview?.status}
            printReadiness={job?.figurinePreview?.printReadiness}
            warnings={job?.figurinePreview?.warnings}
          />
          <FigurineBaseSignPanel
            signText={job?.baseConfig?.sign?.text ?? ""}
            namedBaseStatus={job?.figurineNamedBase?.status}
            normalizedName={job?.figurineNamedBase?.normalizedName}
            warnings={job?.figurineNamedBase?.warnings}
            basePreviewUrl={namedBasePreviewUrl}
            busy={baseSignBusy}
            error={baseSignError}
            notice={baseSignNotice}
            readOnly={operatorMode}
            onSave={saveBaseSign}
          />
          {namedBasePreviewPath ? (
            <section className="mt-8 rounded-lg border border-black/10 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-[var(--teal)]">
                    Print-readiness review
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">
                    Body/base assembly
                  </h2>
                </div>
                <Link
                  className="primary-button w-full justify-center sm:w-auto"
                  href={`/jobs/${jobId}/print-readiness${operatorMode ? "?operator=1" : ""}`}
                >
                  <Wrench size={18} aria-hidden="true" />
                  Print Readiness
                </Link>
              </div>
            </section>
          ) : null}
        </>
      ) : isFigurineJob ? (
        <section className="mt-8 rounded-lg border border-black/10 bg-white p-5">
          <div className="flex items-center gap-3 text-sm font-bold text-[var(--muted)]">
            <RefreshCw size={18} aria-hidden="true" />
            Color figurine preview pending
          </div>
        </section>
      ) : job?.printFileStatus === "generated" && previewGlbUrl ? (
        <PrintFilePreview
          proofUrl={approvedProofUrl}
          heightmapUrl={heightmapUrl}
          previewUrl={previewGlbUrl}
          modelStlPath={job.printFileArtifacts?.modelStl}
          printabilityStatus={job.printability?.status}
          warnings={job.printability?.warnings}
        />
      ) : (
        <PrintFileStatusPanel
          status={job?.printFileStatus}
          errorMessage={job?.printFileError?.message}
        />
      )}

      {authLoading || jobLoading ? (
        <div className="mt-8 flex min-h-60 items-center justify-center gap-3 rounded-lg border border-black/10 bg-white text-sm font-bold text-[var(--muted)]">
          <RefreshCw className="animate-spin" size={18} aria-hidden="true" />
          Loading customer proof
        </div>
      ) : null}

      {!authLoading && !user ? (
        <div className="mt-8 rounded-lg border border-black/10 bg-white p-5">
          <p className="font-bold">Sign in to view this job.</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {operatorMode
              ? "Use an operator or admin account."
              : "Use the same account or guest session that created the upload."}
          </p>
        </div>
      ) : null}

      {job && generatedImages.length > 0 ? (
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {generatedImages.map((image) => {
            const imageUrl = imageUrls[image.storagePath];
            const isApproved = approvedImagePath === image.storagePath;
            const canRegeneratePrintFiles =
              isApproved &&
              job.status === "approved" &&
              job.printFileStatus === "generated";
            const canRetryPrintFiles =
              isApproved &&
              job.status === "approved" &&
              job.printFileStatus === "failed";
            const canRetryFigurinePreview =
              isFigurineJob &&
              isApproved &&
              job.figurinePreview?.status === "failed";
            const canRunPrintFiles =
              canRegeneratePrintFiles ||
              canRetryPrintFiles ||
              canRetryFigurinePreview;
            const isBusy = approvalBusyPath === image.storagePath;
            let approvalLabel = "Approve proof";
            if (isFigurineJob) {
              approvalLabel = "Generate 3D figurine";
            }
            if (isApproved) {
              approvalLabel = isFigurineJob ? "Preview generated" : "Approved";
            }
            if (canRegeneratePrintFiles) {
              approvalLabel = "Regenerate 3D preview";
            }
            if (canRetryPrintFiles) {
              approvalLabel = "Retry 3D generation";
            }
            if (canRetryFigurinePreview) {
              approvalLabel = "Retry 3D figurine";
            }

            return (
              <article
                className="overflow-hidden rounded-lg border border-black/10 bg-white"
                key={image.id}
              >
                <div className="aspect-[5/7] bg-black/[0.035]">
                  {imageUrl ? (
                    <img
                      alt={image.label}
                      className="h-full w-full object-cover"
                      src={imageUrl}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm font-bold text-[var(--muted)]">
                      Loading proof
                    </div>
                  )}
                </div>
                <div className="grid gap-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">{image.label}</h2>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        {image.isPlaceholder
                          ? "Temporary source-photo proof"
                          : job.conceptSource === "meshy_prototype_concept"
                            ? "Figure concept generated from your photo"
                            : isFigurineJob
                              ? "Generated figurine proof"
                              : "Generated poster proof"}
                      </p>
                    </div>
                    {isApproved ? (
                      <span className="inline-flex min-h-8 items-center gap-2 rounded-lg bg-[var(--teal)] px-3 text-sm font-bold text-white">
                        <CheckCircle2 size={15} aria-hidden="true" />
                        Approved
                      </span>
                    ) : null}
                  </div>
                  {!operatorMode ? (
                    <button
                      className={
                        isApproved && !canRunPrintFiles
                          ? "secondary-button"
                          : "primary-button"
                      }
                      type="button"
                      disabled={(isApproved && !canRunPrintFiles) || isBusy}
                      onClick={() => approveImage(image.storagePath)}
                    >
                      {isBusy ? (
                        <Loader2
                          className="animate-spin"
                          size={18}
                          aria-hidden="true"
                        />
                      ) : canRunPrintFiles ? (
                        <RefreshCw size={18} aria-hidden="true" />
                      ) : (
                        <FileCheck2 size={18} aria-hidden="true" />
                      )}
                      {approvalLabel}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
