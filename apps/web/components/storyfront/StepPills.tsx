import { Check } from "lucide-react";

// Canonical funnel steps (storyfront voice contract): Style · Photo · Reveal · Home.
const STEPS = ["Style", "Photo", "Reveal", "Home"] as const;

export function StepPills({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <nav
      className="hidden items-center gap-2 md:flex"
      aria-label={`Your progress: step ${current} of 4`}
    >
      {STEPS.map((step, index) => {
        const stepNumber = (index + 1) as 1 | 2 | 3 | 4;
        const done = stepNumber < current;
        const active = stepNumber === current;

        return (
          <span
            className={
              active
                ? "step-pill border-transparent bg-[var(--ember)] text-white"
                : done
                  ? "step-pill text-[var(--ink)]"
                  : "step-pill"
            }
            aria-current={active ? "step" : undefined}
            key={step}
          >
            {done ? <Check className="mr-1" size={14} aria-hidden="true" /> : null}
            {step}
          </span>
        );
      })}
    </nav>
  );
}

