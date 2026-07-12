import { describe, expect, it } from "vitest";

import { callableErrorCode, isCallableAccessError } from "./callableRetry";

describe("callable access errors", () => {
  it("recognizes Firebase callable auth failures", () => {
    expect(isCallableAccessError({ code: "functions/permission-denied" })).toBe(true);
    expect(isCallableAccessError({ code: "functions/unauthenticated" })).toBe(true);
  });

  it("does not treat service failures as access failures", () => {
    expect(isCallableAccessError({ code: "functions/unavailable" })).toBe(false);
    expect(isCallableAccessError(new Error("network failed"))).toBe(false);
  });

  it("returns an empty code for malformed errors", () => {
    expect(callableErrorCode(null)).toBe("");
    expect(callableErrorCode({ code: 403 })).toBe("");
  });
});
