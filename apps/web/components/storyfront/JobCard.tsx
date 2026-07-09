import Link from "next/link";
import { Sparkles } from "lucide-react";
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
};

// PrintU-parity job card: thumbnail, style chip, status chip, updated date.
export function JobCard({ jobId, job, thumbnailUrl, styleLabel }: JobCardProps) {
  const chip = jobStatusChip(job);
  const updated = job.updatedAt?.toDate?.();

  return (
    <Link
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ember)] focus-visible:ring-offset-2"
      href={`/jobs/${jobId}`}
    >
      <article className="panel overflow-hidden rounded-xl transition-transform duration-300 ease-out motion-safe:group-hover:-translate-y-1">
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
      </article>
    </Link>
  );
}
