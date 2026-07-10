// Client-side mirror of normalizeFigurineSignText in apps/functions/src/index.ts:
// 12 chars max, letters/numbers with spaces, periods, apostrophes, hyphens between.
export const SIGN_NAME_MAX_CHARACTERS = 12;
export const SIGN_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 .'-]*$/;

export function collapseSignName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function signNameError(raw: string): string | null {
  const collapsed = collapseSignName(raw);
  if (!collapsed) {
    return "Add a first name for the base.";
  }
  if (collapsed.length > SIGN_NAME_MAX_CHARACTERS) {
    return `Keep it to ${SIGN_NAME_MAX_CHARACTERS} characters.`;
  }
  if (!SIGN_NAME_PATTERN.test(collapsed)) {
    return "Use letters and numbers, with spaces, periods, apostrophes, or hyphens between them.";
  }
  return null;
}
