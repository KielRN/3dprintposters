export const figurinePreviewWarnings = [
  "Preview only: this is the original textured Meshy Creative Lab GLB for visual review.",
  "Print files are not ready yet. Checkout stays locked until printability and slicer review are complete.",
  "This preview intentionally does not use repaired or remeshed downstream print-tooling files.",
];

export function figurinePreviewWarningsForWorkflow(
  workflow: string | null | undefined,
): string[] {
  if (workflow === "direct_multi_image_to_3d") {
    return [
      "Preview only: this is the original textured Meshy Multi-Image-to-3D GLB for visual review.",
      "Print files are not ready yet. Checkout stays locked until printability and slicer review are complete.",
      "This preview intentionally does not use repaired or remeshed downstream print-tooling files.",
    ];
  }

  return figurinePreviewWarnings;
}

export function normalizeSelectedStyle(selectedStyle: string): string {
  const normalized = selectedStyle.trim().toLowerCase().replaceAll("-", "_");
  return normalized || "gallery_relief";
}

export function isFigurineStyle(selectedStyle: string): boolean {
  return new Set([
    "creative_lab_figure",
    "super_hero_figure_female",
    "chibi_figure",
    "chibi_female",
    "chibi_photo_male",
    "chibi_photo_female",
    "heroic_fantasy_male",
    "heroic_fantasy_female",
  ]).has(normalizeSelectedStyle(selectedStyle));
}
