import { beforeEach, describe, expect, it, vi } from "vitest";

import { decodeSession, encodeSession, type SessionPayload } from "@/server/auth/session-cookie";

const SECRET = "test-secret-at-least-thirty-two-characters-long";
const config = vi.hoisted(() => ({ appBaseUrl: "https://maintmode.example.com" }));

type Jar = Map<string, { value: string; options: Record<string, unknown> }>;
const jar: Jar = new Map();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: ({ name, value, ...options }: { name: string; value: string }) => {
      jar.set(name, { value, options });
    },
  }),
}));
vi.mock("@/shared/config/auth-config", () => ({
  parseMaintmodeAuthConfig: () => ({ authSecret: SECRET, appBaseUrl: config.appBaseUrl }),
}));
vi.mock("@/server/auth/backend-token-exchange", () => ({ refreshBackendToken: vi.fn() }));

const { establishSession, readSessionUser } = await import("@/server/auth/session-token");

const PAIR = { access_token: "at-1", refresh_token: "rt-1", expires_in: 900 };
const USER = { id: "u-1", email: "a@example.test", displayName: "A", roles: ["admin"] };

beforeEach(() => {
  jar.clear();
  config.appBaseUrl = "https://maintmode.example.com";
});

describe("establishSession — starting a session from a fresh pair", () => {
  it("writes an encrypted __Secure- cookie over https, httpOnly and Secure", async () => {
    await establishSession(PAIR, USER);

    const cookie = jar.get("__Secure-authjs.session-token");
    expect(cookie?.options).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(cookie?.value).not.toContain("at-1");
    expect(await decodeSession(cookie!.value, "__Secure-authjs.session-token", SECRET)).toMatchObject({
      accessToken: "at-1",
      refreshToken: "rt-1",
      user: USER,
    });
  });

  // A plain-HTTP deployment: a Secure cookie there is dropped by the browser.
  it("writes a plain, non-Secure cookie when the app is served over http", async () => {
    config.appBaseUrl = "http://intranet.local:3000";
    // The config is parsed once per process, as env is fixed at run time.
    vi.resetModules();
    const fresh = await import("@/server/auth/session-token");

    await fresh.establishSession(PAIR, USER);

    expect(jar.get("authjs.session-token")?.options).toMatchObject({ secure: false });
    expect(jar.has("__Secure-authjs.session-token")).toBe(false);
  });

  // The cookie ends with the session: refreshes cap it at this instant plus the
  // backend's maximum lifetime, so it must be recorded at sign-in.
  it("records the sign-in time and arms the cookie for the session's full lifetime", async () => {
    const before = Date.now();
    await establishSession(PAIR, USER);
    const after = Date.now();

    const cookie = jar.get("__Secure-authjs.session-token");
    expect(cookie?.options).toMatchObject({ maxAge: 30 * 24 * 60 * 60 });
    const stored = await decodeSession(cookie!.value, "__Secure-authjs.session-token", SECRET);
    expect(stored?.sessionStartedAt).toBeGreaterThanOrEqual(before);
    expect(stored?.sessionStartedAt).toBeLessThanOrEqual(after);
  });

  it("removes a session cookie left under another name, so one browser holds one session", async () => {
    jar.set("next-auth.session-token", { value: "old", options: {} });

    await establishSession(PAIR, USER);

    expect(jar.get("next-auth.session-token")?.value).toBe("");
  });

  // Previously such a pair signed the user in and died at the first rotation.
  it.each([
    ["no refresh token", { ...PAIR, refresh_token: "" }],
    ["no expiry", { ...PAIR, expires_in: 0 }],
  ])("refuses a pair with %s instead of writing a dying session", async (_label, pair) => {
    await expect(establishSession(pair, USER)).rejects.toThrow();
    expect(jar.size).toBe(0);
  });
});

/**
 * What used to be Auth.js's `auth()` + session callback (AC-7): the identity
 * pages and the proxy may see, and nothing else — never a token.
 */
describe("readSessionUser — who is signed in, without refreshing", () => {
  async function seed(payload: SessionPayload, name = "__Secure-authjs.session-token") {
    jar.set(name, { value: await encodeSession(payload, name, SECRET), options: {} });
  }

  it("returns the identity fields and no token", async () => {
    await seed({ accessToken: "at-1", refreshToken: "rt-1", accessTokenExpiresAt: 0, user: USER });

    const user = await readSessionUser();

    expect(user).toEqual(USER);
    expect(JSON.stringify(user)).not.toMatch(/at-1|rt-1/);
  });

  it("does not refresh an access token that has expired", async () => {
    const { refreshBackendToken } = await import("@/server/auth/backend-token-exchange");
    await seed({ accessToken: "at-1", refreshToken: "rt-1", accessTokenExpiresAt: 1, user: USER });

    expect(await readSessionUser()).toEqual(USER);
    expect(refreshBackendToken).not.toHaveBeenCalled();
  });

  it("answers null with no cookie or an unreadable one", async () => {
    expect(await readSessionUser()).toBeNull();

    jar.set("__Secure-authjs.session-token", { value: "garbage", options: {} });
    expect(await readSessionUser()).toBeNull();
  });
});
