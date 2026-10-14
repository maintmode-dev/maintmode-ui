import { describe, expect, it } from "vitest";

import {
  SECURE_SESSION_COOKIE,
  SESSION_COOKIE,
  decodeSession,
  encodeSession,
  parseSessionExpiresAt,
  sessionCookieAttributes,
  sessionCookieMaxAgeSeconds,
  sessionCookieNameFor,
  type SessionPayload,
} from "@/server/auth/session-cookie";

const SECRET = "golden-vector-secret-not-used-anywhere-else-32+";

const PAYLOAD: SessionPayload = {
  accessToken: "access-golden",
  refreshToken: "refresh-golden",
  accessTokenExpiresAt: 1790000000000,
  user: { id: "user-golden", email: "golden@example.test", displayName: "Golden", roles: ["admin"] },
};

/**
 * Produced by Auth.js itself (`next-auth/jwt` encode, next-auth 5.0.0-beta.32,
 * salt "authjs.session-token", 100-year maxAge) before it was removed. Sessions
 * issued before the switch are sealed exactly like this, so as long as this
 * opens, the release signs nobody out. Never regenerate it with our encoder:
 * that would prove only that the module agrees with itself.
 */
const AUTHJS_TOKEN =
  "eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2Q0JDLUhTNTEyIiwia2lkIjoiSVJ3NWdMeG1Fa0IwZllyT1ZWQUN0d1lRTVI3Si1ETFNSQ3BWZDZETXBRZmsyZWFQNHl0VkpVVG91U0lSc2VQZUVKNV9nUG5ENmZEV01DZjZSUUJoR3cifQ..6S93hkXU5bozinz_NOxOyQ.0jXDPIMcDv0TeCLz76v1ylmOP2T2Yj53inChzEiN4MfvhMH0jfYvOFHrd_4dRwUiNBDkQwC_P8JxY_W99Il9Dq8j_ieyBxBfzAD0hG-wItRKY5eSRlIBdgTTQMhZRTZQ-6VO1U44xSjvuEfA_7fV_V982HrAkUgiyADiXhI2vRuB-xDIS9BzYjmN0-UVR7sRARScZufIwRf6s58j0BfF8mcdImpjCzYZAGlFuwHykyLsdscmZnCLyCRcl6Pb0DD7DaMPa9PkL2Ryq_J4WpRR29cRyhMSj8cvCoYHOwXhHT3HcgudLssAiRGBygwvdFK65cxWdwcYkMdtapHZ-JKIQ5dsEGJrUZTaNl3BqX53WqirTf_EM3oP0Ud66ChNbd5x.IArVytwgfiWUDclvsltUbFXRDXdfhtHmOo9OnaqEpKQ";

describe("compatibility with sessions Auth.js issued", () => {
  it("opens a cookie Auth.js sealed", async () => {
    expect(await decodeSession(AUTHJS_TOKEN, SESSION_COOKIE, SECRET)).toEqual(PAYLOAD);
  });

  it("does not open it with another secret or under another cookie name", async () => {
    expect(
      await decodeSession(AUTHJS_TOKEN, SESSION_COOKIE, "another-secret-of-at-least-32-chars!!"),
    ).toBeNull();
    // The name is the key's salt: a session cannot be replayed under the other name.
    expect(await decodeSession(AUTHJS_TOKEN, SECURE_SESSION_COOKIE, SECRET)).toBeNull();
  });
});

describe("encodeSession / decodeSession", () => {
  it("round-trips a session", async () => {
    const sealed = await encodeSession(PAYLOAD, SECURE_SESSION_COOKIE, SECRET);

    expect(await decodeSession(sealed, SECURE_SESSION_COOKIE, SECRET)).toEqual(PAYLOAD);
    // Encrypted, not merely signed: no token is readable in the cookie.
    expect(sealed).not.toContain("access-golden");
  });

  it("refuses an expired session", async () => {
    const sealed = await encodeSession(PAYLOAD, SESSION_COOKIE, SECRET, -60);

    expect(await decodeSession(sealed, SESSION_COOKIE, SECRET)).toBeNull();
  });

  it("refuses a tampered cookie instead of throwing", async () => {
    const sealed = await encodeSession(PAYLOAD, SESSION_COOKIE, SECRET);
    const tampered = sealed.slice(0, -4) + (sealed.endsWith("AAAA") ? "BBBB" : "AAAA");

    expect(await decodeSession(tampered, SESSION_COOKIE, SECRET)).toBeNull();
    expect(await decodeSession("not-a-jwe", SESSION_COOKIE, SECRET)).toBeNull();
  });

  it.each([
    ["no refresh token", { ...PAYLOAD, refreshToken: "" }],
    ["no user", { ...PAYLOAD, user: undefined }],
    ["a session Auth.js marked dead", { ...PAYLOAD, error: "RefreshAccessTokenError" }],
  ])("refuses %s", async (_label, payload) => {
    const sealed = await encodeSession(payload as unknown as SessionPayload, SESSION_COOKIE, SECRET);

    expect(await decodeSession(sealed, SESSION_COOKIE, SECRET)).toBeNull();
  });
});

