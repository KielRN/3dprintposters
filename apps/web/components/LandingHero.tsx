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
          3DPrintU
        </Link>
        <Link
          href="/start"
          className={`text-sm font-semibold transition-colors ${
            solid
              ? "text-[var(--ink)] hover:text-[var(--ember)]"
              : "text-white/90 hover:text-white"
          }`}
        >
          Sign in
        </Link>
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
  const line1 = "clamp(0, calc((0.30 - var(--p, 0)) / 0.07), 1)";
  const line2 =
    "min(clamp(0, calc((var(--p, 0) - 0.30) / 0.07), 1), clamp(0, calc((0.66 - var(--p, 0)) / 0.07), 1))";
  const line3 = "clamp(0, calc((var(--p, 0) - 0.63) / 0.07), 1)";

  return (
    <>
      <LandingHeader solid={solidHeader || !scrub} />
      <div ref={sentinelRef} aria-hidden className="absolute top-0 h-1 w-full" />

      {scrub ? (
        <section ref={sectionRef} className="relative bg-[var(--ink)]">
          <div
            ref={stickyRef}
            className="sticky top-0 h-[100dvh] w-full overflow-hidden"
          >
            <canvas
              ref={canvasRef}
              aria-hidden="true"
              className="absolute inset-0 h-full w-full"
            />
            {/* legibility scrim */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(26,23,20,0.35) 0%, rgba(26,23,20,0) 28%, rgba(26,23,20,0) 55%, rgba(26,23,20,0.55) 100%)"
              }}
            />

            {/* accessible heading + CTA, visually hidden while the canvas plays */}
            <h1 className="sr-only">
              Your photo. Your figurine. Your shelf.
            </h1>
            <Link href="/start" className="sr-only">
              Start your figurine
            </Link>

            {/* visual crossfading copy */}
            <div
              aria-hidden="true"
              className="absolute inset-0 flex items-end px-5 pb-[14vh] sm:px-7 lg:px-10"
            >
              <div className="relative mx-auto w-full max-w-7xl">
                <div className="relative h-[1.1em] text-white">
                  <span
                    className="display absolute inset-0 text-[clamp(2.75rem,9vw,7rem)] leading-none"
                    style={{ opacity: line1 }}
                  >
                    Your photo.
                  </span>
                  <span
                    className="display absolute inset-0 text-[clamp(2.75rem,9vw,7rem)] leading-none"
                    style={{ opacity: line2 }}
                  >
                    Your figurine.
                  </span>
                  <span
                    className="display absolute inset-0 text-[clamp(2.75rem,9vw,7rem)] leading-none"
                    style={{ opacity: line3 }}
                  >
                    Your shelf.
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
            className="absolute inset-0 h-full w-full object-cover"
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
            <h1 className="display max-w-[14ch] text-[clamp(2.75rem,8vw,5.5rem)] leading-[0.98] text-white">
              Your photo. Your figurine. Your shelf.
            </h1>
            <div className="mt-8">
              <Link
                href="/start"
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
