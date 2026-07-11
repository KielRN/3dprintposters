"use client";

import { useEffect, useState } from "react";

// Page-3 hero: the concept image staged as an object, not a flat file.
// Perceptual sculpting is 2D only: clay mat, warm vignette, directional soft
// shadow (key light upper-left, shadow lower-right), and an offset back frame
// for depth. The win moment runs once per job and respects reduced motion.
export function ConceptStage({
  jobId,
  imageUrl,
  heroName,
}: {
  jobId: string;
  imageUrl: string;
  heroName: string;
}) {
  const [winMoment, setWinMoment] = useState(false);

  useEffect(() => {
    const key = `storyfront-reveal-${jobId}`;
    try {
      const seen = sessionStorage.getItem(key);
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (!seen && !reducedMotion) {
        setWinMoment(true);
      }
      sessionStorage.setItem(key, "1");
    } catch {
      // Storage unavailable (private mode): show the staged frame statically.
    }
  }, [jobId]);

  return (
    <section className="relative overflow-hidden rounded-2xl bg-[var(--clay)]/60 p-6 sm:p-10">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(26,23,20,0.10))]"
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-[440px]">
        <p
          className={`text-sm font-bold text-[var(--ember)] ${
            winMoment ? "reveal" : ""
          }`}
          data-shown="true"
        >
          You made this.
        </p>
        <h1 className="display mt-1 text-3xl sm:text-4xl">
          Meet {heroName}.
        </h1>
        <div className="relative mt-5">
          <div
            className="absolute inset-0 -z-10 translate-x-3 translate-y-3 rounded-xl border-2 border-[var(--ink)]/15"
            aria-hidden="true"
          />
          <figure
            className={`rounded-xl border-[3px] border-[var(--ink)] bg-white p-2 shadow-[14px_22px_40px_rgba(26,23,20,0.28)] ${
              winMoment ? "reveal-win" : ""
            }`}
          >
            <img
              alt={`Your hero's concept: ${heroName}`}
              className="w-full rounded-lg object-contain"
              src={imageUrl}
            />
          </figure>
        </div>
      </div>
    </section>
  );
}