describe("cookie name and attributes", () => {
  it("uses __Secure- exactly when the app is served over https", () => {
    expect(sessionCookieNameFor("https://maintmode.example.com")).toBe("__Secure-authjs.session-token");
    expect(sessionCookieNameFor("http://localhost:3000")).toBe("authjs.session-token");
  });

  // Secure follows the name, not NODE_ENV: a production build on plain HTTP
  // must not write a cookie the browser then drops.
  it("marks a cookie Secure exactly when its name requires it", () => {
    expect(sessionCookieAttributes(SECURE_SESSION_COOKIE)).toMatchObject({
      secure: true,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    expect(sessionCookieAttributes(SESSION_COOKIE)).toMatchObject({ secure: false, httpOnly: true });
  });
});

describe("parseSessionExpiresAt — the backend's absolute session end (RUK-310)", () => {
  // 2026-10-14T12:00:00Z
  const NOW = Date.UTC(2026, 9, 14, 12, 0, 0);

  it.each([
    ["Z", "2026-11-13T12:00:00Z", Date.UTC(2026, 10, 13, 12, 0, 0)],
    ["fractional seconds", "2026-11-13T12:00:00.250Z", Date.UTC(2026, 10, 13, 12, 0, 0, 250)],
    ["a numeric offset", "2026-11-13T15:00:00+03:00", Date.UTC(2026, 10, 13, 12, 0, 0)],
    ["a negative numeric offset", "2026-11-13T07:00:00-05:00", Date.UTC(2026, 10, 13, 12, 0, 0)],
    ["exactly one second ahead", "2026-10-14T12:00:01Z", Date.UTC(2026, 9, 14, 12, 0, 1)],
  ])("accepts an instant with %s", (_label, value, expected) => {
    expect(parseSessionExpiresAt(value, NOW)).toBe(expected);
  });

  it.each([
    ["absent", undefined],
    ["null (a Go nil pointer)", null],
    ["a number", 1794571200],
    ["no zone — V8 would read it as server-local time", "2026-11-13T12:00:00"],
    ["a loose date V8 happens to parse", "Nov 13 2026 12:00"],
    ["a bare date", "2026-11-13"],
    ["a lowercase zone", "2026-11-13t12:00:00z"],
    ["an unparseable well-shaped string", "2026-13-45T99:99:99Z"],
    ["a past instant", "2026-10-13T12:00:00Z"],
    ["less than a second ahead", "2026-10-14T12:00:00.500Z"],
  ])("treats %s as absent", (_label, value) => {
    expect(parseSessionExpiresAt(value, NOW)).toBeUndefined();
  });
});

describe("sessionCookieMaxAgeSeconds", () => {
  const NOW = Date.UTC(2026, 9, 14, 12, 0, 0);
  const DAY = 24 * 60 * 60;

  it("ends the cookie at the backend's session end, even beyond 30 days", () => {
    expect(sessionCookieMaxAgeSeconds({ sessionExpiresAt: NOW + 60 * DAY * 1000 }, NOW)).toBe(60 * DAY);
  });

  it("ends a 24h break-glass cookie after 24h, not 30 days", () => {
    expect(
      sessionCookieMaxAgeSeconds({ sessionStartedAt: NOW, sessionExpiresAt: NOW + DAY * 1000 }, NOW),
    ).toBe(DAY);
  });

  it("clamps a far-future end at 400 days, the browsers' own cap", () => {
    expect(sessionCookieMaxAgeSeconds({ sessionExpiresAt: NOW + 5000 * DAY * 1000 }, NOW)).toBe(400 * DAY);
  });

  it("gives 0 for an end already past", () => {
    expect(sessionCookieMaxAgeSeconds({ sessionExpiresAt: NOW - 1000 }, NOW)).toBe(0);
  });

  it("falls back to 720h from sign-in without a backend end", () => {
    expect(sessionCookieMaxAgeSeconds({ sessionStartedAt: NOW - DAY * 1000 }, NOW)).toBe(29 * DAY);
  });

  it("falls back to 30 days for a cookie that predates both", () => {
    expect(sessionCookieMaxAgeSeconds({}, NOW)).toBe(30 * DAY);
  });
});

describe("the stored session end", () => {
  it("survives a round-trip through the sealed cookie", async () => {
    const payload: SessionPayload = {
      ...PAYLOAD,
      sessionStartedAt: 1790000000000,
      sessionExpiresAt: 1792592000000,
    };
    const sealed = await encodeSession(payload, SESSION_COOKIE, SECRET);

    expect(await decodeSession(sealed, SESSION_COOKIE, SECRET)).toEqual(payload);
  });

  it("is dropped when it is not a finite number", async () => {
    const sealed = await encodeSession(
      { ...PAYLOAD, sessionExpiresAt: "2026-11-13T12:00:00Z" } as unknown as SessionPayload,
      SESSION_COOKIE,
      SECRET,
    );

    expect(await decodeSession(sealed, SESSION_COOKIE, SECRET)).toEqual(PAYLOAD);
  });
});
