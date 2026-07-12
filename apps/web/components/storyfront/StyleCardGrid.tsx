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

const workflowConfigRetryLimit = 12;
const workflowConfigRetryDelayMs = 2000;
const workflowConfigCacheKey = "storyfront-workflow-config-v1";

function readCachedWorkflowConfig() {
  try {
    const cachedConfig = window.localStorage.getItem(workflowConfigCacheKey);
    return cachedConfig
      ? normalizeFigurineWorkflowConfigResponse(JSON.parse(cachedConfig))
      : null;
  } catch {
    return null;
  }
}

function cacheWorkflowConfig(rawConfig: unknown) {
  try {
    window.localStorage.setItem(
      workflowConfigCacheKey,
      JSON.stringify(rawConfig),
    );
  } catch {
    // Storage can be unavailable in privacy modes. The bundled defaults still
    // give the page an immediate, usable first render.
  }
}

// Render bundled public styles immediately, then replace them with the cached
// and live config so Firebase startup never blocks the gallery.
export function StyleCardGrid() {
  const firebaseClients = useMemo(() => getFirebaseClients(), []);
  const [workflowConfig, setWorkflowConfig] = useState(
    defaultFigurineWorkflowConfig,
  );
  const [workflowConfigError, setWorkflowConfigError] = useState("");

  useEffect(() => {
    if (!firebaseClients) {
      return;
    }

    const cachedConfig = readCachedWorkflowConfig();
    if (cachedConfig) {
      setWorkflowConfig(cachedConfig);
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

          const normalizedConfig = normalizeFigurineWorkflowConfigResponse(
            result.data,
          );
          setWorkflowConfig(normalizedConfig);
          cacheWorkflowConfig(result.data);
          setWorkflowConfigError("");
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
          Couldn&apos;t refresh styles. Showing the most recently available
          settings.
        </p>
      ) : null}

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {styles.map((style) => <StyleCard style={style} key={style.id} />)}
      </div>
    </section>
  );
}

