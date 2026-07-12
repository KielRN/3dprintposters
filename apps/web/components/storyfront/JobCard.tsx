import Link from "next/link";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import {
  jobStatusChip,
  type JobCardSource,
  type JobChipTone,
} from "./jobPresentation";

const chipToneClasses: Record<JobChipTone, string> = {
  moss: "bg-[var(--moss)]/10 text-[var(--moss)]",
  gold: "bg-[var(--gold)]/10 text-[var(--gold)]",
  ember: "bg-[var(--ember)]/10 text-[var(--ember)]",
  coral: "bg-[var(--coral)]/10 text-[var(--coral)]",
  muted: "bg-black/[0.04] text-[var(--muted)]",
};

type JobCardProps = {
  jobId: string;
  job: JobCardSource;
  thumbnailUrl: string | null;
  styleLabel: string;
  deleting?: boolean;
  onDelete?: () => void;
};

// PrintU-parity job card: thumbnail, style chip, status chip, updated date.
export function JobCard({
  jobId,
  job,
  thumbnailUrl,
  styleLabel,
  deleting = false,
  onDelete,
}: JobCardProps) {
  const chip = jobStatusChip(job);
  const updated = job.updatedAt?.toDate?.();

  return (
    <article className="group relative overflow-hidden rounded-xl transition-transform duration-300 ease-out motion-safe:hover:-translate-y-1">
      <Link
        className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ember)] focus-visible:ring-offset-2"
        href={`/jobs/${jobId}`}
      >
        <div className="panel overflow-hidden rounded-xl">
          <div className="aspect-square overflow-hidden bg-[var(--clay)]">
            {thumbnailUrl ? (
              <img
                alt={`${styleLabel} figurine concept`}
                className="h-full w-full object-cover"
                src={thumbnailUrl}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Sparkles
                  className="text-[var(--muted)] opacity-40"
                  size={28}
                  aria-hidden="true"
                />
              </div>
            )}
          </div>
          <div className="grid gap-2 p-3">
            <p className="truncate text-sm font-bold" title={styleLabel}>
              {styleLabel}
            </p>
            <span
              className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${chipToneClasses[chip.tone]}`}
            >
              {chip.pulse ? (
                <span
                  className="chip-pulse-dot h-1.5 w-1.5 rounded-full bg-current"
                  aria-hidden="true"
                />
              ) : null}
              {chip.label}
            </span>
            {updated ? (
              <p className="text-xs text-[var(--muted)]">
                Updated{" "}
                {updated.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </p>
            ) : null}
          </div>
        </div>
      </Link>
      {onDelete ? (
        <button
          type="button"
          className="absolute right-2 top-2 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/75 bg-white/95 text-[var(--ink)] shadow-sm transition hover:bg-[var(--coral)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ember)] disabled:cursor-wait disabled:opacity-70"
          onClick={onDelete}
          disabled={deleting}
          aria-label={`Delete ${styleLabel}`}
          title={`Delete ${styleLabel}`}
        >
          {deleting ? (
            <Loader2 className="animate-spin" size={16} aria-hidden="true" />
          ) : (
            <Trash2 size={16} aria-hidden="true" />
          )}
        </button>
      ) : null}
    </article>
  );
}

