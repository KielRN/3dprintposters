// Saved 2026-07-11 from apps/web/components/storyfront/OfferBlock.tsx.
// Removed from the claim block to keep a single attention path at the buy
// moment (render -> name -> button). Kept here for later reuse - e.g. a product
// details / FAQ section, or lower on the claim page below the fold.
//
// Renders a ~150 mm figurine silhouette beside a coffee mug on a shared
// baseline. Hand-coded, ink strokes with one ember accent. Uses the storyfront
// CSS vars (--ink, --clay, --ember); drop it back into any storyfront view.

export function SizeScale() {
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
