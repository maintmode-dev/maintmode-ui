import { describe, expect, it } from "vitest";

import { readTzCookie, TZ_COOKIE, TZ_COOKIE_MAX_AGE } from "../tz-cookie";

/**
 * AC-03 — the `mm.tz` cookie parser. Runs in **node**: `readTzCookie` is a pure
 * function of the header string and never touches `document`, so no jsdom.
 *
 * The reason this file exists at all is the boundary cases: a naive
 * `indexOf("mm.tz=")` passes the happy path and every "looks fine" eyeball
 * review, then silently reads a *different* cookie whose name merely ends in
 * `mm.tz`. Replacing the regex with `indexOf` must turn the `xmm.tz` and
 * `foo_mm.tz` cases red — that is the mutation check this suite is built for.
 */
describe("readTzCookie", () => {
  it("reads the zone when the cookie is the whole header", () => {
    expect(readTzCookie("mm.tz=Asia/Nicosia")).toBe("Asia/Nicosia");
  });

  it("ignores a cookie whose name merely ENDS with the tz name (left boundary)", () => {
    // The case `indexOf("mm.tz=")` gets wrong: it finds the substring inside
    // `xmm.tz=` and happily returns Asia/Tokyo.
    expect(readTzCookie("xmm.tz=Asia/Tokyo")).toBeNull();
  });

  it("ignores an underscore-prefixed lookalike name", () => {
    expect(readTzCookie("foo_mm.tz=Asia/Tokyo")).toBeNull();
  });

  it("ignores a cookie whose name merely STARTS with the tz name (right boundary)", () => {
    expect(readTzCookie("mm.tzx=Asia/Tokyo")).toBeNull();
  });

  it("finds the cookie in the middle of a multi-cookie header", () => {
    expect(readTzCookie("a=1; mm.tz=Asia/Nicosia; b=2")).toBe("Asia/Nicosia");
  });

  it("rejects a value this runtime cannot resolve as an IANA zone", () => {
    // The cookie is not httpOnly, so its value is untrusted input; a forged
    // zone must degrade to null instead of reaching the converters.
    expect(readTzCookie("mm.tz=Mars/Olympus")).toBeNull();
  });

  it("returns null for an empty value and an empty header", () => {
    expect(readTzCookie("mm.tz=")).toBeNull();
    expect(readTzCookie("")).toBeNull();
  });

  it("survives malformed percent-encoding instead of throwing", () => {
    // Found in review. An earlier version ran the value through
    // `decodeURIComponent`, which throws URIError on input like this — and the
    // value is attacker-writable, the cookie not being httpOnly. A forged cookie
    // must degrade to "zone unknown", never to an exception in the caller.
    expect(() => readTzCookie("mm.tz=%E0%A4%A")).not.toThrow();
    expect(readTzCookie("mm.tz=%E0%A4%A")).toBeNull();
    expect(readTzCookie("mm.tz=%")).toBeNull();
  });
});

describe("cookie constants", () => {
  it("keeps the mm. prefix and a one-year lifetime", () => {
    // Pinned because the init script interpolates both, and a drift between the
    // script and the reader would disable the fix without any test noticing.
    expect(TZ_COOKIE).toBe("mm.tz");
    expect(TZ_COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 365);
  });
});
