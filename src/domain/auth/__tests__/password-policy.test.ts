import { describe, expect, it } from "vitest";

import { isPasswordWithinPolicy } from "@/domain/auth/sign-in-method";

describe("password policy is measured in bytes, as the backend measures it", () => {
  it("rejects 11 ASCII characters and accepts 12", () => {
    expect(isPasswordWithinPolicy("a".repeat(11))).toBe(false);
    expect(isPasswordWithinPolicy("a".repeat(12))).toBe(true);
  });

  it("rejects 257 ASCII characters and accepts 256", () => {
    expect(isPasswordWithinPolicy("a".repeat(257))).toBe(false);
    expect(isPasswordWithinPolicy("a".repeat(256))).toBe(true);
  });

  // The case that makes this suite bite. A naive `.length >= 12` implementation
  // REJECTS this — 11 characters — while the backend ACCEPTS it, because the
  // string is 22 bytes. Getting this wrong on the reset path surfaces as
  // "that code is wrong" about a perfectly good code.
  it("accepts 11 Cyrillic characters, which are 22 bytes", () => {
    const password = "паролькудлин";
    expect(password.length).toBe(12);
    expect(new TextEncoder().encode(password).length).toBe(24);

    const eleven = "паролькудли";
    expect(eleven.length).toBe(11);
    expect(new TextEncoder().encode(eleven).length).toBe(22);
    expect(isPasswordWithinPolicy(eleven)).toBe(true);
  });

  // The mirror: 6 Cyrillic characters are exactly 12 bytes, so the backend
  // accepts them and so must we, however short they look.
  it("accepts 6 Cyrillic characters, which are exactly 12 bytes", () => {
    expect(new TextEncoder().encode("пароль").length).toBe(12);
    expect(isPasswordWithinPolicy("пароль")).toBe(true);
  });

  it("rejects a 256-character Cyrillic password, which is 512 bytes", () => {
    expect(isPasswordWithinPolicy("я".repeat(256))).toBe(false);
  });
});
