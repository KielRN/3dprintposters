"use client";

import { getFirebaseClients } from "@/lib/firebase";
import {
  customerSafeGenerationMessage,
  isStudioReviewReadyJob,
  studioReviewMessage,
} from "@/lib/generationRecovery";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Loader2,
  Palette,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref } from "firebase/storage";

type PaintOption = "unpainted" | "painted";

type ManualCheckoutJob = {
  uid: string;
  productType?: string;
  status?: string;
  sourceImagePath?: string;
  selectedStyle?: string;
  selectedStyleLabel?: string;
  baseConfig?: {
    sign?: {
      text?: string | null;
    } | null;
  } | null;
  generationState?: {
    state?: string;
    publicMessage?: string;
  } | null;
};

type CheckoutResult = {
  orderId: string;
  checkoutUrl: string | null;
};

const prices: Record<PaintOption, number> = {
  unpainted: 9900,
  painted: 14900,
};

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function ManualFigurineCheckout({ jobId }: { jobId: string }) {
  const firebaseClients = useMemo(() => getFirebaseClients(), []);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(firebaseClients));
  const [job, setJob] = useState<ManualCheckoutJob | null>(null);
  const [jobLoading, setJobLoading] = useState(Boolean(firebaseClients));
  const [sourceUrl, setSourceUrl] = useState("");
  const [paintOption, setPaintOption] = useState<PaintOption>("unpainted");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

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
      setNotice("Checkout returned here. Your hero is saved.");
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
        setJob(snapshot.exists() ? (snapshot.data() as ManualCheckoutJob) : null);
        setJobLoading(false);
      },
      (snapshotError) => {
        setError(snapshotError.message);
        setJobLoading(false);
      },
    );
  }, [firebaseClients, jobId, user]);

  useEffect(() => {
    if (!firebaseClients || !job?.sourceImagePath) {
      setSourceUrl("");
      return;
    }
    let cancelled = false;
    void getDownloadURL(ref(firebaseClients.storage, job.sourceImagePath))
      .then((url) => {
        if (!cancelled) {
          setSourceUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSourceUrl("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [firebaseClients, job?.sourceImagePath]);

  const studioReady = isStudioReviewReadyJob(job);
  const baseName = job?.baseConfig?.sign?.text?.trim() || "Your hero";
  const styleLabel = job?.selectedStyleLabel ?? job?.selectedStyle ?? "Figurine";

  async function startStudioCheckout() {
    if (!firebaseClients) {
      setError("Studio checkout setup is coming online.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const createCheckout = httpsCallable<
        { jobId: string; paintOption: PaintOption },
        CheckoutResult
      >(firebaseClients.functions, "createFallbackFigurineCheckoutSession");
      const result = await createCheckout({ jobId, paintOption });
      if (result.data.checkoutUrl) {
        window.location.assign(result.data.checkoutUrl);
        return;
      }
      setError("Studio checkout is ready for a fresh link.");
    } catch (checkoutError) {
      setError(
        customerSafeGenerationMessage(
          checkoutError,
          "Studio checkout will open after this hero is ready for review.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid min-w-0 gap-6">
      <Link
        className="inline-flex items-center gap-2 text-sm font-bold text-[var(--muted)]"
        href={`/jobs/${jobId}`}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to hero
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(22rem,0.7fr)]">
        <div className="panel overflow-hidden rounded-xl">
          <div className="aspect-[4/5] bg-[var(--clay)]">
            {sourceUrl ? (
              <img
                alt={`${baseName} source photo`}
                className="h-full w-full object-contain"
                src={sourceUrl}
              />
            ) : (
              <div className="skeleton-shimmer h-full w-full" />
            )}
          </div>
        </div>

        <div className="panel rounded-xl p-5 sm:p-6">
          <p className="text-sm font-bold text-[var(--ember)]">
            PERSONAL STUDIO REVIEW
          </p>
          <h1 className="display mt-1 text-3xl sm:text-4xl">
            Your hero deserves the human touch.
          </h1>
          <p className="mt-3 text-sm text-[var(--muted)]">
            {job?.generationState?.publicMessage ?? studioReviewMessage}
          </p>

          {notice ? (
            <p className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--teal)]/30 bg-[var(--teal)]/10 px-3 py-2 text-sm font-semibold text-[var(--teal)]">
              <CheckCircle2
                className="mt-0.5 shrink-0"
                size={16}
                aria-hidden="true"
              />
              {notice}
            </p>
          ) : null}

          {error ? (
            <p className="mt-4 rounded-lg border border-[var(--gold)]/30 bg-[var(--gold)]/10 px-3 py-2 text-sm font-semibold text-[#8a6412]">
              {error}
            </p>
          ) : null}

          {authLoading || jobLoading ? (
            <div className="mt-6 flex min-h-28 items-center justify-center gap-3 rounded-lg border border-black/10 bg-white text-sm font-bold text-[var(--muted)]">
              <Loader2 className="animate-spin" size={18} aria-hidden="true" />
              Loading studio review
            </div>
          ) : null}

          {!authLoading && !user ? (
            <div className="mt-6 rounded-lg border border-black/10 bg-white p-4">
              <p className="font-bold">Sign in to continue studio review.</p>
            </div>
          ) : null}

          {!jobLoading && user && !job ? (
            <div className="mt-6 rounded-lg border border-black/10 bg-white p-4">
              <p className="font-bold">Open this page from your hero account.</p>
            </div>
          ) : null}

          {job ? (
            <div className="mt-6 grid gap-3 text-sm">
              <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 rounded-lg bg-black/[0.025] p-3">
                <span className="text-[var(--muted)]">Style</span>
                <strong>{styleLabel}</strong>
                <span className="text-[var(--muted)]">Base</span>
                <strong>{baseName}</strong>
                <span className="text-[var(--muted)]">Choice</span>
                <strong>
                  {paintOption === "painted"
                    ? "Painted and finished"
                    : "Unpainted"}
                </strong>
                <span className="text-[var(--muted)]">Price</span>
                <strong>{formatMoney(prices[paintOption])}</strong>
              </div>

              <div className="grid gap-2">
                <p className="text-xs font-bold uppercase text-[var(--muted)]">
                  Paint choice
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(["unpainted", "painted"] as PaintOption[]).map((option) => (
                    <button
                      className={`rounded-lg border px-3 py-3 text-left text-sm font-bold ${
                        paintOption === option
                          ? "border-[var(--ember)] bg-[var(--ember)]/10"
                          : "border-black/10 bg-white"
                      }`}
                      type="button"
                      key={option}
                      onClick={() => setPaintOption(option)}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Palette size={16} aria-hidden="true" />
                        {option === "painted" ? "Painted" : "Unpainted"}
                      </span>
                      <span className="mt-1 block text-xs text-[var(--muted)]">
                        {formatMoney(prices[option])}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <p className="rounded-lg border border-black/10 bg-white p-3 text-sm text-[var(--muted)]">
                After payment, our studio gives the project a hands-on review.
                Projects outside our creation fit receive a full refund to the
                original payment method, with the decision sent by email.
                Please watch your inbox.
              </p>

              <button
                className="primary-button mt-2 w-full"
                type="button"
                disabled={!studioReady || busy}
                onClick={startStudioCheckout}
              >
                {busy ? (
                  <Loader2 className="animate-spin" size={18} aria-hidden="true" />
                ) : (
                  <CreditCard size={18} aria-hidden="true" />
                )}
                Send my hero to the studio
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
