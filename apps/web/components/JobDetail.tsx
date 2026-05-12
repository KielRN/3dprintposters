"use client";

import { getFirebaseClients } from "@/lib/firebase";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref } from "firebase/storage";
import {
  PrintFilePreview,
  PrintFileStatusPanel,
  type ArtifactDownload,
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
  status: string;
  sourceImagePath: string;
  selectedStyle: string;
  generatedImages?: GeneratedImage[];
  approvedImagePath?: string | null;
  printFileStatus?: string;
  printFileArtifacts?: PrintFileArtifacts | null;
  printability?: PrintabilitySummary | null;
  printFileError?: {
    message?: string;
  } | null;
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
};

type PrintabilitySummary = {
  status: string;
  checks: string[];
  warnings?: string[];
};

const styleLabels: Record<string, string> = {
  "gallery-relief": "Gallery Relief",
  "anime-poster": "Anime Poster",
  cyberpunk: "Cyberpunk",
  storybook: "Storybook",
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

export function JobDetail({ jobId }: { jobId: string }) {
  const firebaseClients = useMemo(() => getFirebaseClients(), []);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(firebaseClients));
  const [job, setJob] = useState<JobDocument | null>(null);
  const [jobLoading, setJobLoading] = useState(Boolean(firebaseClients));
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [artifactUrls, setArtifactUrls] = useState<Record<string, string>>({});
  const [approvalBusyPath, setApprovalBusyPath] = useState("");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const generatedImages = useMemo(
    () => normalizeGeneratedImages(job?.generatedImages),
    [job?.generatedImages],
  );
  const approvedImagePath = job?.approvedImagePath ?? null;
  const canCheckout =
    job?.status === "approved" &&
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
  const artifactDownloadSpecs = [
    {
      label: "Download model.stl",
      filename: "model.stl",
      path: printFileArtifacts?.modelStl,
      icon: "model" as const,
    },
    {
      label: "Download preview.glb",
      filename: "preview.glb",
      path: printFileArtifacts?.previewGlb,
      icon: "preview" as const,
    },
    {
      label: "Download heightmap.png",
      filename: "heightmap.png",
      path: printFileArtifacts?.heightmapPng,
      icon: "heightmap" as const,
    },
    {
      label: "Download metadata.json",
      filename: "metadata.json",
      path: printFileArtifacts?.metadataJson,
      icon: "metadata" as const,
    },
    {
      label: "Download print-package.3mf",
      filename: "print-package.3mf",
      path: printFileArtifacts?.fullColor3mf,
      icon: "model" as const,
    },
    {
      label: "Download model.obj",
      filename: "model.obj",
      path: printFileArtifacts?.fullColorObj,
      icon: "model" as const,
    },
    {
      label: "Download model.mtl",
      filename: "model.mtl",
      path: printFileArtifacts?.fullColorObjMtl,
      icon: "guide" as const,
    },
    {
      label: "Download texture.png",
      filename: "texture.png",
      path: printFileArtifacts?.fullColorTexturePng,
      icon: "texture" as const,
    },
    {
      label: "Download model.wrl",
      filename: "model.wrl",
      path: printFileArtifacts?.fullColorVrml,
      icon: "model" as const,
    },
    {
      label: "Download model.ply",
      filename: "model.ply",
      path: printFileArtifacts?.fullColorPly,
      icon: "model" as const,
    },
    {
      label: "Download palette.json",
      filename: "palette.json",
      path: printFileArtifacts?.filamentPaletteJson,
      icon: "metadata" as const,
    },
    {
      label: "Download layer-swaps.txt",
      filename: "layer-swaps.txt",
      path: printFileArtifacts?.filamentLayerSwapsTxt,
      icon: "guide" as const,
    },
    {
      label: "Download print-settings.json",
      filename: "print-settings.json",
      path: printFileArtifacts?.filamentPrintSettingsJson,
      icon: "metadata" as const,
    },
    {
      label: "Download filament preview.png",
      filename: "filament-preview.png",
      path: printFileArtifacts?.filamentPreviewPng,
      icon: "texture" as const,
    },
  ];
  const artifactDownloads: ArtifactDownload[] = artifactDownloadSpecs.flatMap((artifact) =>
    artifact.path && artifactUrls[artifact.path]
      ? [
          {
            label: artifact.label,
            filename: artifact.filename,
            url: artifactUrls[artifact.path],
            icon: artifact.icon,
          },
        ]
      : [],
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
    const checkoutStatus = new URLSearchParams(window.location.search).get(
      "checkout",
    );
    if (checkoutStatus === "cancelled") {
      setNotice("Checkout was cancelled. Your approved proof is still saved.");
    }
  }, []);

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
  }, [firebaseClients, generatedImages, job]);

  useEffect(() => {
    const artifacts = job?.printFileArtifacts;
    if (!firebaseClients || !artifacts) {
      setArtifactUrls({});
      return;
    }

    const paths = Array.from(
      new Set(
        [
          artifacts.modelStl,
          artifacts.previewGlb,
          artifacts.heightmapPng,
          artifacts.metadataJson,
          artifacts.fullColor3mf,
          artifacts.fullColorObj,
          artifacts.fullColorObjMtl,
          artifacts.fullColorTexturePng,
          artifacts.fullColorVrml,
          artifacts.fullColorPly,
          artifacts.filamentPaletteJson,
          artifacts.filamentLayerSwapsTxt,
          artifacts.filamentPrintSettingsJson,
          artifacts.filamentPreviewPng,
        ].filter((path): path is string => Boolean(path)),
      ),
    );

    if (paths.length === 0) {
      setArtifactUrls({});
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
  }, [firebaseClients, job?.printFileArtifacts]);

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
      >(firebaseClients.functions, "approveGeneratedImage");
      await approveGeneratedImage({ jobId, imagePath });
      setNotice("3D relief preview is ready. Checkout is unlocked.");
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
      const result = await createCheckout({ jobId });

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
            href="/"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            New order
          </Link>
          <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">
            Review your proof
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            Approve the generated proof before payment. Checkout unlocks only
            after you approve the image for this poster.
          </p>
        </div>
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
          <strong>{styleLabels[job?.selectedStyle ?? ""] ?? "Loading"}</strong>
        </div>
        <div>
          <p className="text-[var(--muted)]">Status</p>
          <strong>{job ? statusCopy(job) : "Loading"}</strong>
        </div>
        <div>
          <p className="text-[var(--muted)]">3D files</p>
          <strong>{job?.printFileStatus?.replaceAll("_", " ") ?? "Pending"}</strong>
        </div>
      </div>

      {job?.printFileStatus === "generated" && previewGlbUrl ? (
        <PrintFilePreview
          proofUrl={approvedProofUrl}
          heightmapUrl={heightmapUrl}
          previewUrl={previewGlbUrl}
          modelStlPath={job.printFileArtifacts?.modelStl}
          artifactDownloads={artifactDownloads}
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
            Use the same account or guest session that created the upload.
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
            const canRunPrintFiles = canRegeneratePrintFiles || canRetryPrintFiles;
            const isBusy = approvalBusyPath === image.storagePath;
            let approvalLabel = "Approve proof";
            if (isApproved) {
              approvalLabel = "Approved";
            }
            if (canRegeneratePrintFiles) {
              approvalLabel = "Regenerate 3D preview";
            }
            if (canRetryPrintFiles) {
              approvalLabel = "Retry 3D generation";
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
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
