import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import manifest from "../../public/storyfront/manifest.json";
import type { StyleCardArt } from "./styleCardContent";

type ManifestEntry = { w: number; h: number; alt: string };
const entries: Record<string, ManifestEntry> = manifest;

function heroPanel(name: string) {
  const entry = entries[`hero/${name}.webp`];
  return {
    src: `/storyfront/hero/${name}.webp`,
    width: entry?.w ?? 1200,
    height: entry?.h ?? 1200,
    alt: entry?.alt ?? "",
  };
}

type ComicBannerProps =
  | { variant: "full" }
  | {
      variant: "compact";
      art: StyleCardArt | null;
      title: string;
    };

// Comic strip banner composed in CSS/JSX: panel borders, tilts, halftone, and
// onomatopoeia are markup, never baked into images. Decorations are
// aria-hidden with visually-hidden narrative equivalents.
export function ComicBanner(props: ComicBannerProps) {
  if (props.variant === "compact") {
    return (
      <section className="halftone rounded-2xl border border-[var(--line)] bg-[var(--cream)] p-5 sm:p-6">
        <div className="grid items-center gap-6 md:grid-cols-[minmax(0,400px)_1fr]">
          <div
            className="comic-panel aspect-[2/1]"
            style={{ "--tilt": "-0.8deg" } as React.CSSProperties}
          >
            {props.art ? (
              <Image
                src={props.art.src}
                width={props.art.width}
                height={props.art.height}
                alt={props.art.alt}
                className="h-full w-full object-cover"
                priority
              />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--clay)] to-[#dccfbd]"
                role="img"
                aria-label="Figurine style preview coming soon"
              >
                <Sparkles
                  className="text-[var(--muted)] opacity-40"
                  size={40}
                  aria-hidden="true"
                />
              </div>
            )}
          </div>
          <div>
            <h1 className="display text-3xl sm:text-4xl">{props.title}</h1>
            <p className="mt-2 max-w-[40ch] text-[var(--muted)]">
              Upload a photo to begin the transformation.
            </p>
            <Link
              className="story-nav-link mt-4"
              href="/start"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              Change style
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const photo = heroPanel("panel-photo");
  const transform = heroPanel("panel-transform");
  const figurine = heroPanel("panel-figurine");

  return (
    <section className="halftone rounded-2xl border border-[var(--line)] bg-[var(--cream)] px-5 py-8 sm:px-8 sm:py-10">
      <div className="grid gap-8 lg:grid-cols-[1.02fr_1fr_1.02fr_1.3fr] lg:items-center lg:gap-5">
        <div className="grid grid-cols-3 gap-3 sm:gap-4 lg:contents">
          <figure
            className="comic-panel aspect-square"
            style={{ "--tilt": "-1.2deg" } as React.CSSProperties}
          >
            <Image
              src={photo.src}
              width={photo.width}
              height={photo.height}
              alt={photo.alt}
              className="h-full w-full object-cover"
              priority
            />
          </figure>

          <figure
            className="comic-panel aspect-square"
            style={{ "--tilt": "0.8deg" } as React.CSSProperties}
          >
            <Image
              src={transform.src}
              width={transform.width}
              height={transform.height}
              alt={transform.alt}
              className="h-full w-full object-cover"
            />
            <span
              className="absolute -right-1 -top-1 grid h-14 w-14 rotate-6 place-items-center sm:h-16 sm:w-16"
              aria-hidden="true"
            >
              <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
                <polygon
                  points="50,2 61,28 88,13 74,40 99,50 74,60 88,87 61,72 50,98 39,72 12,87 26,60 1,50 26,40 12,13 39,28"
                  fill="var(--ember)"
                  stroke="var(--ink)"
                  strokeWidth="3"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="display relative text-xs font-bold text-white sm:text-sm">
                WHOA!
              </span>
            </span>
            <span className="sr-only">
              The heroine transforms in a burst of energy.
            </span>
          </figure>

          <figure
            className="comic-panel aspect-square"
            style={{ "--tilt": "-0.6deg" } as React.CSSProperties}
          >
            <Image
              src={figurine.src}
              width={figurine.width}
              height={figurine.height}
              alt={figurine.alt}
              className="h-full w-full object-cover"
            />
          </figure>
        </div>

        <div className="lg:pl-4">
          <h1 className="display text-[clamp(2rem,4.5vw,3.4rem)] leading-[1.08]">
            Make a figurine of someone you love.
          </h1>
          <p className="mt-3 max-w-[38ch] text-lg text-[var(--muted)]">
            Pick their style. Upload a photo. We sculpt, print, and ship the
            hero.
          </p>
        </div>
      </div>
    </section>
  );
}

