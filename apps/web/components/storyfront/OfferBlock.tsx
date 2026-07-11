"use client";

import { AlertCircle, Loader2, Lock, ShieldCheck } from "lucide-react";
import { useState } from "react";

type PaintOption = "painted" | "unpainted";

type OfferBlockProps = {
  heroName: string;
  // The customer's own unboxing render (their hero, their named base) sits
  // beside the CTA. Falls back to the approved concept until the render lands;
  // the scene is garnish and never gates checkout.
  unboxingUrl: string | null;
  conceptUrl: string | null;
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
    body: "Hand-painted by our studio artist, sealed, ready to stand on your shelf the day they arrive.",
    badge: "Most loved",
  },
  {
    id: "unpainted",
    title: "Unpainted",
    body: "The clean printed sculpt, ready for your own brush.",
  },
];

// The claim moment: finish choice, two true trust claims, the customer's own
// unboxing render, and the checkout CTA. No prices (final price shows at
// checkout), no guarantee copy, no urgency theater. Scene status never reaches
// this component.
export function OfferBlock({
  heroName,
  unboxingUrl,
  conceptUrl,
  busy,
  error,
  onCheckout,
}: OfferBlockProps) {
  const [paintOption, setPaintOption] = useState<PaintOption>("painted");

  return (
    <section className="panel grid gap-6 rounded-2xl p-6 lg:grid-cols-[1.25fr_1fr] sm:p-8">
      <div className="grid content-start gap-5">
        <h2 className="display text-2xl sm:text-3xl">Claim your hero.</h2>
        <p className="text-[var(--muted)]">
          You named them. You watched them come to life. One step left.
        </p>

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

        <p className="text-sm font-semibold text-[var(--ink)]">
          {heroName}&apos;s out of the box and ready — don&apos;t leave them
          there.
        </p>

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
        <figure className="grid gap-2">
          <div className="relative aspect-square overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--clay)]">
            {unboxingUrl ? (
              <img
                src={unboxingUrl}
                alt={`The moment ${heroName} arrives — your hero in the box, on your table`}
                className="h-full w-full object-cover"
              />
            ) : conceptUrl ? (
              <img
                src={conceptUrl}
                alt={`Your hero, ${heroName}`}
                className="h-full w-full object-contain p-6"
              />
            ) : (
              <div className="skeleton-shimmer absolute inset-0" />
            )}
          </div>
          <figcaption className="text-xs text-[var(--muted)]">
            {heroName}, the day they come home. (Artist&apos;s visualization.)
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

