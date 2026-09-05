import { describe, expect, it } from "vitest";

import { isKnownSignInMethodType, isWellFormedOtpCode } from "@/domain/auth/sign-in-method";

/**
 * RUK-288 — the OTP code guard is shared by the client form and the server's
 * `authorize`, so a malformed value cannot spend one of the five backend
 * attempts before the code is burnt. Tested here because both callers depend on
 * it and a second copy of the rule would drift.
 */
describe("isWellFormedOtpCode", () => {
  it("accepts exactly six digits", () => {
    expect(isWellFormedOtpCode("123456")).toBe(true);
    // Surrounding whitespace is trimmed, including a newline from a paste.
    expect(isWellFormedOtpCode("  123456  ")).toBe(true);
    expect(isWellFormedOtpCode("123456\n")).toBe(true);
  });

  it.each([
    ["too short", "12345"],
    ["too long", "1234567"],
    ["empty", ""],
    ["letters", "12345a"],
    ["all letters", "abcdef"],
    ["spaces inside", "123 456"],
    ["punctuation", "123-45"],
    ["unicode digits", "１２３４５６"],
    ["a leading plus", "+12345"],
  ])("rejects %s", (_label, value) => {
    expect(isWellFormedOtpCode(value)).toBe(false);
  });
});

describe("isKnownSignInMethodType", () => {
  it("accepts the three contract types", () => {
    expect(isKnownSignInMethodType("password")).toBe(true);
    expect(isKnownSignInMethodType("code")).toBe(true);
    expect(isKnownSignInMethodType("redirect")).toBe(true);
  });

  it("rejects a type this build cannot render", () => {
    // Rendered inert rather than as a working way in.
    expect(isKnownSignInMethodType("webauthn")).toBe(false);
    expect(isKnownSignInMethodType("")).toBe(false);
  });
});
