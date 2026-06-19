"use client";

import { getFirebaseClients } from "@/lib/firebase";
import {
  defaultFigurineWorkflowConfig,
  maxWorkflowStyleReferenceImageBytes,
  maxWorkflowStyleReferenceImages,
  normalizeFigurineWorkflowConfigResponse,
  normalizeReferenceImageId,
  normalizeStyleId,
  type FigurineWorkflowConfig,
  type WorkflowProductType,
  type WorkflowStyleReferenceImage,
  type WorkflowStyleConfig,
} from "@/lib/figurineWorkflowConfig";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  House,
  Image as ImageIcon,
  ImagePlus,
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
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SaveWorkflowConfigRequest = {
  config: FigurineWorkflowConfig;
};

type AdminWorkflowConfigProps = {
  authLoading?: boolean;
  embedded?: boolean;
  user?: User | null;
};

function enabledStyleCount(styles: WorkflowStyleConfig[]) {
  return Math.max(1, styles.filter((style) => style.enabled).length);
}

function referenceImageStoragePath(input: {
  styleId: string;
  imageId: string;
  mimeType: WorkflowStyleReferenceImage["mimeType"];
}) {
  const extension = input.mimeType === "image/png" ? "png" : "jpg";
  return `admin/workflow-style-references/${input.styleId}/${input.imageId}.${extension}`;
}

function referenceImageLabel(fileName: string) {
  return (
    fileName
      .replace(/\.[^.]+$/, "")
      .replaceAll(/[_-]+/g, " ")
      .trim()
      .slice(0, 80) || "Reference image"
  );
}

