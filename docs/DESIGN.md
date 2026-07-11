# 3DPrintU Design

Last updated: 2026-07-11

## Purpose

This is the durable design document for the **3DPrintU** front end: the brand
surface, the design tokens, the type system, and the landing-page experience.
It records not just *what* the design is but *why*, so future work extends the
system instead of re-deriving it.

Scope today is the marketing landing page (`/`), the app-wide token/type
system that every page inherits, and — as of 2026-07-10 — the four customer
funnel pages (`/start`, `/start/[styleId]`, `/jobs/[jobId]`,
`/jobs/[jobId]/home`), specified in the "Storyfront funnel" section below.
`/admin`, `/orders`, the operator console, and print-readiness keep the tokens
plus the original light heading/button retouch only. Expand this file as more
surfaces get real design treatment.

Source-of-truth split (see also `AGENTS.md`):
- `DESIGN.md` (this file) — brand, tokens, type, landing experience, design rationale.
- `DECISIONS.md` — durable product/architecture decisions (incl. the brand-surface decision).
- `PROJECT_STATE.md` — current implementation state and risks.
- `CHANGELOG.md` — chronology of shipped changes.

This file was produced by applying the `taste-skill` (anti-slop frontend) skill
to an approved plan. The plan was treated as a contract for routes, palette,
type, and scope; the skill was given creative range on composition, motion, and
copy.

## Design Read and Dials

**Design read:** consumer marketing landing for gift-buyers (turn a photo into a
3D-printed figurine), warm-marketplace editorial language, native CSS +
Tailwind v4 + a scroll-scrubbed `<canvas>` hero, Fraunces + Inter type.

**Dials** (taste-skill): `DESIGN_VARIANCE 7` / `MOTION_INTENSITY 7` (the hero
scrub is the cinematic centerpiece) / `VISUAL_DENSITY 3` (airy, editorial).

## Brand

- Public brand: **3DPrintU**. Canonical domain `3dprintu.com`.
- Wordmark: text-set "3DPrintU" in Fraunces (no logo asset yet — a bespoke mark
  is a follow-up).
- Brand-surface only: repo name, Firebase project id, env keys, Cloud Storage
  bucket, and source-code identifiers stay as "posters"/internal names. See the
  brand decision in `DECISIONS.md`.

## Color

Warm, marketplace-adjacent palette. Defined as CSS custom properties in
`apps/web/app/globals.css`. One accent (ember) is used across the whole page.

| Token | Hex | Use |
|---|---|---|
| `--cream` | `#F5F1EA` | Page background, hero backdrop, light surfaces |
| `--ink` | `#1A1714` | Body + heading text, dark sections, hero rule |
| `--ember` | `#E8552E` | Primary CTA, brand orange, hero wordmark, step numerals |
| `--terracotta` | `#C2410C` | Primary hover/active, dark-section accent |
| `--clay` | `#E8DFD3` | Cards, pills, dividers, placeholder tiles |
| `--moss` | `#3F6B4C` | Muted secondary accent (e.g. dashed dropzone), replaces old teal |
| `--muted` | `#6B5F52` | Secondary text on cream |
| `--line` | `rgba(26,23,20,0.10)` | Warm hairline borders |
| `--surface` | `#FFFFFF` | Panels |

Legacy aliases (`--page-bg`, `--teal`, `--coral`, `--gold`, `--surface-strong`)
are kept and remapped to warm values so existing components inherit without
edits. `--teal` now points at `--moss`; `--page-bg` at `--cream`.

Notes: ember `#E8552E` is a deliberate warm-marketplace signal, chosen as a
distinct variant of Etsy's `#F1641E` rather than a copy. No pure black/white.

## Type

- **Fraunces** (variable, Google) for display/headings via `next/font/google`,
  with axes `opsz`, `SOFT`, `WONK`. The `.display` utility sets
  `font-variation-settings: "opsz" 144, "SOFT" 4, "WONK" 0`, weight 600,
  `letter-spacing: -0.015em`. Wrapped display headings use `leading` around 1.1
  to breathe.
- **Inter** (variable, Google) for UI and body, exposed as `--font-inter`.
- Both registered in `apps/web/app/layout.tsx`, exposed as `--font-fraunces` /
  `--font-inter` on `<html>`. The `.display` class is the single switch to the
  serif face; body stays Inter. Every route's top-level heading carries
  `.display`.

