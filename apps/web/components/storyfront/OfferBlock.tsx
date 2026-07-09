"use client";

import Image from "next/image";
import { AlertCircle, Loader2, Lock, ShieldCheck } from "lucide-react";
import { useState } from "react";
import manifest from "../../public/storyfront/manifest.json";

type ManifestEntry = { w: number; h: number; alt: string };
const giftPanel = (manifest as Record<string, ManifestEntry>)[
  "hero/panel-gift.webp"
];

type PaintOption = "painted" | "unpainted";

type OfferBlockProps = {
  heroName: string;
  busy: boolean;
  error?: string;
  onCheckout: (paintOption: PaintOption) => void;
};

const tiers: Array<{
  id: PaintOption;
  title: string;
  body: string;
  badge?: string;
}> = [
  {
    id: "painted",
    title: "Painted & finished",
    body: "Hand-painted by our artist, sealed, and ready to display.",
    badge: "Most loved",
  },
  {
    id: "unpainted",
    title: "Unpainted",
    body: "The clean printed sculpt, ready for your own brush.",
  },
];

// About 150 mm tall: figurine silhouette beside a coffee mug on a shared
// baseline. Hand-coded, ink strokes with one ember accent.
function SizeScale() {
  return (
    <svg
      viewBox="0 0 240 130"
      className="h-auto w-full max-w-[260px]"
      role="img"
      aria-label="The finished figurine stands about 150 millimeters tall, roughly the height of a coffee mug plus a bit"
    >
      <line
        x1="10"
        y1="120"
        x2="230"
        y2="120"
        stroke="var(--ink)"
        strokeWidth="2"
      />
      <g stroke="var(--ink)" strokeWidth="2.5" fill="none" strokeLinecap="round">
        <circle cx="60" cy="32" r="11" />
        <path d="M60 43 v34" />
        <path d="M60 52 l-14 12 M60 52 l14 12" />
        <path d="M60 77 l-11 26 M60 77 l11 26" />
        <rect x="42" y="103" width="36" height="14" rx="2.5" />
      </g>
      <g stroke="var(--ink)" strokeWidth="2.5" fill="none" strokeLinecap="round">
        <path d="M150 74 h44 v44 a2 2 0 0 1 -2 2 h-40 a2 2 0 0 1 -2 -2 z" />
        <path d="M194 82 q18 6 0 26" />
      </g>
      <g stroke="var(--ember)" strokeWidth="2" fill="none">
        <line x1="222" y1="21" x2="222" y2="120" />
        <line x1="216" y1="21" x2="228" y2="21" />
        <line x1="216" y1="120" x2="228" y2="120" />
      </g>
      <text
        x="212"
        y="66"
        fill="var(--ink)"
        fontSize="12"
        fontWeight="700"
        textAnchor="end"
      >
        150 mm
      </text>
    </svg>
  );
}

// The claim moment: finish choice, two true trust claims, honest scale, and
// the checkout CTA. No prices (final price shows at checkout), no guarantee
// copy, no urgency theater. Scene status never reaches this component.
export function OfferBlock({ heroName, busy, error, onCheckout }: OfferBlockProps) {
  const [paintOption, setPaintOption] = useState<PaintOption>("painted");

  return (
    <section className="panel grid gap-6 rounded-2xl p-6 lg:grid-cols-[1.25fr_1fr] sm:p-8">
      <div className="grid content-start gap-5">
        <h2 className="display text-2xl sm:text-3xl">Claim your hero.</h2>

        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Finish">
          {tiers.map((tier) => {
            const selected = paintOption === tier.id;
            return (
              <label
                className={`relative block cursor-pointer rounded-xl border-2 p-4 transition-colors ${
                  selected
                    ? "border-[var(--ember)] bg-[var(--ember)]/[0.04]"
                    : "border-[var(--line)] bg-white hover:border-[var(--ink)]/25"
                }`}
                key={tier.id}
              >
                {tier.badge ? (
                  <span className="absolute -top-2.5 left-4 rounded-full bg-[var(--ember)] px-2.5 py-0.5 text-xs font-bold text-white">
                    {tier.badge}
                  </span>
                ) : null}
                <input
                  className="sr-only"
                  type="radio"
                  name="paintOption"
                  value={tier.id}
                  checked={selected}
                  onChange={() => setPaintOption(tier.id)}
                />
                <span className="block font-bold">{tier.title}</span>
                <span className="mt-1 block text-sm leading-relaxed text-[var(--muted)]">
                  {tier.body}
                </span>
              </label>
            );
          })}
        </div>
        <p className="text-sm text-[var(--muted)]">Final price at checkout.</p>

        <div className="flex flex-col gap-2 border-t border-[var(--line)] pt-4 text-sm font-semibold text-[var(--muted)] sm:flex-row sm:items-center sm:gap-6">
          <span className="inline-flex items-center gap-2">
            <ShieldCheck size={16} aria-hidden="true" />
            Human print-review on every order
          </span>
          <span className="inline-flex items-center gap-2">
            <Lock size={16} aria-hidden="true" />
            Stripe-secured checkout
          </span>
        </div>

        {error ? (
          <p className="flex items-start gap-2 text-sm font-semibold text-[var(--coral)]">
            <AlertCircle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
            {error}
          </p>
        ) : null}

        <button
          className="primary-button w-full text-base"
          type="button"
          disabled={busy}
          onClick={() => onCheckout(paintOption)}
        >
          {busy ? (
            <Loader2 className="animate-spin" size={18} aria-hidden="true" />
          ) : null}
          Bring {heroName} home
        </button>
      </div>

      <div className="grid content-start gap-4">
        {giftPanel ? (
          <Image
            src="/storyfront/hero/panel-gift.webp"
            width={giftPanel.w}
            height={giftPanel.h}
            alt={giftPanel.alt}
            className="w-full rounded-xl border border-[var(--line)] object-cover"
            loading="lazy"
          />
        ) : null}
        <div className="rounded-xl border border-[var(--line)] bg-[var(--clay)]/40 p-4">
          <SizeScale />
        </div>
      </div>
    </section>
  );
}
