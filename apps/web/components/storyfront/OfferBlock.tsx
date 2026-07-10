"use client";

import { AlertCircle, Loader2, Lock, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { unboxingSceneAlt } from "./SceneStage";

type PaintOption = "painted" | "unpainted";

type ScenePreviewState = {
  status?: string;
  storagePath?: string;
};

type OfferBlockProps = {
  heroName: string;
  busy: boolean;
  error?: string;
  unboxingScene?: ScenePreviewState;
  unboxingUrl: string | null;
  conceptUrl: string | null;
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
      <g fill="var(--ink)">
        <circle cx="60" cy="30" r="10" />
        <path d="M60 41 c-9 0 -15 5 -16 13 l-3 26 c-0.5 5 2 8 6 8 h4 l2 15 h14 l2 -15 h4 c4 0 6.5 -3 6 -8 l-3 -26 c-1 -8 -7 -13 -16 -13 z" />
        <path d="M47 46 l-8 42 6 3 8 -34 z" opacity="0.85" />
        <rect x="40" y="103" width="40" height="14" rx="2.5" />
      </g>
      <g
        stroke="var(--ink)"
        strokeWidth="2.5"
        fill="var(--clay)"
        strokeLinecap="round"
      >
        <path d="M150 74 h44 v44 a2 2 0 0 1 -2 2 h-40 a2 2 0 0 1 -2 -2 z" />
        <path d="M194 82 q18 6 0 26" fill="none" />
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

type ClaimMediaProps = {
  heroName: string;
  scene: ScenePreviewState | undefined;
  sceneUrl: string | null;
  conceptUrl: string | null;
};

// The object of the transaction: the customer's own hero packed in its box,
// grounded with a warm cast shadow (upper-left key light, like every render
// on the page). Pending shimmers quietly; a failed render falls back to the
// approved concept; nothing here may ever gate or alarm the checkout.
function ClaimMedia({ heroName, scene, sceneUrl, conceptUrl }: ClaimMediaProps) {
  if (scene?.status === "ready" && sceneUrl) {
    return (
      <figure className="grid gap-2.5">
        <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--clay)] shadow-[10px_16px_36px_rgba(26,23,20,0.18)]">
          <img
            alt={unboxingSceneAlt(heroName)}
            className="block w-full"
            src={sceneUrl}
          />
        </div>
        <figcaption className="text-sm text-[var(--muted)]">
          Artist&apos;s visualization — {heroName}, packed and waiting.
        </figcaption>
      </figure>
    );
  }

  if (scene?.status === "failed") {
    if (!conceptUrl) {
      return null;
    }
    return (
      <figure className="grid gap-2.5">
        <div className="rounded-2xl border border-[var(--line)] bg-white p-3 shadow-[10px_16px_36px_rgba(26,23,20,0.18)]">
          <img
            alt={`Approved figurine concept for ${heroName}`}
            className="block w-full rounded-xl"
            src={conceptUrl}
          />
        </div>
        <figcaption className="text-sm text-[var(--muted)]">
          Approved and ready to print.
        </figcaption>
      </figure>
    );
  }

  return (
    <div
      className="skeleton-shimmer aspect-square rounded-2xl border border-[var(--line)]"
      aria-hidden="true"
    />
  );
}

// The claim moment: the customer's own hero in its box beside the finish
// choice, two true trust claims, honest scale, and the checkout CTA. No
// prices (final price shows at checkout), no guarantee copy, no urgency
// theater. The unboxing render is garnish — it never gates the CTA.
export function OfferBlock({
  heroName,
  busy,
  error,
  unboxingScene,
  unboxingUrl,
  conceptUrl,
  onCheckout,
}: OfferBlockProps) {
  const [paintOption, setPaintOption] = useState<PaintOption>("painted");

  return (
    <section className="panel grid gap-6 rounded-2xl p-6 sm:p-8">
      <h2 className="display text-2xl sm:text-3xl">Claim your hero.</h2>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        {/* On mobile the object precedes the decision: image first, then the
            finish choice and CTA. On desktop the decision block centers
            vertically against the taller media stack. */}
        <div className="order-last grid content-start gap-5 lg:order-none lg:content-center">
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Finish">
            {tiers.map((tier) => {
              const selected = paintOption === tier.id;
              return (
                <label
                  className={`relative block cursor-pointer rounded-xl border-2 p-4 transition-all duration-200 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ember)] ${
                    selected
                      ? "-translate-y-0.5 border-[var(--ember)] bg-gradient-to-b from-white to-[var(--ember)]/[0.06] shadow-[0_10px_24px_rgba(194,65,12,0.14)]"
                      : "border-[var(--line)] bg-white hover:-translate-y-0.5 hover:border-[var(--ink)]/25 hover:shadow-[0_8px_18px_rgba(26,23,20,0.08)]"
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
          <ClaimMedia
            heroName={heroName}
            scene={unboxingScene}
            sceneUrl={unboxingUrl}
            conceptUrl={conceptUrl}
          />
          <div className="rounded-xl border border-[var(--line)] bg-[var(--clay)]/40 p-4">
            <SizeScale />
            <p className="mt-1 text-sm text-[var(--muted)]">
              True to size — about as tall as your morning mug.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
