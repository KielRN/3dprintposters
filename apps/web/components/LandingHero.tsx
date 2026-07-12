"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useFrameScrub, type FrameSet } from "@/lib/useFrameScrub";

const DESKTOP: FrameSet = { dir: "/landing/hero/desktop", count: 241 };
const MOBILE: FrameSet = { dir: "/landing/hero/mobile", count: 121 };
const STATIC_FRAME = "/landing/hero/desktop/frame-0120.webp";

function LandingHeader({ solid }: { solid: boolean }) {
  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-colors duration-300 ${
        solid ? "border-b border-[var(--line)] bg-[var(--cream)]/95 backdrop-blur" : ""
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-7 lg:px-10">
        <Link
          href="/"
          className={`display text-xl tracking-tight transition-colors ${
            solid ? "text-[var(--ink)]" : "text-white"
          }`}
        >
          3DPrintYou
        </Link>
        <nav className="flex items-center gap-4 text-sm font-semibold">
          <Link
            href="/start?auth=sign-in#account"
            className={`transition-colors ${
              solid
                ? "text-[var(--ink)] hover:text-[var(--ember)]"
                : "text-white/85 hover:text-white"
            }`}
          >
            Sign in
          </Link>
          <Link
            href="/start?auth=create#account"
            className={`transition-colors ${
              solid
                ? "text-[var(--ink)] hover:text-[var(--ember)]"
                : "text-white/90 hover:text-white"
            }`}
          >
            Create account
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function LandingHero() {
  const [scrub, setScrub] = useState(false);
  const [solidHeader, setSolidHeader] = useState(false);

  const sectionRef = useRef<HTMLElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const nav = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { saveData?: boolean };
    };
    const lowPower =
      (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2) ||
      nav.connection?.saveData === true;
    if (!reduce && !lowPower) setScrub(true);
  }, []);

  // header turns solid once the top sentinel scrolls out of view
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setSolidHeader(!entry.isIntersecting),
      { rootMargin: "-64px 0px 0px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [scrub]);

  useFrameScrub({
    canvasRef,
    scrollRef: sectionRef,
    progressRef: stickyRef,
    enabled: scrub,
    desktop: DESKTOP,
    mobile: MOBILE
  });

  // single-clamp / dual-clamp opacity windows driven by the --p scroll var
  // brand wordmark owns the opening, then fades out as the scrub begins
  const brand = "clamp(0, calc((0.16 - var(--p, 0)) / 0.08), 1)";
  const line1 = "clamp(0, calc((0.30 - var(--p, 0)) / 0.07), 1)";
  const line2 =
    "min(clamp(0, calc((var(--p, 0) - 0.30) / 0.07), 1), clamp(0, calc((0.66 - var(--p, 0)) / 0.07), 1))";
  const line3 = "clamp(0, calc((var(--p, 0) - 0.63) / 0.07), 1)";

  return (
    <>
      <LandingHeader solid={solidHeader || !scrub} />
      <div ref={sentinelRef} aria-hidden className="absolute top-0 h-1 w-full" />

      {scrub ? (
        <section ref={sectionRef} className="relative bg-[var(--cream)]">
          <div
            ref={stickyRef}
            className="sticky top-0 h-[min(100dvh,56.25vw)] w-full overflow-hidden bg-[var(--cream)]"
          >
            <canvas
              ref={canvasRef}
              aria-hidden="true"
              className="absolute inset-0 h-full w-full"
            />
            {/* thin ink rule at the base of the frame */}
            <div
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-[6px] bg-[var(--ink)]"
            />
            {/* subtle top scrim so the header + wordmark read over the frame */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-[30vh]"
              style={{
                background:
                  "linear-gradient(180deg, rgba(26,23,20,0.28) 0%, rgba(26,23,20,0) 100%)"
              }}
            />

            {/* prominent brand wordmark — the opening beat, fades on scroll */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-[16vh] flex justify-center px-5"
            >
              <span
                className="display text-center text-[clamp(3rem,13vw,9.5rem)] leading-[0.9] text-[var(--ember)]"
                style={{ opacity: brand }}
              >
                3DPrintYou
              </span>
            </div>

            {/* accessible heading + CTA, visually hidden while the canvas plays */}
            <h1 className="sr-only">
              From a photo. To a hero. Yours to hold.
            </h1>
            <Link href="/start?auth=create#account" className="sr-only">
              Start your figurine
            </Link>

            {/* visual crossfading copy — inside the frame, lower-left, ink */}
            <div
              aria-hidden="true"
              className="absolute inset-x-0 bottom-[6vh] px-5 sm:px-7 lg:px-10"
            >
              <div className="mx-auto w-full max-w-7xl">
                <div className="grid text-[var(--ink)]">
                  <span
                    className="display col-start-1 row-start-1 text-[clamp(1.5rem,4.6vw,3.25rem)] leading-none"
                    style={{ opacity: line1 }}
                  >
                    From a photo.
                  </span>
                  <span
                    className="display col-start-1 row-start-1 text-[clamp(1.5rem,4.6vw,3.25rem)] leading-none"
                    style={{ opacity: line2 }}
                  >
                    To a hero.
                  </span>
                  <span
                    className="display col-start-1 row-start-1 text-[clamp(1.5rem,4.6vw,3.25rem)] leading-none"
                    style={{ opacity: line3 }}
                  >
                    Yours to hold.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="relative min-h-[100dvh] overflow-hidden bg-[var(--ink)]">
          <img
            src={STATIC_FRAME}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-contain object-top"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(26,23,20,0.4) 0%, rgba(26,23,20,0) 40%, rgba(26,23,20,0.65) 100%)"
            }}
          />
          <div className="relative mx-auto flex min-h-[100dvh] max-w-7xl flex-col justify-end px-5 pb-[12vh] pt-24 sm:px-7 lg:px-10">
            <p
              aria-hidden="true"
              className="display text-[clamp(3rem,11vw,7rem)] leading-[0.9] text-[var(--ember)]"
            >
              3DPrintYou
            </p>
            <h1 className="display mt-6 max-w-[14ch] text-[clamp(1.75rem,4.5vw,3rem)] leading-[1.02] text-white/90">
              From a photo. To a hero. Yours to hold.
            </h1>
            <div className="mt-8">
              <Link
                href="/start?auth=create#account"
                className="primary-button h-12 px-7 text-base"
              >
                Start your figurine
              </Link>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

