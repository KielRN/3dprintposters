"use client";

import { getFirebaseClients } from "@/lib/firebase";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref } from "firebase/storage";
import { heroName, type JobCardSource } from "./jobPresentation";
import { OfferBlock } from "./OfferBlock";
import { SceneStage, SCENE_IDS, type SceneId } from "./SceneStage";
import { StepPills } from "./StepPills";

type ScenePreview = {
  status?: string;
  storagePath?: string;
};

type HomeJobDocument = JobCardSource & {
  uid: string;
  productType?: string;
  scenePreviews?: Record<string, ScenePreview>;
};

type CreateCheckoutSessionRequest = {
  jobId: string;
  paintOption?: "painted" | "unpainted";
};

type CreateCheckoutSessionResult = {
  orderId: string;
  checkoutUrl: string | null;
};

const SCENE_PREVIEW_TIMEOUT_MS = 120_000;

// Page 4: the scene render is garnish and the offer is the point. Checkout
// goes live the moment the approval guard passes; scene status never touches
// the CTA. Direct visits without an approved concept bounce to the job page.
export function HomeClaimView({ jobId }: { jobId: string }) {
  const router = useRouter();
  const firebaseClients = useMemo(() => getFirebaseClients(), []);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(firebaseClients));
  const [job, setJob] = useState<HomeJobDocument | null>(null);
  const [jobLoading, setJobLoading] = useState(true);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const firedScenes = useRef<Set<SceneId>>(new Set());

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

    return onSnapshot(
      doc(firebaseClients.firestore, "jobs", jobId),
      (snapshot) => {
        setJob(snapshot.exists() ? (snapshot.data() as HomeJobDocument) : null);
        setJobLoading(false);
      },
      () => {
        setJob(null);
        setJobLoading(false);
      },
    );
  }, [firebaseClients, jobId, user]);

  // Guard: this page only exists after a concept is approved.
  const guardFailed =
    !firebaseClients ||
    (!authLoading && !user) ||
    (!jobLoading &&
      user !== null &&
      (!job || job.productType !== "figurine" || !job.approvedImagePath));

  useEffect(() => {
    if (guardFailed) {
      router.replace(`/jobs/${jobId}`);
    }
  }, [guardFailed, jobId, router]);

  function fireSceneRender(sceneId: SceneId) {
    if (!firebaseClients || firedScenes.current.has(sceneId)) {
      return;
    }
    firedScenes.current.add(sceneId);
    const generateScene = httpsCallable(
      firebaseClients.functions,
      "generateScenePreview",
      { timeout: SCENE_PREVIEW_TIMEOUT_MS },
    );
    // Never awaited: status flips arrive through the job snapshot.
    void generateScene({ jobId, sceneId }).catch(() => {});
  }

  // Fallback for jobs created before server-side pre-generation: fire any
  // scene the trigger did not cover. On new jobs every scene already has a
  // scenePreviews entry, so this no-ops.
  useEffect(() => {
    if (!job?.approvedImagePath) {
      return;
    }
    for (const sceneId of SCENE_IDS) {
      if (job.scenePreviews?.[sceneId]) {
        continue;
      }
      try {
        const marker = `storyfront-scene-fired-${jobId}-${sceneId}`;
        if (sessionStorage.getItem(marker)) {
          continue;
        }
        sessionStorage.setItem(marker, "1");
      } catch {
        // storage unavailable: still fire once per mount via firedScenes
      }
      fireSceneRender(sceneId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(job?.approvedImagePath)]);

  // Resolve download URLs for every ready scene render and the concept image.
  useEffect(() => {
    if (!firebaseClients || !job) {
      return;
    }

    const wanted: string[] = [];
    for (const sceneId of SCENE_IDS) {
      const scene = job.scenePreviews?.[sceneId];
      if (scene?.status === "ready" && scene.storagePath) {
        wanted.push(scene.storagePath);
      }
    }
    if (job.approvedImagePath) {
      wanted.push(job.approvedImagePath);
    }

    let cancelled = false;
    for (const path of wanted) {
      if (assetUrls[path]) {
        continue;
      }
      void getDownloadURL(ref(firebaseClients.storage, path))
        .then((url) => {
          if (!cancelled) {
            setAssetUrls((current) =>
              current[path] ? current : { ...current, [path]: url },
            );
          }
        })
        .catch(() => {
          // SceneStage falls back to the concept composite; the concept
          // itself degrades to the backdrop only.
        });
    }

    return () => {
      cancelled = true;
    };
  }, [assetUrls, firebaseClients, job]);

  async function startCheckout(paintOption: "painted" | "unpainted") {
    if (!firebaseClients) {
      setCheckoutError("Firebase Functions are not configured for checkout yet.");
      return;
    }

    setCheckoutBusy(true);
    setCheckoutError("");

    try {
      const createCheckout = httpsCallable<
        CreateCheckoutSessionRequest,
        CreateCheckoutSessionResult
      >(firebaseClients.functions, "createCheckoutSession");
      const result = await createCheckout({ jobId, paintOption });

      if (result.data.checkoutUrl) {
        window.location.assign(result.data.checkoutUrl);
        return;
      }

      setCheckoutError("Stripe did not return a checkout URL.");
    } catch (error) {
      setCheckoutError(
        error instanceof Error ? error.message : "Checkout failed.",
      );
    } finally {
      setCheckoutBusy(false);
    }
  }

  if (guardFailed || authLoading || jobLoading || !job) {
    return (
      <section className="grid min-w-0 gap-6">
        <div className="skeleton-shimmer h-14 rounded-xl" />
        <div className="skeleton-shimmer aspect-[16/10] rounded-2xl" />
      </section>
    );
  }

  const name = heroName(job);
  const isPaid = job.pipelineStage === "paid";
  const conceptUrl = job.approvedImagePath
    ? (assetUrls[job.approvedImagePath] ?? null)
    : null;

  function sceneUrlFor(sceneId: SceneId): string | null {
    const scene = job?.scenePreviews?.[sceneId];
    return scene?.status === "ready" && scene.storagePath
      ? (assetUrls[scene.storagePath] ?? null)
      : null;
  }

  return (
    <section className="grid min-w-0 gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          className="inline-flex items-center gap-2 text-sm font-bold text-[var(--muted)]"
          href={`/jobs/${jobId}`}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to your hero
        </Link>
        <StepPills current={4} />
      </div>

      <h1 className="display text-3xl sm:text-4xl">Bring them home.</h1>

      <SceneStage
        heroName={name}
        scenes={{
          bookshelf: job.scenePreviews?.bookshelf,
          desk: job.scenePreviews?.desk,
          unboxing: job.scenePreviews?.unboxing,
        }}
        sceneUrls={{
          bookshelf: sceneUrlFor("bookshelf"),
          desk: sceneUrlFor("desk"),
          unboxing: sceneUrlFor("unboxing"),
        }}
        conceptUrl={conceptUrl}
      />

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
          <Link
            className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-[var(--muted)]"
            href={`/jobs/${jobId}`}
          >
            <ArrowLeft size={14} aria-hidden="true" />
            Back to your hero
          </Link>
        </div>
      ) : (
        <OfferBlock
          heroName={name}
          busy={checkoutBusy}
          error={checkoutError}
          onCheckout={startCheckout}
        />
      )}
    </section>
  );
}
