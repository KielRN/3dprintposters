"use client";

import { CreditCard, ImagePlus, Sparkles, Upload } from "lucide-react";
import { useMemo, useState } from "react";

const styles = [
  { id: "gallery-relief", label: "Gallery Relief" },
  { id: "anime-poster", label: "Anime Poster" },
  { id: "cyberpunk", label: "Cyberpunk" },
  { id: "storybook", label: "Storybook" }
];

type JobState = "idle" | "ready" | "queued" | "checkout";

export function UploadFlow() {
  const [fileName, setFileName] = useState("");
  const [styleId, setStyleId] = useState(styles[0].id);
  const [jobState, setJobState] = useState<JobState>("idle");
  const selectedStyle = useMemo(
    () => styles.find((style) => style.id === styleId) ?? styles[0],
    [styleId]
  );

  async function createMockJob() {
    const formData = new FormData();
    formData.set("style", styleId);
    formData.set("fileName", fileName);

    setJobState("queued");
    await fetch("/api/jobs", {
      method: "POST",
      body: formData
    });
    setJobState("checkout");
  }

  async function startCheckout() {
    const response = await fetch("/api/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jobId: "local-preview-job"
      })
    });
    const payload = (await response.json()) as { url?: string; error?: string };

    if (payload.url) {
      window.location.assign(payload.url);
      return;
    }

    alert(payload.error ?? "Checkout is not configured yet.");
  }

  return (
    <section className="panel flex flex-col rounded-lg p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-[var(--teal)]">New order</p>
          <h2 className="mt-1 text-2xl font-semibold">Create your poster</h2>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--teal)] text-white">
          <ImagePlus size={22} aria-hidden="true" />
        </div>
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
            setFileName(file?.name ?? "");
            setJobState(file ? "ready" : "idle");
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
          <strong>{selectedStyle.label}</strong>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[var(--muted)]">Size</span>
          <strong>8.5in x 11in</strong>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[var(--muted)]">Relief depth</span>
          <strong>0.4mm to 3.0mm</strong>
        </div>
      </div>

      <div className="mt-auto grid gap-3 pt-6 sm:grid-cols-2">
        <button
          className="primary-button"
          type="button"
          disabled={!fileName || jobState === "queued"}
          onClick={createMockJob}
        >
          <Sparkles size={18} aria-hidden="true" />
          {jobState === "queued" ? "Queued" : "Generate"}
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={jobState !== "checkout"}
          onClick={startCheckout}
        >
          <CreditCard size={18} aria-hidden="true" />
          Checkout
        </button>
      </div>
    </section>
  );
}
