"use client";

import type { FirebaseClients } from "@/lib/firebase";
import type { WorkflowStyleConfig } from "@/lib/figurineWorkflowConfig";
import { AlertCircle, Loader2, Sparkles, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { ref, uploadBytes } from "firebase/storage";

type JobState = "idle" | "ready" | "queued";

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

type UploadPanelProps = {
  style: WorkflowStyleConfig; // preselected and locked to the route
  user: User | null;
  firebaseClients: FirebaseClients | null;
};

function sourceFilePath(uid: string, jobId: string, file: File) {
  const extension = file.type === "image/png" ? "png" : "jpg";
  return `uploads/${uid}/${jobId}/source.${extension}`;
}

// Photo dropzone + generation-job creation. The style is locked to the
// route; drag-and-drop joins tap-to-pick.
export function UploadPanel({ style, user, firebaseClients }: UploadPanelProps) {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [jobState, setJobState] = useState<JobState>("idle");
  const [workflowError, setWorkflowError] = useState("");
  const [statusMessage, setStatusMessage] = useState(
    "Choose a photo to start.",
  );

  useEffect(() => {
    return () => {
      if (sourcePreviewUrl) {
        URL.revokeObjectURL(sourcePreviewUrl);
      }
    };
  }, [sourcePreviewUrl]);

  function handleFile(file: File | null) {
    if (file && file.type !== "image/png" && file.type !== "image/jpeg") {
      setWorkflowError("Choose a JPG or PNG photo.");
      return;
    }

    setSelectedFile(file);
    setFileName(file?.name ?? "");
    setSourcePreviewUrl(file ? URL.createObjectURL(file) : "");
    setJobState(file ? "ready" : "idle");
    setWorkflowError("");
    setStatusMessage(
      file ? "Photo ready for upload." : "Choose a photo to start.",
    );
  }

  async function createGenerationJob() {
    if (!firebaseClients) {
      setWorkflowError("Firebase is not configured for uploads yet.");
      return;
    }

    if (!user) {
      setWorkflowError("Sign in before creating your figurine.");
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
    setStatusMessage("You've started the transformation…");

    try {
      await uploadBytes(
        ref(firebaseClients.storage, sourceImagePath),
        selectedFile,
        {
          contentType: selectedFile.type,
          customMetadata: {
            originalFileName: selectedFile.name,
            selectedStyle: style.id,
            selectedStyleLabel: style.label,
          },
        },
      );

      // Template-face-swap styles run the face swap plus the Meshy prototype
      // inside this callable, so the client timeout must cover minutes, not
      // the SDK's 70-second default.
      const createJob = httpsCallable<
        CreateGenerationJobRequest,
        CreateGenerationJobResult
      >(firebaseClients.functions, "createGenerationJob", {
        timeout: 540_000,
      });
      const result = await createJob({
        jobId: nextJobId,
        sourceImagePath,
        selectedStyle: style.id,
        productType: style.productType,
      });

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
    <div className="flex min-w-0 flex-col">
      <label
        className="field-shell flex min-h-40 cursor-pointer flex-col overflow-hidden text-center"
        data-drag={dragActive || undefined}
        style={dragActive ? { background: "rgba(63, 107, 76, 0.14)" } : undefined}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          handleFile(event.dataTransfer.files?.[0] ?? null);
        }}
      >
        {sourcePreviewUrl ? (
          <span className="grid gap-3 p-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center sm:text-left">
            <span className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md bg-white sm:aspect-[4/5]">
              <img
                alt={`Selected source photo: ${fileName}`}
                className="h-full w-full object-contain"
                src={sourcePreviewUrl}
              />
            </span>
            <span className="flex min-w-0 flex-col items-center justify-center px-1 py-2 sm:items-start">
              <Upload
                className="text-[var(--moss)]"
                size={26}
                aria-hidden="true"
              />
              <span className="mt-3 max-w-full break-words text-base font-bold">
                {fileName}
              </span>
              <span className="mt-1 max-w-xs text-sm text-[var(--muted)]">
                One person, face visible, head to feet works best.
              </span>
            </span>
          </span>
        ) : (
          <span className="flex min-h-40 flex-col items-center justify-center px-4 py-6">
            <Upload
              className="text-[var(--moss)]"
              size={28}
              aria-hidden="true"
            />
            <span className="mt-3 text-base font-bold">
              Drop a photo here, or tap to choose
            </span>
            <span className="mt-1 max-w-xs text-sm text-[var(--muted)]">
              JPG or PNG. One person, face visible, head to feet works best.
            </span>
          </span>
        )}
        <input
          className="sr-only"
          type="file"
          accept="image/png,image/jpeg"
          onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
        />
      </label>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-black/[0.025] px-4 py-3 text-sm">
        <span className="text-[var(--muted)]">Status</span>
        <strong className="min-w-0 text-right">{statusMessage}</strong>
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

      <div className="mt-5 grid gap-2">
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
          Create my figurine
        </button>
        <p className="text-center text-sm text-[var(--muted)]">
          {style.proofMode === "template_face_swap"
            ? "This takes a few minutes. We'll take you straight to your preview."
            : "We'll take you to your preview as soon as it's ready."}
        </p>
      </div>
    </div>
  );
}