export function AdminWorkflowConfig({
  authLoading: externalAuthLoading = false,
  embedded = false,
  user: externalUser,
}: AdminWorkflowConfigProps = {}) {
  const firebaseClients = useMemo(() => getFirebaseClients(), []);
  const usesExternalAuth = embedded || externalUser !== undefined;
  const [internalUser, setInternalUser] = useState<User | null>(null);
  const [internalAuthLoading, setInternalAuthLoading] = useState(
    Boolean(firebaseClients),
  );
  const [authBusy, setAuthBusy] = useState(false);
  const [configLoading, setConfigLoading] = useState(Boolean(firebaseClients));
  const [saving, setSaving] = useState(false);
  const [referenceUploadBusyKey, setReferenceUploadBusyKey] = useState("");
  const [referenceImageUrls, setReferenceImageUrls] = useState<
    Record<string, string>
  >({});
  const [config, setConfig] = useState<FigurineWorkflowConfig>(
    defaultFigurineWorkflowConfig,
  );
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const user = usesExternalAuth ? (externalUser ?? null) : internalUser;
  const authLoading = usesExternalAuth
    ? externalAuthLoading
    : internalAuthLoading;

  useEffect(() => {
    if (usesExternalAuth) {
      setInternalAuthLoading(false);
      return;
    }

    if (!firebaseClients) {
      setInternalAuthLoading(false);
      setConfigLoading(false);
      return;
    }

    return onAuthStateChanged(firebaseClients.auth, (nextUser) => {
      setInternalUser(nextUser);
      setInternalAuthLoading(false);
    });
  }, [firebaseClients, usesExternalAuth]);

  useEffect(() => {
    if (!firebaseClients || authLoading) {
      return;
    }

    if (!user) {
      setConfig(defaultFigurineWorkflowConfig);
      setReferenceImageUrls({});
      setConfigLoading(false);
      return;
    }

    let cancelled = false;
    const getWorkflowConfig = httpsCallable<Record<string, never>, unknown>(
      firebaseClients.functions,
      "getAdminFigurineWorkflowConfig",
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
  }, [authLoading, firebaseClients, user]);

  const referenceImagePaths = useMemo(
    () =>
      Array.from(
        new Set(
          config.styles.flatMap((style) =>
            style.referenceImages.map((image) => image.storagePath),
          ),
        ),
      ),
    [config.styles],
  );
  const referenceImagePathKey = referenceImagePaths.join("|");

  useEffect(() => {
    if (!firebaseClients) {
      return;
    }

    if (referenceImagePaths.length === 0) {
      setReferenceImageUrls({});
      return;
    }

    let cancelled = false;

    void Promise.all(
      referenceImagePaths.map(async (storagePath) => {
        try {
          return [
            storagePath,
            await getDownloadURL(ref(firebaseClients.storage, storagePath)),
          ] as const;
        } catch {
          return [storagePath, ""] as const;
        }
      }),
    ).then((entries) => {
      if (!cancelled) {
        setReferenceImageUrls(Object.fromEntries(entries));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [firebaseClients, referenceImagePathKey, referenceImagePaths]);

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
          referenceImages: [],
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

  function updateStyleReferenceImage(
    styleIndex: number,
    imageIndex: number,
    patch: Partial<WorkflowStyleReferenceImage>,
  ) {
    setConfig((currentConfig) => ({
      ...currentConfig,
      styles: currentConfig.styles.map((style, currentStyleIndex) =>
        currentStyleIndex === styleIndex
          ? {
              ...style,
              referenceImages: style.referenceImages.map(
                (referenceImage, currentImageIndex) =>
                  currentImageIndex === imageIndex
                    ? { ...referenceImage, ...patch }
                    : referenceImage,
              ),
            }
          : style,
      ),
    }));
  }

  function removeStyleReferenceImage(styleIndex: number, imageIndex: number) {
    setConfig((currentConfig) => ({
      ...currentConfig,
      styles: currentConfig.styles.map((style, currentStyleIndex) =>
        currentStyleIndex === styleIndex
          ? {
              ...style,
              referenceImages: style.referenceImages.filter(
                (_referenceImage, currentImageIndex) =>
                  currentImageIndex !== imageIndex,
              ),
            }
          : style,
      ),
    }));
  }

  async function uploadStyleReferenceImage(styleIndex: number, file: File) {
    if (!firebaseClients) {
      setError("Firebase Storage is not configured for reference uploads.");
      return;
    }

    if (!user) {
      setError("Sign in before uploading reference images.");
      return;
    }

    const style = config.styles[styleIndex];
    if (!style) {
      setError("Style was not found.");
      return;
    }

    if (style.referenceImages.length >= maxWorkflowStyleReferenceImages) {
      setError(
        `Each style can use up to ${maxWorkflowStyleReferenceImages} reference images.`,
      );
      return;
    }

    if (file.type !== "image/jpeg" && file.type !== "image/png") {
      setError("Reference images must be JPG or PNG files.");
      return;
    }

    if (file.size > maxWorkflowStyleReferenceImageBytes) {
      setError("Reference images must be 5 MB or smaller.");
      return;
    }

    const styleId =
      normalizeStyleId(style.id || style.label) || `style_${styleIndex + 1}`;
    const imageId = normalizeReferenceImageId(crypto.randomUUID());
    const mimeType = file.type as WorkflowStyleReferenceImage["mimeType"];
    const storagePath = referenceImageStoragePath({
      styleId,
      imageId,
      mimeType,
    });
    const busyKey = `${styleIndex}:${imageId}`;

    setReferenceUploadBusyKey(busyKey);
    setNotice("");
    setError("");

    try {
      const storageRef = ref(firebaseClients.storage, storagePath);
      await uploadBytes(storageRef, file, {
        contentType: mimeType,
        customMetadata: {
          styleId,
          imageId,
          originalFileName: file.name,
          workflow: "figurine-style-reference",
        },
      });

      const downloadUrl = await getDownloadURL(storageRef);
      const referenceImage: WorkflowStyleReferenceImage = {
        id: imageId,
        label: referenceImageLabel(file.name),
        storagePath,
        mimeType,
        enabled: true,
      };

      updateStyle(styleIndex, {
        referenceImages: [...style.referenceImages, referenceImage],
      });
      setReferenceImageUrls((currentUrls) => ({
        ...currentUrls,
        [storagePath]: downloadUrl,
      }));
      setNotice("Reference image uploaded. Save to use it in proof prompts.");
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Reference image upload failed.",
      );
    } finally {
      setReferenceUploadBusyKey("");
    }
  }

  const maxVisibleStyles = enabledStyleCount(config.styles);

  return (
    <section
      className={
        embedded
          ? "flex w-full flex-col text-[var(--ink)]"
          : "mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-5 text-[var(--ink)] sm:px-7 lg:px-10"
      }
    >
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
          {!embedded ? (
            <>
              <Link className="secondary-button h-10 min-h-0 px-3" href="/">
                <House size={16} aria-hidden="true" />
                Home
              </Link>
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
                    <Loader2
                      className="animate-spin"
                      size={16}
                      aria-hidden="true"
                    />
                  ) : (
                    <Shield size={16} aria-hidden="true" />
                  )}
                  Dev sign in
                </button>
              )}
            </>
          ) : null}
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
              <div className="mt-4 grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <ImageIcon
                      className="text-[var(--teal)]"
                      size={16}
                      aria-hidden="true"
                    />
                    Reference images
                    <span className="text-xs font-semibold text-[var(--muted)]">
                      {style.referenceImages.length}/
                      {maxWorkflowStyleReferenceImages}
                    </span>
                  </div>
                  <label
                    className={`secondary-button h-10 min-h-0 px-3 ${
                      !user ||
                      style.referenceImages.length >=
                        maxWorkflowStyleReferenceImages
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer"
                    }`}
                  >
                    {referenceUploadBusyKey.startsWith(`${index}:`) ? (
                      <Loader2
                        className="animate-spin"
                        size={16}
                        aria-hidden="true"
                      />
                    ) : (
                      <ImagePlus size={16} aria-hidden="true" />
                    )}
                    Add image
                    <input
                      className="sr-only"
                      accept="image/png,image/jpeg"
                      disabled={
                        !user ||
                        style.referenceImages.length >=
                          maxWorkflowStyleReferenceImages ||
                        referenceUploadBusyKey.startsWith(`${index}:`)
                      }
                      type="file"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.currentTarget.value = "";
                        if (file) {
                          void uploadStyleReferenceImage(index, file);
                        }
                      }}
                    />
                  </label>
                </div>

                {style.referenceImages.length > 0 ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {style.referenceImages.map((referenceImage, imageIndex) => {
                      const imageUrl =
                        referenceImageUrls[referenceImage.storagePath];

                      return (
                        <div
                          className="grid min-h-24 grid-cols-[72px_minmax(0,1fr)_auto] gap-3 rounded-lg border border-black/10 p-3"
                          key={`${referenceImage.id}-${imageIndex}`}
                        >
                          {imageUrl ? (
                            <img
                              alt={referenceImage.label}
                              className="h-[72px] w-[72px] rounded-md object-cover"
                              src={imageUrl}
                            />
                          ) : (
                            <div className="flex h-[72px] w-[72px] items-center justify-center rounded-md bg-black/5 text-[var(--muted)]">
                              <ImageIcon size={20} aria-hidden="true" />
                            </div>
                          )}
                          <div className="grid min-w-0 gap-2">
                            <input
                              className="h-10 rounded-lg border border-black/15 px-3 text-sm font-semibold"
                              value={referenceImage.label}
                              onChange={(event) =>
                                updateStyleReferenceImage(index, imageIndex, {
                                  label: event.target.value.slice(0, 80),
                                })
                              }
                            />
                            <span className="truncate text-xs font-semibold text-[var(--muted)]">
                              {referenceImage.mimeType}
                            </span>
                          </div>
                          <div className="flex flex-col gap-2">
                            <label
                              className="flex h-10 w-12 items-center justify-center rounded-lg border border-black/10"
                              title="Use reference"
                            >
                              <input
                                className="h-4 w-4 accent-[var(--teal)]"
                                checked={referenceImage.enabled}
                                type="checkbox"
                                onChange={(event) =>
                                  updateStyleReferenceImage(
                                    index,
                                    imageIndex,
                                    { enabled: event.target.checked },
                                  )
                                }
                              />
                            </label>
                            <button
                              className="secondary-button h-10 min-h-0 w-12 px-0"
                              type="button"
                              title="Remove reference"
                              onClick={() =>
                                removeStyleReferenceImage(index, imageIndex)
                              }
                            >
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex min-h-16 items-center justify-center rounded-lg border border-dashed border-black/15 text-sm font-semibold text-[var(--muted)]">
                    No reference images
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
