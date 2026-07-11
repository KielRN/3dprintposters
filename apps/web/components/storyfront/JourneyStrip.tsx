import { ArrowRight } from "lucide-react";

// Effort-made-visible: their photo became this hero. Quiet by design.
export function JourneyStrip({
  sourceUrl,
  conceptUrl,
}: {
  sourceUrl?: string;
  conceptUrl?: string;
}) {
  if (!sourceUrl && !conceptUrl) {
    return null;
  }

  return (
    <div className="flex items-center gap-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
      {sourceUrl ? (
        <img
          alt="Your photo"
          className="h-[72px] w-[72px] rounded-lg border border-[var(--line)] object-cover"
          src={sourceUrl}
        />
      ) : (
        <div className="h-[72px] w-[72px] rounded-lg bg-[var(--clay)]" aria-hidden="true" />
      )}
      <ArrowRight className="shrink-0 text-[var(--ember)]" size={18} aria-hidden="true" />
      {conceptUrl ? (
        <img
          alt="Your hero's concept"
          className="h-[72px] w-[72px] rounded-lg border border-[var(--line)] object-cover"
          src={conceptUrl}
        />
      ) : (
        <div className="h-[72px] w-[72px] rounded-lg bg-[var(--clay)]" aria-hidden="true" />
      )}
      <p className="text-sm font-semibold text-[var(--muted)]">
        Your photo became your hero.
      </p>
    </div>
  );
}

