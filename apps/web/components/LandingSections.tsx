"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";

function Reveal({
  children,
  className = "",
  delay = 0
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-shown={shown}
      className={`reveal ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

const steps = [
  {
    n: "1",
    title: "Upload a photo",
    body: "Send us one clear picture. A front-facing shot with good light gives the best result."
  },
  {
    n: "2",
    title: "Approve the proof",
    body: "We generate a 3D proof from your photo. Nothing prints until you say it looks right."
  },
  {
    n: "3",
    title: "We print and ship",
    body: "Your figurine is printed to order, inspected, and shipped to your door."
  }
];

const gallery = [
  { seed: "figurine-portrait-warm", label: "Portrait, 5 in" },
  { seed: "figurine-family-group", label: "The whole family" },
  { seed: "figurine-pet-companion", label: "Pets, too" },
  { seed: "figurine-couple-keepsake", label: "Anniversary" },
  { seed: "figurine-child-milestone", label: "First birthday" },
  { seed: "figurine-portrait-studio", label: "Studio finish" }
];

export function LandingSections() {
  return (
    <div className="bg-[var(--cream)] text-[var(--ink)]">
      {/* How it works */}
      <section className="mx-auto max-w-7xl px-5 py-28 sm:px-7 lg:px-10">
        <Reveal>
          <h2 className="display max-w-[18ch] text-[clamp(2rem,5vw,3.5rem)] leading-[1.02]">
            Three steps to a shelf-worthy keepsake.
          </h2>
        </Reveal>
        <div className="mt-16 grid gap-12 md:grid-cols-3 md:gap-10">
          {steps.map((step, i) => (
            <Reveal key={step.n} delay={i * 90}>
              <div className="border-t border-[var(--line)] pt-6">
                <span className="display block text-5xl text-[var(--ember)]">
                  {step.n}
                </span>
                <h3 className="mt-5 text-xl font-bold">{step.title}</h3>
                <p className="mt-3 max-w-[34ch] leading-relaxed text-[var(--muted)]">
                  {step.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Gallery strip — drifts horizontally with scroll where supported */}
      <section className="overflow-hidden py-10">
        <Reveal className="mx-auto max-w-7xl px-5 sm:px-7 lg:px-10">
          <h2 className="display text-[clamp(1.75rem,4vw,2.75rem)] leading-tight">
            A few we have made.
          </h2>
        </Reveal>
        <div className="gallery-drift mt-10 flex w-max gap-5 px-5 sm:px-7 lg:px-10">
          {gallery.map((tile) => (
            <figure
              key={tile.seed}
              className="w-[clamp(220px,40vw,360px)] shrink-0"
            >
              <div className="aspect-[4/5] overflow-hidden rounded-xl border border-[var(--clay)] bg-[var(--clay)]">
                {/* placeholder photography — real figurine shots are a follow-up */}
                <img
                  src={`https://picsum.photos/seed/${tile.seed}/720/900`}
                  alt={`Example figurine: ${tile.label}`}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </div>
              <figcaption className="mt-3 text-sm font-semibold text-[var(--muted)]">
                {tile.label}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Why 3DPrintU */}
      <section className="mx-auto max-w-7xl px-5 py-28 sm:px-7 lg:px-10">
        <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
          <Reveal>
            <h2 className="display text-[clamp(2rem,5vw,3.5rem)] leading-[1.02]">
              Why 3DPrintU
            </h2>
            <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-[var(--ink)]/80">
              A framed photo flattens a person into glass. A figurine you can
              pick up, hand to a grandparent, set on a desk. We turn a single
              picture into something with weight and presence.
            </p>
            <p className="mt-4 max-w-[46ch] leading-relaxed text-[var(--muted)]">
              Every order is made to order and inspected before it ships. No
              minimums, no studio visit, no special equipment on your end.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <div className="aspect-[4/5] overflow-hidden rounded-2xl border border-[var(--clay)] bg-[var(--clay)]">
              <img
                src="https://picsum.photos/seed/figurine-hands-holding-keepsake/900/1125"
                alt="A finished figurine held in two hands"
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Final CTA band */}
      <section className="bg-[var(--ember)]">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-8 px-5 py-24 sm:px-7 md:flex-row md:items-center md:justify-between lg:px-10">
          <h2 className="display max-w-[12ch] text-[clamp(2.5rem,7vw,5rem)] leading-[0.95] text-[var(--cream)]">
            Make yours.
          </h2>
          <Link
            href="/start"
            className="inline-flex min-h-[56px] items-center justify-center rounded-lg bg-[var(--cream)] px-9 text-lg font-extrabold text-[var(--ink)] transition-transform hover:-translate-y-0.5"
          >
            Start
          </Link>
        </div>
      </section>
    </div>
  );
}
