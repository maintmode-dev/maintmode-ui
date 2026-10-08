import { describe, expect, it } from "vitest";

import {
  SECURE_SESSION_COOKIE,
  SESSION_COOKIE,
  decodeSession,
  encodeSession,
  sessionCookieAttributes,
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
