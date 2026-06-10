"use client";

import { getFirebaseClients } from "@/lib/firebase";
import {
  AlertCircle,
  CheckCircle2,
  FileCheck2,
  ImagePlus,
  Loader2,
  LogIn,
  LogOut,
  Sparkles,
  Upload,
  UserPlus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { ref, uploadBytes } from "firebase/storage";

const styles = [
  { id: "creative_lab_figure", label: "Creative Lab Figure" },
  { id: "gallery-relief", label: "Gallery Relief" },
  { id: "anime-poster", label: "Anime Poster" },
  { id: "cyberpunk", label: "Cyberpunk" },
  { id: "storybook", label: "Storybook" },
];

type JobState = "idle" | "ready" | "queued" | "review";
type AuthMode = "sign-in" | "create";

type CreateGenerationJobRequest = {
  jobId: string;
  sourceImagePath: string;
  selectedStyle: string;
  productType?: "poster" | "figurine";
};

type CreateGenerationJobResult = {
  jobId: string;
  status: string;
};

function sourceFilePath(uid: string, jobId: string, file: File) {
  const extension = file.type === "image/png" ? "png" : "jpg";
  return `uploads/${uid}/${jobId}/source.${extension}`;
}

export function UploadFlow() {
  const router = useRouter();
  const firebaseClients = useMemo(() => getFirebaseClients(), []);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(firebaseClients));
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [styleId, setStyleId] = useState(styles[0].id);
  const [jobState, setJobState] = useState<JobState>("idle");
  const [jobId, setJobId] = useState("");
  const [workflowError, setWorkflowError] = useState("");
  const [statusMessage, setStatusMessage] = useState(
    "Choose a photo to start.",
  );
  const selectedStyle = useMemo(
    () => styles.find((style) => style.id === styleId) ?? styles[0],
    [styleId],
  );

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

  async function submitAuth() {
    if (!firebaseClients) {
      setAuthError("Firebase is not configured for the web app yet.");
      return;
    }

    setAuthBusy(true);
    setAuthError("");

    try {
      if (authMode === "create") {
        await createUserWithEmailAndPassword(
          firebaseClients.auth,
          authEmail,
          authPassword,
        );
      } else {
        await signInWithEmailAndPassword(
          firebaseClients.auth,
          authEmail,
          authPassword,
        );
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Sign-in failed.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function continueAsGuest() {
    if (!firebaseClients) {
      setAuthError("Firebase is not configured for the web app yet.");
      return;
    }

    setAuthBusy(true);
    setAuthError("");

    try {
      await signInAnonymously(firebaseClients.auth);
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Guest sign-in failed.",
      );
    } finally {
      setAuthBusy(false);
    }
  }

  async function createGenerationJob() {
    if (!firebaseClients) {
      setWorkflowError("Firebase is not configured for uploads yet.");
      return;
    }

    if (!user) {
      setWorkflowError("Sign in before generating a poster.");
      return;
    }

    if (!selectedFile) {
      setWorkflowError("Choose a JPG or PNG before generating.");
      return;
    }

    const nextJobId = crypto.randomUUID();
    const sourceImagePath = sourceFilePath(user.uid, nextJobId, selectedFile);

    setWorkflowError("");
    setJobState("queued");
    setStatusMessage("Uploading source photo...");

    try {
      await uploadBytes(
        ref(firebaseClients.storage, sourceImagePath),
        selectedFile,
        {
          contentType: selectedFile.type,
          customMetadata: {
            originalFileName: selectedFile.name,
            selectedStyle: styleId,
          },
        },
      );

      setStatusMessage("Creating generation job...");

      const createJob = httpsCallable<
        CreateGenerationJobRequest,
        CreateGenerationJobResult
      >(firebaseClients.functions, "createGenerationJob");
      const result = await createJob({
        jobId: nextJobId,
        sourceImagePath,
        selectedStyle: styleId,
        productType:
          styleId === "creative_lab_figure" ? "figurine" : "poster",
      });

      setJobId(result.data.jobId);
      setJobState("review");
      setStatusMessage("Proof is ready for review.");
      router.push(`/jobs/${result.data.jobId}`);
    } catch (error) {
      setJobState(selectedFile ? "ready" : "idle");
      setWorkflowError(
        error instanceof Error
          ? error.message
          : "Upload or job creation failed.",
      );
      setStatusMessage("Upload did not finish.");
    }
  }

  return (
    <section className="panel flex min-w-0 flex-col rounded-lg p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-[var(--teal)]">New order</p>
          <h2 className="mt-1 text-2xl font-semibold">Create your model</h2>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--teal)] text-white">
          <ImagePlus size={22} aria-hidden="true" />
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-black/10 bg-black/[0.025] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold">Account</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {authLoading
                ? "Checking session..."
                : user
                  ? (user.email ?? "Guest session")
                  : "Sign in to upload a source photo."}
            </p>
          </div>
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
          ) : null}
        </div>

        {!firebaseClients ? (
          <p className="mt-3 rounded-lg border border-[var(--coral)]/30 bg-[var(--coral)]/10 px-3 py-2 text-sm font-semibold text-[var(--coral)]">
            Add Firebase web env values in{" "}
            <code className="break-all">apps/web/.env.local</code>.
          </p>
        ) : null}

        {firebaseClients && !authLoading && !user ? (
          <div className="mt-4 grid gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                className={
                  authMode === "sign-in" ? "primary-button" : "secondary-button"
                }
                type="button"
                onClick={() => setAuthMode("sign-in")}
              >
                <LogIn size={16} aria-hidden="true" />
                Sign in
              </button>
              <button
                className={
                  authMode === "create" ? "primary-button" : "secondary-button"
                }
                type="button"
                onClick={() => setAuthMode("create")}
              >
                <UserPlus size={16} aria-hidden="true" />
                Create
              </button>
            </div>
            <input
              className="text-input"
              type="email"
              autoComplete="email"
              placeholder="Email"
              value={authEmail}
              onChange={(event) => setAuthEmail(event.target.value)}
            />
            <input
              className="text-input"
              type="password"
              autoComplete={
                authMode === "create" ? "new-password" : "current-password"
              }
              placeholder="Password"
              value={authPassword}
              onChange={(event) => setAuthPassword(event.target.value)}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                className="primary-button"
                type="button"
                disabled={authBusy || !authEmail || authPassword.length < 6}
                onClick={submitAuth}
              >
                {authBusy ? (
                  <Loader2
                    className="animate-spin"
                    size={16}
                    aria-hidden="true"
                  />
                ) : (
                  <LogIn size={16} aria-hidden="true" />
                )}
                {authMode === "create" ? "Create account" : "Sign in"}
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={authBusy}
                onClick={continueAsGuest}
              >
                Continue as guest
              </button>
            </div>
            {authError ? (
              <p className="flex items-start gap-2 text-sm font-semibold text-[var(--coral)]">
                <AlertCircle
                  className="mt-0.5 shrink-0"
                  size={16}
                  aria-hidden="true"
                />
                {authError}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <label className="field-shell mt-6 flex min-h-40 cursor-pointer flex-col items-center justify-center px-4 py-6 text-center">
        <Upload className="text-[var(--teal)]" size={28} aria-hidden="true" />
        <span className="mt-3 text-base font-bold">
          {fileName || "Choose a source photo"}
        </span>
        <span className="mt-1 max-w-xs text-sm text-[var(--muted)]">
          JPG or PNG, portrait crops work best for the first pass.
        </span>
        <input
          className="sr-only"
          type="file"
          accept="image/png,image/jpeg"
          onChange={(event) => {
            const file = event.target.files?.[0];
            setSelectedFile(file ?? null);
            setFileName(file?.name ?? "");
            setJobState(file ? "ready" : "idle");
            setJobId("");
            setWorkflowError("");
            setStatusMessage(
              file ? "Photo ready for upload." : "Choose a photo to start.",
            );
          }}
        />
      </label>

      <div className="mt-6">
        <label className="text-sm font-bold" htmlFor="style">
          Style
        </label>
        <select
          className="mt-2 h-12 w-full rounded-lg border border-black/15 bg-white px-3 font-semibold"
          id="style"
          value={styleId}
          onChange={(event) => setStyleId(event.target.value)}
        >
          {styles.map((style) => (
            <option value={style.id} key={style.id}>
              {style.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-5 grid gap-3 rounded-lg border border-black/10 bg-black/[0.025] p-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[var(--muted)]">Selected style</span>
          <strong className="min-w-0 max-w-[58%] break-words text-right">
            {selectedStyle.label}
          </strong>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[var(--muted)]">Size</span>
          <strong className="min-w-0 max-w-[58%] break-words text-right">
            {styleId === "creative_lab_figure" ? "Preview only" : "5in x 7in"}
          </strong>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[var(--muted)]">
            {styleId === "creative_lab_figure"
              ? "Print readiness"
              : "Relief depth"}
          </span>
          <strong className="min-w-0 max-w-[58%] break-words text-right">
            {styleId === "creative_lab_figure"
              ? "Needs review"
              : "0.4mm to 3.0mm"}
          </strong>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[var(--muted)]">Status</span>
          <strong className="flex min-w-0 max-w-[58%] items-center justify-end gap-2 break-words text-right">
            {jobState === "review" ? (
              <CheckCircle2 className="shrink-0" size={16} aria-hidden="true" />
            ) : null}
            <span className="min-w-0">{statusMessage}</span>
          </strong>
        </div>
      </div>

      {workflowError ? (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--coral)]/30 bg-[var(--coral)]/10 px-3 py-2 text-sm font-semibold text-[var(--coral)]">
          <AlertCircle
            className="mt-0.5 shrink-0"
            size={16}
            aria-hidden="true"
          />
          {workflowError}
        </p>
      ) : null}

      <div className="mt-auto grid gap-3 pt-6 sm:grid-cols-2">
        <button
          className="primary-button"
          type="button"
          disabled={!fileName || !user || jobState === "queued"}
          onClick={createGenerationJob}
        >
          {jobState === "queued" ? (
            <Loader2 className="animate-spin" size={18} aria-hidden="true" />
          ) : (
            <Sparkles size={18} aria-hidden="true" />
          )}
          {jobState === "queued" ? "Working" : "Generate"}
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={jobState !== "review" || !jobId}
          onClick={() => router.push(`/jobs/${jobId}`)}
        >
          <FileCheck2 size={18} aria-hidden="true" />
          Review
        </button>
      </div>
    </section>
  );
}
