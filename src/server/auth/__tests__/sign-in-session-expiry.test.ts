import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { decodeSession, encodeSession } from "@/server/auth/session-cookie";

/**
 * RUK-310: the backend's `session_expires_at` must reach the session cookie
 * through every production sign-in path, and through refresh. Each path
 * copies the backend pair through its own assignment on the way to the
 * session writer, and a hop that rebuilds the pair from named fields would
 * drop the new one silently — every
 * type still checks, every other test stays green. So nothing between `fetch`
 * and the cookie jar is mocked here: the real HTTP client, the real runners,
 * the real session writer.
 *
 * Dev-bypass is deliberately absent: it never runs in production, so it proves
 * nothing about the paths users take.
 */

const SECRET = "test-secret-at-least-thirty-two-characters-long";
const NAME = "authjs.session-token";
// 2026-10-14T12:00:00Z
const NOW = Date.UTC(2026, 9, 14, 12, 0, 0);
const DAY = 24 * 60 * 60;

process.env.MAINTMODE_API_BASE_URL = "http://backend.test/maintmode";
process.env.MAINTMODE_AUTH_API_BASE_URL = "http://backend.test/auth";
process.env.MAINTMODE_AUTH_SECRET = SECRET;
process.env.MAINTMODE_BACKEND_S2S_TOKEN = "s2s-token-for-tests-0123456789abcdef";
process.env.MAINTMODE_APP_BASE_URL = "http://localhost:3000";
process.env.MAINTMODE_AUTH_PUBLIC_BASE_URL = "http://localhost:9000/auth";

const jar = new Map<string, { value: string; maxAge?: number }>();

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: ({ name, value, maxAge }: { name: string; value: string; maxAge?: number }) => {
      jar.set(name, { value, maxAge });
    },
  }),
}));

const fetchMock = vi.fn();

const { signInWithBackendLogin, signInWithDanceCode } = await import("@/server/auth/sign-in");
const { readActiveSession } = await import("@/server/auth/session-token");

const ME = { id: "u-1", email: "a@example.test", display_name: "A", oauth_provider: "", roles: ["admin"] };

function respond(body: unknown) {
  const text = JSON.stringify(body);
  return { ok: true, status: 200, statusText: "OK", text: async () => text };
}

/** The backend answers the sign-in call with `pair`, then `/me`. */
function backendAnswers(pair: Record<string, unknown>) {
  fetchMock.mockResolvedValueOnce(respond(pair)).mockResolvedValueOnce(respond(ME));
}

beforeEach(() => {
  jar.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the backend's session end reaches the cookie through every sign-in path", () => {
  it("break-glass (built-in runner): a 24h session gets a 24h cookie", async () => {
    backendAnswers({
      access_token: "at-1",
      refresh_token: "rt-1",
      expires_in: 300,
      session_expires_at: "2026-10-15T12:00:00Z",
    });

    await signInWithBackendLogin({ kind: "break-glass", password: "break-glass-test-password" });

    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/v1\/login\/break-glass$/);
    expect(jar.get(NAME)?.maxAge).toBe(DAY);
    expect(await decodeSession(jar.get(NAME)!.value, NAME, SECRET)).toMatchObject({
      sessionExpiresAt: NOW + DAY * 1000,
    });
  });

  it("OAuth dance (dance runner): a 60-day session gets a 60-day cookie", async () => {
    backendAnswers({
      access_token: "at-1",
      refresh_token: "rt-1",
      expires_in: 900,
      session_expires_at: "2026-12-13T12:00:00Z",
    });

    await signInWithDanceCode("dance-code", "binding-proof");

    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/v1\/login\/oauth\/code\/exchange$/);
    expect(jar.get(NAME)?.maxAge).toBe(60 * DAY);
    expect(await decodeSession(jar.get(NAME)!.value, NAME, SECRET)).toMatchObject({
      sessionExpiresAt: NOW + 60 * DAY * 1000,
    });
  });
});

describe("the backend's session end reaches the cookie through refresh", () => {
  // `refreshBackendToken` hands the parsed reply on whole; a version that
  // rebuilt it from named fields would drop the end here, with every mocked
  // refresh test still green.
  it("a rotating reply's end caps the rewritten cookie", async () => {
    const user = { id: "u-1", email: "a@example.test", displayName: "A", roles: ["admin"] };
    jar.set(NAME, {
      value: await encodeSession(
        {
          accessToken: "at-old",
          refreshToken: "rt-old",
          accessTokenExpiresAt: 0,
          user,
          sessionStartedAt: NOW,
        },
        NAME,
        SECRET,
      ),
    });
    fetchMock.mockResolvedValueOnce(
      respond({
        access_token: "at-2",
        refresh_token: "rt-2",
        expires_in: 900,
        session_expires_at: "2026-10-15T12:00:00Z",
      }),
    );

    await readActiveSession();

    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/v1\/refresh$/);
    expect(jar.get(NAME)?.maxAge).toBe(DAY);
    expect(await decodeSession(jar.get(NAME)!.value, NAME, SECRET)).toMatchObject({
      refreshToken: "rt-2",
      sessionExpiresAt: NOW + DAY * 1000,
    });
  });
});
