"use client";

import { AuthPanel } from "@/components/AuthPanel";
import { UploadPanel } from "@/components/UploadPanel";
import { getFirebaseClients } from "@/lib/firebase";
import {
  defaultFigurineWorkflowConfig,
  normalizeFigurineWorkflowConfigResponse,
  visibleWorkflowStyles,
} from "@/lib/figurineWorkflowConfig";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { ComicBanner } from "./ComicBanner";
import { MyFigurinesList } from "./MyFigurinesList";
import { styleCardContent } from "./styleCardContent";

type AuthIntent = "sign-in" | "create";

// Page 2: per-style project page. The style resolves client-side after the
// live config loads; unknown or disabled ids bounce back to the gallery.
export function ProjectPageView({
  initialAuthMode,
  styleId,
}: {
  initialAuthMode?: AuthIntent;
  styleId: string;
}) {
  const router = useRouter();
  const firebaseClients = useMemo(() => getFirebaseClients(), []);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(firebaseClients));
  const [workflowConfig, setWorkflowConfig] = useState(
    defaultFigurineWorkflowConfig,
  );
  const [configLoading, setConfigLoading] = useState(Boolean(firebaseClients));
  const [authPromptKey, setAuthPromptKey] = useState(0);

  useEffect(() => {
    if (!firebaseClients) {
      setAuthLoading(false);
      return;
    }

    return onAuthStateChanged(firebaseClients.auth, (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
    });
  }, [firebaseClients]);

  useEffect(() => {
    if (!firebaseClients) {
      setConfigLoading(false);
      return;
    }

    let cancelled = false;
    const getWorkflowConfig = httpsCallable<Record<string, never>, unknown>(
      firebaseClients.functions,
      "getFigurineWorkflowConfig",
    );

    void getWorkflowConfig({})
      .then((result) => {
        if (cancelled) {
          return;
        }
        setWorkflowConfig(normalizeFigurineWorkflowConfigResponse(result.data));
        setConfigLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          // Defaults keep the page functional; unknown ids still redirect.
          setConfigLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [firebaseClients]);

  const style = useMemo(
    () =>
      visibleWorkflowStyles(workflowConfig).find(
        (candidate) => candidate.id === styleId,
      ),
    [styleId, workflowConfig],
  );

  useEffect(() => {
    if (!configLoading && !style) {
      router.replace("/start");
    }
  }, [configLoading, router, style]);

  if (configLoading || !style) {
    return (
      <div className="grid gap-6 pt-6">
        <div className="skeleton-shimmer h-52 rounded-2xl" />
        <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
          <div className="skeleton-shimmer h-80 rounded-xl" />
          <div className="skeleton-shimmer h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  const content = styleCardContent(style.id);
  const conceptCount =
    style.proofMode === "template_face_swap" ||
    style.proofRendering === "realistic_person"
      ? 1
      : workflowConfig.proofGenerationCount;

  return (
    <div className="grid gap-8 pt-6">
      <ComicBanner
        variant="compact"
        art={content.art}
        title={content.bannerTitle ?? style.label}
      />

      <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
        <section className="panel grid gap-5 rounded-xl p-5 sm:p-6">
          <AuthPanel
            user={user}
            authLoading={authLoading}
            firebaseClients={firebaseClients}
            focusRequestKey={authPromptKey}
            initialMode={authPromptKey > 0 ? "create" : (initialAuthMode ?? "sign-in")}
            prompt={
              authPromptKey > 0
                ? "Create an account to choose your photo."
                : undefined
            }
          />
          <UploadPanel
            style={style}
            user={user}
            authLoading={authLoading}
            firebaseClients={firebaseClients}
            onAuthRequired={() => setAuthPromptKey((key) => key + 1)}
          />
        </section>

        <aside className="grid content-start gap-4">
          <div className="rounded-xl border border-[var(--line)] bg-[var(--clay)]/40 p-5">
            <h2 className="text-lg font-bold">{style.label}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {content.description}
            </p>
            <dl className="mt-4 grid gap-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[var(--muted)]">
                  {style.proofMode === "template_face_swap"
                    ? "Concept options"
                    : "Proof options"}
                </dt>
                <dd className="font-bold">{conceptCount}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[var(--muted)]">Finished height</dt>
                <dd className="font-bold">About 150 mm</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[var(--muted)]">Every print</dt>
                <dd className="font-bold">Human-reviewed</dd>
              </div>
            </dl>
          </div>
          <p className="px-1 text-sm leading-relaxed text-[var(--muted)]">
            Your photo stays on your account and only guides this figurine.
            You approve the concept before anything is printed.
          </p>
        </aside>
      </div>

      <MyFigurinesList
        user={user}
        authLoading={authLoading}
        firebaseClients={firebaseClients}
      />
    </div>
  );
}

