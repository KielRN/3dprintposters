// Style-card art, copy, and per-style banner titles for the storyfront
// gallery. Art is keyed by style id; alt text and dimensions come from the
// committed asset manifest verbatim. Labels always come from the live
// workflow config, never from this map.
import manifest from "../../public/storyfront/manifest.json";

type ManifestEntry = { w: number; h: number; alt: string };
const entries: Record<string, ManifestEntry> = manifest;

export type StyleCardArt = {
  src: string;
  width: number;
  height: number;
  alt: string;
};

export type StyleCardContent = {
  art: StyleCardArt | null;
  description: string;
  bannerTitle: string | null;
  chip?: string;
};

function cardArt(id: string): StyleCardArt | null {
  const entry = entries[`cards/${id}.webp`];
  return entry
    ? {
        src: `/storyfront/cards/${id}.webp`,
        width: entry.w,
        height: entry.h,
        alt: entry.alt,
      }
    : null;
}

const cards: Record<
  string,
  { description: string; bannerTitle: string; chip?: string }
> = {
  chibi_female: {
    description:
      "The heroine of the story, sculpted with your favorite person's smile.",
    bannerTitle: "The Chibi Heroine",
  },
  chibi_figure: {
    description: "A noble fantasy hero, sword at rest, ready for the shelf.",
    bannerTitle: "The Chibi Hero",
  },
  chibi_photo_male: {
    description: "A friendly chibi likeness straight from his photo.",
    bannerTitle: "The Everyday Hero",
  },
  chibi_photo_female: {
    description: "A friendly chibi likeness straight from her photo.",
    bannerTitle: "The Everyday Heroine",
  },
  heroic_fantasy_male: {
    description: "A grounded warrior sculpt with real stature.",
    bannerTitle: "The Fantasy Warrior",
  },
  heroic_fantasy_female: {
    description: "A noble warrior sculpt with real presence.",
    bannerTitle: "The Warrior Queen",
  },
  creative_lab_figure: {
    description: "A confident caped hero with a starburst emblem.",
    bannerTitle: "The Super Hero",
    chip: "New",
  },
  super_hero_figure_female: {
    description: "An arms-crossed hero in deep navy, standing her ground.",
    bannerTitle: "The Super Heroine",
    chip: "New",
  },
};

export const DEFAULT_CARD: StyleCardContent = {
  art: null,
  description: "A hand-finished figurine sculpted from one photo.",
  bannerTitle: null,
};

export function styleCardContent(styleId: string): StyleCardContent {
  const entry = cards[styleId];
  if (!entry) {
    return DEFAULT_CARD;
  }
  return {
    art: cardArt(styleId),
    description: entry.description,
    bannerTitle: entry.bannerTitle,
    ...(entry.chip ? { chip: entry.chip } : {}),
  };
}
