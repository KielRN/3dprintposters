export const figurinePreviewWarnings = [
  "Preview only: this is the original textured Meshy Creative Lab GLB for visual review.",
  "Print files are not ready yet. Checkout stays locked until printability and slicer review are complete.",
  "This preview intentionally does not use repaired or remeshed downstream print-tooling files.",
];

export function normalizeSelectedStyle(selectedStyle: string): string {
  const normalized = selectedStyle.trim().toLowerCase().replaceAll("-", "_");
  return normalized || "gallery_relief";
}

export function isFigurineStyle(selectedStyle: string): boolean {
  return normalizeSelectedStyle(selectedStyle) === "creative_lab_figure";
}
