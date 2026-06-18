"use client";

import { getFirebaseClients } from "@/lib/firebase";
import {
  defaultFigurineWorkflowConfig,
  normalizeFigurineWorkflowConfigResponse,
  normalizeStyleId,
  type FigurineWorkflowConfig,
  type WorkflowProductType,
  type WorkflowStyleConfig,
} from "@/lib/figurineWorkflowConfig";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  Loader2,
  LogOut,
  Plus,
  RotateCcw,
  Save,
  Shield,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { onAuthStateChanged, signInAnonymously, signOut, type User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { useEffect, useMemo, useState } from "react";

type SaveWorkflowConfigRequest = {
  config: FigurineWorkflowConfig;
};

function enabledStyleCount(styles: WorkflowStyleConfig[]) {
  return Math.max(1, styles.filter((style) => style.enabled).length);
}

export function AdminWorkflowConfig() {
  const firebaseClients = useMemo(() => getFirebaseClients(), []);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(firebaseClients));
  const [authBusy, setAuthBusy] = useState(false);
  const [configLoading, setConfigLoading] = useState(Boolean(firebaseClients));
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<FigurineWorkflowConfig>(
    defaultFigurineWorkflowConfig,
  );
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!firebaseClients) {
      setAuthLoading(false);
      setConfigLoading(false);
      return;
    }

    return onAuthStateChanged(firebaseClients.auth, (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
    });
  }, [firebaseClients]);

  useEffect(() => {
    if (!firebaseClients) {
      return;
    }

    let cancelled = false;
    const getWorkflowConfig = httpsCallable<Record<string, never>, unknown>(
      firebaseClients.functions,
      "getFigurineWorkflowConfig",
    );

    setConfigLoading(true);
    setError("");

    void getWorkflowConfig({})
      .then((result) => {
        if (!cancelled) {
          setConfig(normalizeFigurineWorkflowConfigResponse(result.data));
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Workflow config did not load.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setConfigLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [firebaseClients]);

  async function continueAsDev() {
    if (!firebaseClients) {
      setError("Firebase is not configured for the web app yet.");
      return;
    }

    setAuthBusy(true);
    setError("");

    try {
      await signInAnonymously(firebaseClients.auth);
    } catch (authError) {
      setError(
        authError instanceof Error ? authError.message : "Dev sign-in failed.",
      );
    } finally {
      setAuthBusy(false);
    }
  }

  async function saveConfig() {
    if (!firebaseClients) {
      setError("Firebase Functions are not configured yet.");
      return;
    }

    if (!user) {
      setError("Sign in before saving admin configuration.");
      return;
    }

    setSaving(true);
    setNotice("");
    setError("");

    try {
      const saveWorkflowConfig = httpsCallable<
        SaveWorkflowConfigRequest,
        unknown
      >(firebaseClients.functions, "saveFigurineWorkflowConfig");
      const result = await saveWorkflowConfig({ config });
      setConfig(normalizeFigurineWorkflowConfigResponse(result.data));
      setNotice("Workflow configuration saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Workflow configuration did not save.",
      );
    } finally {
      setSaving(false);
    }
  }

  function updateConfig(patch: Partial<FigurineWorkflowConfig>) {
    setConfig((currentConfig) => ({
      ...currentConfig,
      ...patch,
    }));
  }

  function updateStyle(index: number, patch: Partial<WorkflowStyleConfig>) {
    setConfig((currentConfig) => {
      const styles = currentConfig.styles.map((style, styleIndex) =>
        styleIndex === index ? { ...style, ...patch } : style,
      );

      return {
        ...currentConfig,
        visibleStyleCount: Math.min(
          currentConfig.visibleStyleCount,
          enabledStyleCount(styles),
        ),
        styles,
      };
    });
  }

  function addStyle() {
    setConfig((currentConfig) => {
      const styleNumber = currentConfig.styles.length + 1;
      const styles = [
        ...currentConfig.styles,
        {
          id: `style_${styleNumber}`,
          label: `Style ${styleNumber}`,
          productType: "figurine" as WorkflowProductType,
          prompt:
            "Clean full-body stylized figurine proof with smooth toy-like surfaces, clear identity, visible hands, legs, shoes, and no base.",
          enabled: true,
        },
      ];

      return {
        ...currentConfig,
        visibleStyleCount: Math.min(
          Math.max(currentConfig.visibleStyleCount, 1),
          enabledStyleCount(styles),
        ),
        styles,
      };
    });
  }

  function removeStyle(index: number) {
    setConfig((currentConfig) => {
      if (currentConfig.styles.length <= 1) {
        return currentConfig;
      }

      const styles = currentConfig.styles.filter(
        (_style, styleIndex) => styleIndex !== index,
      );

      return {
        ...currentConfig,
        visibleStyleCount: Math.min(
          currentConfig.visibleStyleCount,
          enabledStyleCount(styles),
        ),
        styles,
      };
    });
  }

  const maxVisibleStyles = enabledStyleCount(config.styles);

  return (
    <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-5 text-[var(--ink)] sm:px-7 lg:px-10">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-black/10 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            Admin
          </p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">
            Workflow controls
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {user ? (
            <button
              className="secondary-button h-10 min-h-0 px-3"
              type="button"
              onClick={() => {
                if (firebaseClients) {
                  void signOut(firebaseClients.auth);
                }
              }}
            >
              <LogOut size={16} aria-hidden="true" />
              Sign out
            </button>
          ) : (
            <button
              className="secondary-button h-10 min-h-0 px-3"
              type="button"
              disabled={!firebaseClients || authBusy}
              onClick={continueAsDev}
            >
              {authBusy ? (
                <Loader2 className="animate-spin" size={16} aria-hidden="true" />
              ) : (
                <Shield size={16} aria-hidden="true" />
              )}
              Dev sign in
            </button>
          )}
          <button
            className="secondary-button h-10 min-h-0 px-3"
            type="button"
            onClick={() => {
              setConfig(defaultFigurineWorkflowConfig);
              setNotice("");
              setError("");
            }}
          >
            <RotateCcw size={16} aria-hidden="true" />
            Defaults
          </button>
          <button
            className="primary-button h-10 min-h-0 px-3"
            type="button"
            disabled={!user || saving}
            onClick={saveConfig}
          >
            {saving ? (
              <Loader2 className="animate-spin" size={16} aria-hidden="true" />
            ) : (
              <Save size={16} aria-hidden="true" />
            )}
            Save
          </button>
        </div>
      </header>

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

      <div className="grid gap-5 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.42fr)]">
        <section className="panel rounded-lg p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <SlidersHorizontal className="text-[var(--teal)]" size={22} aria-hidden="true" />
            <h2 className="text-xl font-semibold">Proof generation</h2>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold">
              Proof options
              <input
                className="text-input"
                min={1}
                max={4}
                type="number"
                value={config.proofGenerationCount}
                onChange={(event) =>
                  updateConfig({
                    proofGenerationCount: Number.parseInt(
                      event.target.value,
                      10,
                    ),
                  })
                }
              />
            </label>
            <label className="grid gap-2 text-sm font-bold">
              Visible styles
              <input
                className="text-input"
                min={1}
                max={maxVisibleStyles}
                type="number"
                value={config.visibleStyleCount}
                onChange={(event) =>
                  updateConfig({
                    visibleStyleCount: Number.parseInt(
                      event.target.value,
                      10,
                    ),
                  })
                }
              />
            </label>
          </div>

          <label className="mt-5 grid gap-2 text-sm font-bold">
            Base proof prompt
            <textarea
              className="min-h-44 rounded-lg border border-black/15 px-3 py-3 text-sm font-normal leading-6 focus:outline-none focus:ring-2 focus:ring-[var(--teal)]/60"
              value={config.baseProofPrompt}
              onChange={(event) =>
                updateConfig({ baseProofPrompt: event.target.value })
              }
            />
          </label>
        </section>

        <section className="panel rounded-lg p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <Shield className="text-[var(--gold)]" size={22} aria-hidden="true" />
            <h2 className="text-xl font-semibold">Access</h2>
          </div>
          <div className="mt-5 grid gap-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--muted)]">Signed in</span>
              <strong className="min-w-0 max-w-[58%] break-words text-right">
                {authLoading ? "Checking" : user ? "Yes" : "No"}
              </strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--muted)]">Role gate</span>
              <strong className="min-w-0 max-w-[58%] break-words text-right">
                Placeholder
              </strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--muted)]">Required role</span>
              <strong className="min-w-0 max-w-[58%] break-words text-right">
                {config.roleGate.requiredRole}
              </strong>
            </div>
            <p className="rounded-lg border border-[var(--gold)]/30 bg-[var(--gold)]/10 px-3 py-2 font-semibold">
              {config.roleGate.note}
            </p>
          </div>
        </section>
      </div>

      <section className="pb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Eye className="text-[var(--teal)]" size={22} aria-hidden="true" />
            <h2 className="text-xl font-semibold">Styles</h2>
          </div>
          <button
            className="secondary-button h-10 min-h-0 px-3"
            type="button"
            onClick={addStyle}
          >
            <Plus size={16} aria-hidden="true" />
            Add
          </button>
        </div>

        {configLoading ? (
          <div className="mt-5 flex min-h-28 items-center justify-center gap-3 rounded-lg border border-black/10 bg-white text-sm font-bold text-[var(--muted)]">
            <Loader2 className="animate-spin" size={18} aria-hidden="true" />
            Loading workflow config
          </div>
        ) : null}

        <div className="mt-5 grid gap-4">
          {config.styles.map((style, index) => (
            <article
              className="rounded-lg border border-black/10 bg-white p-4"
              key={`${style.id}-${index}`}
            >
              <div className="grid gap-3 lg:grid-cols-[minmax(140px,0.7fr)_minmax(140px,0.7fr)_140px_88px]">
                <label className="grid gap-2 text-sm font-bold">
                  Label
                  <input
                    className="text-input"
                    value={style.label}
                    onChange={(event) => {
                      const label = event.target.value;
                      updateStyle(index, {
                        label,
                        id: style.id ? style.id : normalizeStyleId(label),
                      });
                    }}
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold">
                  Style ID
                  <input
                    className="text-input"
                    value={style.id}
                    onChange={(event) =>
                      updateStyle(index, {
                        id: normalizeStyleId(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold">
                  Product
                  <select
                    className="h-12 rounded-lg border border-black/15 bg-white px-3 font-semibold"
                    value={style.productType}
                    onChange={(event) =>
                      updateStyle(index, {
                        productType: event.target.value as WorkflowProductType,
                      })
                    }
                  >
                    <option value="figurine">Figurine</option>
                    <option value="poster">Poster</option>
                  </select>
                </label>
                <div className="flex items-end gap-2">
                  <label className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-black/10 px-3 text-sm font-bold">
                    <input
                      className="h-4 w-4 accent-[var(--teal)]"
                      checked={style.enabled}
                      type="checkbox"
                      onChange={(event) =>
                        updateStyle(index, { enabled: event.target.checked })
                      }
                    />
                    Show
                  </label>
                  <button
                    className="secondary-button h-12 min-h-0 w-12 px-0"
                    type="button"
                    disabled={config.styles.length <= 1}
                    onClick={() => removeStyle(index)}
                    title="Remove style"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <label className="mt-4 grid gap-2 text-sm font-bold">
                Style prompt
                <textarea
                  className="min-h-28 rounded-lg border border-black/15 px-3 py-3 text-sm font-normal leading-6 focus:outline-none focus:ring-2 focus:ring-[var(--teal)]/60"
                  value={style.prompt}
                  onChange={(event) =>
                    updateStyle(index, { prompt: event.target.value })
                  }
                />
              </label>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
