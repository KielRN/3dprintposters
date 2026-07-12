import { Check } from "lucide-react";
import Link from "next/link";

const STEPS = [
  { label: "Style", step: 1 },
  { label: "Photo", step: 2 },
  { label: "Reveal", step: 3 },
  { label: "Order", step: 4 },
] as const;

type StepPillsProps = {
  current: 1 | 2 | 3 | 4;
  styleId?: string | null;
  jobId?: string | null;
};

export function StepPills({ current, styleId, jobId }: StepPillsProps) {
  const hrefByStep: Record<1 | 2 | 3 | 4, string | null> = {
    1: "/start",
    2: styleId ? `/start/${styleId}` : null,
    3: jobId ? `/jobs/${jobId}` : null,
    4: jobId ? `/jobs/${jobId}/home` : null,
  };

  return (
    <nav
      className="hidden items-center gap-2 md:flex"
      aria-label={`Your progress: step ${current} of 4`}
    >
      {STEPS.map(({ label, step }) => {
        const stepNumber = step as 1 | 2 | 3 | 4;
        const done = stepNumber < current;
        const active = stepNumber === current;
        const href = hrefByStep[stepNumber];
        const content = (
          <>
            {done ? <Check className="mr-1" size={14} aria-hidden="true" /> : null}
            {label}
          </>
        );
        const className = active
          ? "step-pill border-transparent bg-[var(--ember)] text-white"
          : href
            ? "step-pill border-[var(--ember)]/30 bg-[var(--ember)]/10 text-[var(--ember)] hover:border-[var(--terracotta)] hover:bg-[var(--terracotta)] hover:text-white hover:-translate-y-0.5"
            : "step-pill opacity-60";

        return href && !active ? (
          <Link className={className} href={href} key={label}>
            {content}
          </Link>
        ) : (
          <span
            className={className}
            aria-current={active ? "step" : undefined}
            key={label}
          >
            {content}
          </span>
        );
      })}
    </nav>
  );
}