## Component tokens

Set in `globals.css`, inherited app-wide:
- `.primary-button` — `--ember` background, hover `--terracotta`, white text,
  tactile `translateY` on hover/active.
- `.secondary-button` — `--clay` border, white background.
- `.panel` — white surface, `--clay` border, warm shadow `0 18px 50px rgba(26,23,20,0.08)`.
- `.step-pill` — `--clay` background, `--muted` text.
- `.field-shell` — dashed `--moss` border at 55%, `--moss` tint at 6%.
- `.display` — Fraunces display utility (above).
- `.reveal` — scroll-reveal base (opacity + translateY, eased), toggled by
  `data-shown`; disabled under reduced motion.
- `.gallery-drift` — CSS scroll-driven horizontal drift, gated behind
  `prefers-reduced-motion: no-preference` and `@supports (animation-timeline: view())`.

## Landing page architecture

Route: `/` is a server component (`apps/web/app/page.tsx`) composing client
islands. Sections, in order:

1. **Pinned scroll-scrubbed hero** (`LandingHero`) — the centerpiece. See below.
2. **How it works** — three numbered steps (ember numerals, Inter body),
   reveal-on-scroll. A legitimate process pattern, kept distinct from a generic
   "three equal cards" row by leading with large display numerals over dividers.
3. **Gallery strip** — horizontal row of figurine example tiles that drift with
   scroll (CSS scroll-driven). Currently local placeholder tiles (clay gradient
   + muted camera glyph); real photography is a follow-up.
4. **Why 3DPrintU** — two-column text/image split.
5. **Final CTA band** — full-width `--ember` band, Fraunces "Make yours.",
   single Start button (cream-on-ember).
6. **Footer** (`LandingFooter`) — slim, cream-on-ink.

At least four distinct layout families across the page (pinned canvas, numbered
grid, horizontal drift, two-column split, full-width band) — no repeated
section layout, no zigzag chain.

### Header

Fixed top bar: wordmark left (links to `/`), "Sign in" right (links to `/start`
until a dedicated sign-in route exists). Transparent (white text) over the hero,
switches to solid cream with a hairline once scrolled past, via an
IntersectionObserver sentinel.

## Hero scroll-scrub mechanic

The hero plays a baked frame sequence on a `<canvas>` as the user scrolls. This
is the most iterated part of the design; the current spec:

**Frames.** Extracted once from `3dprint-hero-seedance20.mp4` (1920×1080, 24fps,
241 frames) with ffmpeg and committed under `apps/web/public/landing/hero/` so
deploys are deterministic (no runtime transcode):
- Desktop: 241 frames at 1600px wide, WebP quality 70, ~7.2 MB (under an 8 MB
  hard ceiling).
- Mobile (viewport < 768px): every other frame, 121 frames at 960px wide, WebP
  quality 80, ~2.4 MB (≤ 4 MB target).

**Fit and framing.**
- **Contain, not cover.** The whole 16:9 frame stays in view rather than
  cropping to fill — cover read as "too big" on squarer windows (it crops 20%+
  of the sides). Contain keeps the subject smaller and the composition intact.
- **Top-aligned.** The frame anchors to the top so there is never an empty band
  *above* it; any letterbox falls to the bottom.
- **Band sized to the frame.** The pinned hero height is
  `min(100dvh, 56.25vw)` — the frame's natural 16:9 height capped at the
  viewport — so the hero does not reserve a full viewport of height that the
  frame can't fill. This removes the dead space that appears on small/square
  windows. On 16:9 screens the band is the full viewport; on squarer windows it
  is shorter and the page flows on below it.
- **Cream backdrop + thin rule.** Outside the frame is `--cream` (blends into
  the page, not a black band); a 6px `--ink` rule sits at the base of the frame
  as a divider.

**Overlay copy.**
- **Ember wordmark** "3DPrintU" owns the opening at full opacity, then fades out
  as the scrub begins (opacity driven by the `--p` scroll variable).
- **Three crossfading lines** — "Your photo." → "Your figurine." → "Your shelf."
  — sit *inside* the frame's lower-left in `--ink`, crossfading in pure CSS off
  `--p` (they sit over the light studio area on the left, so ink reads).
- A subtle top scrim keeps the header and wordmark legible over the frame.

