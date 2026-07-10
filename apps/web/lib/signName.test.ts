import { describe, expect, it } from "vitest";

import { SIGN_NAME_MAX_CHARACTERS, signNameError } from "./signName";

describe("signNameError", () => {
  it("accepts simple first names", () => {
    expect(signNameError("Ellie")).toBeNull();
    expect(signNameError("Mary Jo")).toBeNull();
    expect(signNameError("D'Andre")).toBeNull();
  });

  it("rejects empty and whitespace-only", () => {
    expect(signNameError("")).toBeTruthy();
    expect(signNameError("   ")).toBeTruthy();
  });

  it("rejects names over the max", () => {
    expect(signNameError("A".repeat(SIGN_NAME_MAX_CHARACTERS + 1))).toBeTruthy();
  });

  it("rejects disallowed characters", () => {
    expect(signNameError("El!ie")).toBeTruthy();
    expect(signNameError("-Ellie")).toBeTruthy();
  });

  it("collapses inner whitespace before validating length", () => {
    expect(signNameError("Mary    Jo")).toBeNull();
  });
});
