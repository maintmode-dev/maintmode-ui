import { describe, expect, it } from "vitest";

import {
  BackendS2SConfigError,
  backendS2STokenIssue,
  readBackendS2SToken,
} from "@/shared/config/backend-s2s-config";

/**
 * RUK-311. The BFF's client credential for the auth backend. Validated as
 * strictly as `Headers` will treat it: a value `Headers.set` rejects or alters
 * (CR/LF, non-Latin-1, surrounding spaces) would otherwise surface per request
 * as a `TypeError` — which the backend client reads as "backend unreachable" —
 * instead of as a config error naming the variable.
 */
describe("backend-s2s-config", () => {
  const VALID = "s2s-token-for-tests-0123456789abcdef";

  it("returns a valid token", () => {
    expect(readBackendS2SToken({ MAINTMODE_BACKEND_S2S_TOKEN: VALID })).toBe(VALID);
    expect(backendS2STokenIssue({ MAINTMODE_BACKEND_S2S_TOKEN: VALID })).toBeUndefined();
  });

  it.each([
    ["missing", undefined, "is required"],
    ["empty", "", "is required"],
    ["shorter than 32", "x".repeat(31), "must be at least 32 characters"],
    ["containing a space", `${"x".repeat(32)} y`, "must be printable ASCII without whitespace"],
    ["ending in CR (a CRLF env file)", `${"x".repeat(64)}\r`, "must be printable ASCII without whitespace"],
    ["containing LF", `${"x".repeat(32)}\ny`, "must be printable ASCII without whitespace"],
    ["containing non-ASCII", `${"x".repeat(32)}é`, "must be printable ASCII without whitespace"],
  ])("rejects a token %s", (_label, value, issue) => {
    const env = { MAINTMODE_BACKEND_S2S_TOKEN: value };

    expect(backendS2STokenIssue(env)).toBe(issue);
    expect(() => readBackendS2SToken(env)).toThrow(BackendS2SConfigError);
    expect(() => readBackendS2SToken(env)).toThrow(`MAINTMODE_BACKEND_S2S_TOKEN ${issue}`);
  });

  it("never puts the rejected value in the error message", () => {
    const leaky = "this-is-a-real-looking-secret value";
    let message = "";
    try {
      readBackendS2SToken({ MAINTMODE_BACKEND_S2S_TOKEN: leaky });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("MAINTMODE_BACKEND_S2S_TOKEN");
    expect(message).not.toContain("real-looking-secret");
  });

  it("is not a TypeError, which the backend client reads as a transport failure", () => {
    expect(() => readBackendS2SToken({})).toThrow(BackendS2SConfigError);
    try {
      readBackendS2SToken({});
    } catch (error) {
      expect(error).not.toBeInstanceOf(TypeError);
    }
  });
});