**Driver (`apps/web/lib/useFrameScrub.ts`).**
- Listens to a passive `scroll` listener feeding `requestAnimationFrame`; it
  draws to the canvas and writes one CSS variable (`--p`, 0→1 scrub progress)
  via refs. It never sets React state on the hot path, so the tree does not
  re-render while scrolling.
- Frame set is chosen once on mount (mobile vs desktop) and not re-evaluated on
  resize, so a window cross of 768px never reloads megabytes of WebP.
- Scroll budget is ~12px per frame; the tall scroll section is
  `frameCount * 12 + bandHeight`. Progress = the section's scrolled fraction.
- Preload: first 10 frames eager, the rest batched in the background
  (`requestIdleCallback`); if scroll outruns preload it draws the nearest loaded
  frame.

**Fallbacks (accessibility + performance).**
- `prefers-reduced-motion: reduce` or low-power devices
  (`navigator.deviceMemory <= 2` or `connection.saveData`) skip the scrub
  entirely: the hero renders a single static frame (`frame-0120`, `object-contain
  object-top`) with a visible `<h1>` and Start button, and the page scrolls
  normally (not pinned).
- The canvas is `aria-hidden`; a real `<h1>` ("Your photo. Your figurine. Your
  shelf.") and a Start link exist as static DOM for SEO and screen readers.

## Motion principles

- `MOTION_INTENSITY 7`: the page actually moves (hero scrub, scroll reveals,
  CTA hover) and every animation is motivated (hierarchy/storytelling/feedback).
- Reveals use **IntersectionObserver + CSS transitions** (`.reveal`), not a
  motion library — zero new dependencies, and reduced-motion shows content
  immediately.
- No `window.addEventListener('scroll')` that touches React state; the one
  scroll listener (the canvas scrubber) is contract-mandated and writes only to
  the canvas and a CSS variable via refs.
- Gallery drift uses native CSS scroll-driven animations, gated behind support
  and reduced-motion.
- Animate only `transform`/`opacity`.

## Layout principles

- `max-w-7xl` content gutters; `min-h-[100dvh]` (never `h-screen`) for full-bleed.
- One accent color, one corner-radius scale, one theme (light) locked across the page.
- Eyebrows avoided (the section's position categorizes it); no decorative dots,
  no scroll cues, no version labels, no em-dashes anywhere.

## Accessibility

- Real heading + CTA in static DOM behind the decorative canvas.
- Reduced-motion and low-power fully degrade to a static, normally-scrolling page.
- Buttons and copy meet WCAG AA contrast against their backgrounds (ink-on-light
  copy is positioned over the light region of the frame).

## Contract vs skill decisions

The taste-skill's defaults were overridden only where the approved contract
named specifics; everything else followed the skill:
- **Fraunces** and the **warm cream palette** are normally discouraged by the
  skill (serif default; premium-consumer beige ban). Both are allowed here
  because the brand brief named them explicitly with exact hex codes — which is
  the skill's own override path. Contract wins.
- **lucide-react** is discouraged by the skill but kept because the project
  already depends on it.
- The plan's hero "scroll" affordance was **dropped** — the skill bans scroll
  cues, and it is a micro-interaction in the skill's creative-range zone, not an
  acceptance-checked contract item.
- **IntersectionObserver + CSS** was chosen over adding Motion (~30kb) for
  reveals — no new dependency.
- The scroll-driven canvas is the contract's mandated mechanic; it is
  implemented in the performant, no-React-state-on-the-hot-path way the skill's
  rules want.

## Storyfront funnel (pages 1–4)

Added 2026-07-10 (storyfront revamp, chat 3b). The figurine funnel is a
four-page story — Style (`/start`) → Photo (`/start/[styleId]`) → Reveal
(`/jobs/[jobId]`) → Home (`/jobs/[jobId]/home`) — rendered entirely in the warm
token system. Dials for these pages: `DESIGN_VARIANCE 7` / `MOTION_INTENSITY 5`
/ `VISUAL_DENSITY 3-4` (product surfaces sit calmer than the landing hero).
Customers never see figurine GLBs, print-readiness, or build internals; those
render only on operator surfaces, which keep the original layout.

### Comic treatment

The comic story is composed in CSS/JSX, never baked into images:

- `.halftone` — radial-gradient ink dots (14px grid, 14% alpha) over cream;
  the banner field on pages 1 and 2.
- `.comic-panel` — 3px `--ink` border, 14px radius, clay fill, hard offset
  shadow (`6px 8px 0`), static tilt via the `--tilt` custom property.
  `prefers-reduced-motion` flattens the tilt.
- Onomatopoeia ("WHOA!") is an aria-hidden SVG starburst (`--ember` fill, ink
  stroke) with Fraunces text and a visually-hidden narrative sibling for
  screen readers.
- All storyfront art is committed WebP under `apps/web/public/storyfront/`;
  `manifest.json` is the source of truth for dimensions and alt text, consumed
  verbatim. The generation prompts and QA history live in the chat-2 asset log
  (temporary planning folder, since deleted; regeneration goes through
  `scripts/storyfront/generate-assets.mjs`).

### Cards, chips, and states

- Style cards: 2:1 art region, label from the live workflow config (never a
  hardcoded map), one-line description from `styleCardContent.ts` with the
  clay-field `DEFAULT_CARD` for unknown ids, circular arrow affordance,
  optional ember "New" chip. Hover: card lift + image scale, `motion-safe`
  only.
- Job status chips map through `jobPresentation.ts` — tones `moss` (in
  production / concept ready), `gold` (in checkout), `ember` (ready to order,
  with a `.chip-pulse-dot`), `coral` (needs attention, pre-payment failures
  only), `muted` (in progress). Post-payment build failures never surface on
  customer chips.
- Every async region ships a designed state: `.skeleton-shimmer` loaders that
  match final layout (static under reduced motion), mascot empty state ("Your
  first hero starts here."), signed-out panels, and inline coral errors.

### Reveal and win moment

- `ConceptStage` stages the 2D concept as an object (perceptual sculpting,
  plan §5a.3): clay mat, warm radial vignette, 3px ink frame over an offset
  depth frame, and a directional soft shadow (upper-left key light, so the
  shadow falls lower-right). No customer 3D viewer anywhere.
- `.reveal-win` plays once per job (sessionStorage key
  `storyfront-reveal-{jobId}`): 600ms scale settle 0.96→1 with an ember glow
  pulse; reduced motion (and repeat visits) get the static staged frame.
- Page 4's scene render is garnish by design: pending shows the epilogue shelf
  backdrop under a shimmer with "Placing {name} on the shelf…", failure
  composites the concept frame over the blurred backdrop with no alarm tones,
  and the honesty caption ("Artist's visualization — …") is always visible.
  Scene status must never appear in checkout logic.
- The claim moment (page 4, `OfferBlock`, revised 2026-07-11) anchors the
  customer's OWN unboxing render beside the CTA - their hero, their named base,
  in a real box - replacing the earlier stock "hands" panel (retired to
  `.tmp/media-collection/`). It falls back to the approved concept until the
  render lands and, like all scene renders, never gates checkout. Rationale and
  the surrounding copy live in "Persuasion and perception principles" below.

### Voice and copy

The canonical strings (headlines, step pills "Style · Photo · Reveal · Home",
CTAs, status lines) live in the storyfront voice & copy contract: second-person
storytelling, victory framing (checkout is claiming, not paying), no fabricated
claims, and no prices ("Final price at checkout."). The canonical strings ship
verbatim — including their em-dashes, a deliberate contract-over-skill override
of the taste-skill's em-dash ban — and change only with Elliot's sign-off.

## Persuasion and perception principles

Added 2026-07-11. The funnel's job is not to describe a product but to help the
customer finish a story and take ownership of their hero. Two lenses govern the
copy and composition of the reveal and claim pages; both are bounded by the
honest-psychology policy in `DECISIONS.md` - only truthful levers, never
manufactured scarcity, countdowns, fake stock, or fabricated proof.

**Hoffman (Interface Theory of Perception).** People do not perceive the
"objective" product - resin, labor, print time. They act on the *fitness
payoffs* their perception evolved to grab. So name the payoff, not the object: a
loved one made permanent, pride, a child's delight, a protector on the shelf.
And because the visual system *constructs* solidity from depth cues (shading
gradients, occlusion, contact shadow) and color, the more real a hero reads the
more the brain treats it as an ownable thing. Every hero image is therefore lit
and grounded to read as a graspable object - one upper-left key light, warm
tinted shadow, a soft contact shadow - and rendered in the hero's true painted
colors, never a bare print (see the scene-render prompt + color lock in
`apps/functions/src/scenePreview.ts`).

**Cialdini (Pre-Suasion + Influence).** What sits in front of the ask sets
receptivity.
- *Channel attention to the payoff right before the ask.* The customer's OWN
  unboxing render - their hero, their named base, in a real box - sits beside
  the checkout button, not a stock photo or a stranger's figurine. The
  near-future possession is the last thing seen before the click.
- *Lean on commitments already made.* By the claim page the customer has
  uploaded a photo, named the hero, and approved the concept. The copy names
  those acts ("You named them. You watched them come to life. One step left.")
  so finishing reads as consistency, not a fresh decision.

Honest levers in use, each mapped to a real fact (never fabricated):
- **Consistency / commitment** - their real journey (upload -> name -> approve).
- **Endowment / loss aversion** - their real render; the language of "yours"
  ("{name}'s out of the box and ready - don't leave them there").
- **Authority / liking** - real craft ("hand-painted by our studio artist",
  "human print-review"); the maker is a named person.
- **Reciprocity** - the concept reveal was genuinely free.
- **Unity** - the hero is family made heroic.

Deliberately unused: scarcity theater, countdowns, fake stock, fabricated social
proof.

**Composition at the decision point.**
- *Second person + the hero's name, everywhere.* Self-relevance is the strongest
  attention magnet. The name is the collected sign text (`heroName()`), so the
  headline and CTA always agree ("{name}'s ready to come home." / "Bring {name}
  home"). Pronouns stay gender-neutral ("them") beneath the name so every hero -
  male- or female-styled - reads correctly without a pronoun field.
- *Close the story arc on this page:* photo -> hero -> home. The headline and its
  sub-line restate the transformation ("A few minutes ago, they were just a
  photo you loved.").
- *One attention path:* render -> name -> button. Strip competing focal points
  at the buy moment - the 150 mm size-scale was pulled off the claim block for
  this reason (kept in `.tmp/media-collection/SizeScale.tsx` for reuse).
- *Victory framing.* Checkout is claiming, not paying (see "Voice and copy").

## File map

- `apps/web/app/page.tsx` — landing composition (server component).
- `apps/web/app/start/page.tsx` — storyfront page 1: style gallery.
- `apps/web/app/start/[styleId]/page.tsx` — storyfront page 2: project page.
- `apps/web/app/jobs/[jobId]/home/page.tsx` — storyfront page 4: scene + claim.
- `apps/web/components/storyfront/` — funnel components (ComicBanner,
  StyleCard(Grid), MyFigurinesList/JobCard, StepPills, ConceptStage,
  JourneyStrip, BaseSignInline, SceneStage, OfferBlock, HomeClaimView,
  ProjectPageView, TrustStrip) plus the pure helpers `jobPresentation.ts` and
  `styleCardContent.ts` (vitest-covered).
- `apps/web/public/storyfront/` — committed funnel art + `manifest.json`.
- `apps/web/app/layout.tsx` — fonts + metadata.
- `apps/web/app/globals.css` — tokens, type, component classes, motion utilities.
- `apps/web/components/LandingHero.tsx` — hero + header (client island).
- `apps/web/components/LandingSections.tsx` — how-it-works, gallery, why, CTA.
- `apps/web/components/LandingFooter.tsx` — footer.
- `apps/web/lib/useFrameScrub.ts` — canvas scrub driver.
- `apps/web/public/landing/hero/{desktop,mobile}/frame-####.webp` — frame sets.
- `apps/web/public/manifest.webmanifest` — PWA name/start_url.

## Follow-ups (not yet done)

- Real figurine gallery photography to replace placeholder tiles.
- Production DNS/App Hosting custom-domain wiring for `3dprintu.com`.
- New brand icons, favicon, Apple touch icon, and OG share image.
- Bespoke wordmark or icon mark replacing the text-set Fraunces wordmark.
- Final marketing copy pass (the hero/section copy is provisional).
- README and developer-doc brand sweep (this work touched user-visible strings only).
- Optional: matte the hero footage background (per-frame matting + `alpha:true`
  canvas) if a transparent subject is wanted — a separate effort from this design.
