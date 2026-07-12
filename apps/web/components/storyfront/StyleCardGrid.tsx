"use client";

import { getFirebaseClients } from "@/lib/firebase";
import {
  defaultFigurineWorkflowConfig,
  normalizeFigurineWorkflowConfigResponse,
  visibleWorkflowStyles,
} from "@/lib/figurineWorkflowConfig";
import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { StyleCard } from "./StyleCard";

type AuthIntent = "sign-in" | "create";

const workflowConfigRetryLimit = 12;
const workflowConfigRetryDelayMs = 2000;

// Cards show exactly visibleWorkflowStyles() from the live config, so admin
// visibility toggles keep working.
export function StyleCardGrid({ authIntent }: { authIntent?: AuthIntent }) {
  const firebaseClients = useMemo(() => getFirebaseClients(), []);
  const [workflowConfig, setWorkflowConfig] = useState(
    defaultFigurineWorkflowConfig,
  );
  const [configLoading, setConfigLoading] = useState(Boolean(firebaseClients));
  const [workflowConfigError, setWorkflowConfigError] = useState("");

  useEffect(() => {
    if (!firebaseClients) {
      setConfigLoading(false);
      return;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const getWorkflowConfig = httpsCallable<Record<string, never>, unknown>(
      firebaseClients.functions,
      "getFigurineWorkflowConfig",
    );

    function loadWorkflowConfig(attempt: number) {
      void getWorkflowConfig({})
        .then((result) => {
          if (cancelled) {
            return;
          }

          setWorkflowConfig(
            normalizeFigurineWorkflowConfigResponse(result.data),
          );
          setWorkflowConfigError("");
          setConfigLoading(false);
        })
        .catch((configError) => {
          if (cancelled) {
            return;
          }

          if (attempt < workflowConfigRetryLimit) {
            retryTimer = setTimeout(
              () => loadWorkflowConfig(attempt + 1),
              workflowConfigRetryDelayMs,
            );
            return;
          }

          setWorkflowConfigError(
            configError instanceof Error
              ? configError.message
              : "Using default workflow settings.",
          );
          setConfigLoading(false);
        });
    }

    loadWorkflowConfig(1);

    return () => {
      cancelled = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [firebaseClients]);

  const styles = useMemo(
    () => visibleWorkflowStyles(workflowConfig),
    [workflowConfig],
  );
  return (
    <section id="style-grid" className="scroll-mt-6 py-10 sm:py-14">
      <h2 className="display text-2xl sm:text-3xl">Choose their hero form</h2>

      {workflowConfigError ? (
        <p className="mt-4 inline-block rounded-lg border border-[var(--gold)]/30 bg-[var(--gold)]/10 px-3 py-2 text-sm font-semibold text-[var(--ink)]">
          Using default workflow settings.
        </p>
      ) : null}

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {configLoading
          ? Array.from({ length: 6 }, (_, index) => (
              <div className="panel overflow-hidden rounded-xl" key={index}>
                <div className="skeleton-shimmer aspect-[2/1]" />
                <div className="grid gap-2 p-4">
                  <div className="skeleton-shimmer h-5 w-2/3 rounded" />
                  <div className="skeleton-shimmer h-4 w-full rounded" />
                </div>
              </div>
            ))
          : styles.map((style) => (
              <StyleCard authIntent={authIntent} style={style} key={style.id} />
            ))}
      </div>
    </section>
  );
}

