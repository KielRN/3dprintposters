import { describe, expect, it } from "vitest";
import { DEFAULT_CARD, styleCardContent } from "./styleCardContent";

describe("styleCardContent", () => {
  it("maps every live style id to committed art with manifest alt + dims", () => {
    const ids = [
      "chibi_figure",
      "chibi_female",
      "chibi_photo_male",
      "chibi_photo_female",
      "heroic_fantasy_male",
      "heroic_fantasy_female",
      "creative_lab_figure",
      "super_hero_figure_female",
    ];
    for (const id of ids) {
      const card = styleCardContent(id);
      expect(card.art?.src).toBe(`/storyfront/cards/${id}.webp`);
      expect(card.art?.width).toBe(1600);
      expect(card.art?.height).toBe(820);
      expect(card.art?.alt.length).toBeGreaterThan(10);
      expect(card.description.length).toBeGreaterThan(10);
      expect(card.description).not.toContain("—");
    }
  });

  it("chips only the two Super Hero styles as New", () => {
    expect(styleCardContent("creative_lab_figure").chip).toBe("New");
    expect(styleCardContent("super_hero_figure_female").chip).toBe("New");
    expect(styleCardContent("chibi_female").chip).toBeUndefined();
    expect(styleCardContent("heroic_fantasy_male").chip).toBeUndefined();
  });

  it("unknown id -> DEFAULT_CARD with no art (clay-field treatment)", () => {
    const card = styleCardContent("mystery_style");
    expect(card).toEqual(DEFAULT_CARD);
    expect(card.art).toBeNull();
  });

  it("banner titles exist per style with the contract example", () => {
    expect(styleCardContent("chibi_female").bannerTitle).toBe(
      "The Chibi Heroine",
    );
    expect(styleCardContent("chibi_figure").bannerTitle).toBeTruthy();
    expect(DEFAULT_CARD.bannerTitle).toBeNull();
  });
});
