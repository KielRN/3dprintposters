"use client";

import { getFirebaseClients } from "@/lib/firebase";
import {
  isStudioReviewReadyJob,
  studioReviewMessage,
} from "@/lib/generationRecovery";
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
import { useRouter } from "next/navigation";
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
import { ConceptStage } from "./storyfront/ConceptStage";
import { JourneyStrip } from "./storyfront/JourneyStrip";
import { StepPills } from "./storyfront/StepPills";
import {
  heroName as jobHeroName,
  jobStatusChip,
  type JobChipTone,
} from "./storyfront/jobPresentation";

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
  pipelineStage?: string;
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
  manualCheckoutEligibility?: {
    eligible?: boolean;
    reason?: string;
  } | null;
  generationState?: {
    state?: string;
    publicMessage?: string;
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
  assembly?: Record<string, unknown> | null;
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

// Matches the approveGeneratedImage callable's 1200s server timeout: Hi3D
// v2.1 figurine generations run ~7-8 minutes plus asset transfer.
const PRINT_FILE_GENERATION_TIMEOUT_MS = 1_200_000;
const BASE_SIGN_GENERATION_TIMEOUT_MS = 540_000;
// Figurine approval is approval-only (the 3D build runs post-payment), so it
// returns in seconds rather than the poster path's print-file wait.
const FIGURINE_APPROVAL_TIMEOUT_MS = 60_000;

const chipToneClasses: Record<JobChipTone, string> = {
  moss: "bg-[var(--moss)]/10 text-[var(--moss)]",
  gold: "bg-[var(--gold)]/10 text-[var(--gold)]",
  ember: "bg-[var(--ember)]/10 text-[var(--ember)]",
  coral: "bg-[var(--coral)]/10 text-[var(--coral)]",
  muted: "bg-black/[0.04] text-[var(--muted)]",
};

const styleLabels: Record<string, string> = {
  "gallery-relief": "Gallery Relief",
  "anime-poster": "Anime Poster",
  cyberpunk: "Cyberpunk",
  storybook: "Storybook",
  creative_lab_figure: "Creative Lab Figure",
  "creative-lab-figure": "Creative Lab Figure",
  emoji_avatar: "Emoji Avatar",
  super_hero_figure_female: "Super Hero Figure - Female",
  chibi_figure: "Chibi heroic fantasy male",
  chibi_female: "Chibi heroic fantasy female",
  chibi_photo_male: "Chibi male",
  chibi_photo_female: "Chibi female",
  heroic_fantasy_male: "Heroic fantasy male",
  heroic_fantasy_female: "Heroic fantasy female",
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
    return "3D support review";
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
  const router = useRouter();
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

  async function approveImage(imagePath: string): Promise<boolean> {
    if (!firebaseClients) {
      setError("Firebase is not configured for approval yet.");
      return false;
    }

    setApprovalBusyPath(imagePath);
    setError("");

    try {
      const approveGeneratedImage = httpsCallable<
        ApproveGeneratedImageRequest,
        ApproveGeneratedImageResult
      >(firebaseClients.functions, "approveGeneratedImage", {
        timeout: isFigurineJob
          ? FIGURINE_APPROVAL_TIMEOUT_MS
          : PRINT_FILE_GENERATION_TIMEOUT_MS,
      });
      await approveGeneratedImage({ jobId, imagePath });
      setNotice(
        isFigurineJob
          ? "Saved to your heroes — come back anytime."
          : "3D relief preview is ready. Checkout is unlocked.",
      );
      return true;
    } catch (approvalError) {
      setError(
        approvalError instanceof Error
          ? approvalError.message
          : "Approval failed.",
      );
      return false;
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

      setBaseSignNotice(result.data.namedBase ? "Saved." : "Saved without a name.");
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

  // Single-concept styles skip the picker, so continuing to page 4 claims
  // the concept first (approval-only, returns in seconds) when needed.
  async function continueToHome(stageImagePath: string | null) {
    if (
      isFigurineJob &&
      !approvedImagePath &&
      stageImagePath &&
      job?.status === "preview_ready"
    ) {
      const approved = await approveImage(stageImagePath);
      if (!approved) {
        return;
      }
    }
    seeItInYourHome();
  }

  function seeItInYourHome() {
    router.push(`/jobs/${jobId}/home`);
  }

  const isPaid = job?.pipelineStage === "paid";
  const customerFigurineView = !operatorMode && isFigurineJob;

  const customerHeader = (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <Link
        className="inline-flex items-center gap-2 text-sm font-bold text-[var(--muted)]"
        href="/start"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        New order
      </Link>
      <StepPills current={3} />
    </div>
  );

  const missingEnvWarning = !firebaseClients ? (
    <p className="rounded-lg border border-[var(--coral)]/30 bg-[var(--coral)]/10 px-3 py-2 text-sm font-semibold text-[var(--coral)]">
      Add Firebase web env values in{" "}
      <code className="break-all">apps/web/.env.local</code>.
    </p>
  ) : null;

  // Customer pages resolve auth/job state before choosing the poster or
  // figurine presentation; operator mode keeps the original layout below,
  // including its own loading states.
  if (!operatorMode && (authLoading || jobLoading)) {
    return (
      <section className="grid min-w-0 gap-6">
        {customerHeader}
        {missingEnvWarning}
        <div className="skeleton-shimmer h-[420px] rounded-2xl" />
      </section>
    );
  }

  if (!operatorMode && !user) {
    return (
      <section className="grid min-w-0 gap-6">
        {customerHeader}
        {missingEnvWarning}
        <div className="panel rounded-xl p-5">
          <p className="font-bold">Sign in to view this job.</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Use the same account that created the upload.
          </p>
        </div>
      </section>
    );
  }

  if (!operatorMode && !job) {
    return (
      <section className="grid min-w-0 gap-6">
        {customerHeader}
        <div className="rounded-xl border border-[var(--coral)]/30 bg-[var(--coral)]/10 p-5">
          <p className="flex items-start gap-2 font-bold text-[var(--coral)]">
            <AlertCircle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
            {error || "Job not found for this signed-in account."}
          </p>
        </div>
      </section>
    );
  }

  if (customerFigurineView && job) {
    const nonPlaceholderImages = generatedImages.filter(
      (image) => !image.isPlaceholder,
    );
    const multiConcept = nonPlaceholderImages.length > 1;
    const stageImagePath =
      approvedImagePath ??
      (multiConcept ? null : (nonPlaceholderImages[0]?.storagePath ?? null));
    const stageImageUrl = stageImagePath
      ? (imageUrls[stageImagePath] ?? "")
      : "";
    const chip = jobStatusChip(job);
    const name = jobHeroName(job);
    const studioReviewReady = isStudioReviewReadyJob(job);

    return (
      <section className="grid min-w-0 gap-6">
        {customerHeader}

        {notice ? (
          <p className="flex items-start gap-2 rounded-lg border border-[var(--moss)]/30 bg-[var(--moss)]/10 px-3 py-2 text-sm font-semibold text-[var(--moss)]">
            <CheckCircle2
              className="mt-0.5 shrink-0"
              size={16}
              aria-hidden="true"
            />
            {notice}
          </p>
        ) : null}

        {error ? (
          <p className="flex items-start gap-2 rounded-lg border border-[var(--coral)]/30 bg-[var(--coral)]/10 px-3 py-2 text-sm font-semibold text-[var(--coral)]">
            <AlertCircle
              className="mt-0.5 shrink-0"
              size={16}
              aria-hidden="true"
            />
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${chipToneClasses[chip.tone]}`}
          >
            {chip.pulse ? (
              <span
                className="chip-pulse-dot h-1.5 w-1.5 rounded-full bg-current"
                aria-hidden="true"
              />
            ) : null}
            {chip.label}
          </span>
          <span className="text-sm font-semibold text-[var(--muted)]">
            {job.selectedStyleLabel ??
              styleLabels[job.selectedStyle ?? ""] ??
              job.selectedStyle}
          </span>
        </div>

        {isPaid ? (
          <div className="panel rounded-xl p-5">
            <p className="flex items-start gap-2 font-bold">
              <CheckCircle2
                className="mt-0.5 shrink-0 text-[var(--moss)]"
                size={18}
                aria-hidden="true"
              />
              Order received — your hero is in production.
            </p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              We&apos;ll take it from here. This page stays your hero&apos;s
              home.
            </p>
          </div>
        ) : null}

        {stageImagePath && stageImageUrl ? (
          <ConceptStage
            jobId={jobId}
            imageUrl={stageImageUrl}
            heroName={name}
          />
        ) : stageImagePath ? (
          <div className="skeleton-shimmer h-[420px] rounded-2xl" />
        ) : studioReviewReady ? (
          <div className="panel rounded-xl p-5">
            <p className="text-sm font-bold text-[var(--ember)]">
              PERSONAL STUDIO REVIEW
            </p>
            <h1 className="display mt-1 text-3xl sm:text-4xl">
              Your hero deserves the human touch.
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">
              {job.generationState?.publicMessage ?? studioReviewMessage}
            </p>
            <Link
              className="primary-button mt-5 w-full sm:w-auto sm:px-8"
              href={`/jobs/${jobId}/manual-checkout`}
            >
              Continue to studio review
            </Link>
          </div>
        ) : nonPlaceholderImages.length === 0 ? (
          <div className="skeleton-shimmer grid h-[320px] place-items-center rounded-2xl">
            <p className="display relative z-10 px-6 text-center text-xl">
              Your hero&apos;s concept is on the way. This can take a few
              minutes.
            </p>
          </div>
        ) : null}

        {multiConcept && !isPaid ? (
          <section>
            {!approvedImagePath ? (
              <>
                <p className="text-sm font-bold text-[var(--ember)]">
                  You made these.
                </p>
                <h1 className="display mt-1 text-3xl sm:text-4xl">
                  Choose your hero.
                </h1>
              </>
            ) : (
              <h2 className="text-lg font-bold">Pick a different take</h2>
            )}
            <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {nonPlaceholderImages.map((image) => {
                const imageUrl = imageUrls[image.storagePath];
                const isChosen = approvedImagePath === image.storagePath;
                const isBusy = approvalBusyPath === image.storagePath;

                return (
                  <article
                    className={`overflow-hidden rounded-xl border bg-white ${
                      isChosen ? "border-[var(--ember)]" : "border-black/10"
                    }`}
                    key={image.id}
                  >
                    <div className="aspect-[4/5] bg-black/[0.035]">
                      {imageUrl ? (
                        <img
                          alt={image.label}
                          className="h-full w-full object-cover"
                          src={imageUrl}
                        />
                      ) : (
                        <div className="skeleton-shimmer h-full w-full" />
                      )}
                    </div>
                    <div className="p-3">
                      {isChosen ? (
                        <span className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg bg-[var(--ember)] px-3 text-sm font-bold text-white">
                          <CheckCircle2 size={15} aria-hidden="true" />
                          Your choice
                        </span>
                      ) : (
                        <button
                          className={
                            approvedImagePath
                              ? "secondary-button w-full"
                              : "primary-button w-full"
                          }
                          type="button"
                          disabled={Boolean(approvalBusyPath)}
                          onClick={() => approveImage(image.storagePath)}
                        >
                          {isBusy ? (
                            <Loader2
                              className="animate-spin"
                              size={16}
                              aria-hidden="true"
                            />
                          ) : null}
                          Choose this concept
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        <JourneyStrip
          sourceUrl={
            job.sourceImagePath ? imageUrls[job.sourceImagePath] : undefined
          }
          conceptUrl={stageImageUrl || undefined}
        />

        {job.baseConfig?.sign?.text ? (
          <p className="text-sm font-semibold">
            The base will read:{" "}
            <strong className="tracking-wide">
              {job.baseConfig.sign.text.toUpperCase()}
            </strong>
          </p>
        ) : null}

        {!isPaid &&
        (canCheckout ||
          (stageImagePath && job.status === "preview_ready")) ? (
          <div>
            <button
              className="primary-button w-full sm:w-auto sm:px-8"
              type="button"
              disabled={Boolean(approvalBusyPath)}
              onClick={() => void continueToHome(stageImagePath)}
            >
              {approvalBusyPath ? (
                <Loader2 className="animate-spin" size={18} aria-hidden="true" />
              ) : null}
              See {name} in your home →
            </button>
          </div>
        ) : null}
      </section>
    );
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
              : "Use the same account that created the upload."}
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

