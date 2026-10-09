import { AsyncLocalStorage } from "node:async_hooks";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readWireFixture } from "./_harness";

/**
 * Session refresh — `POST /api/v1/refresh`, driven by the BFF's own
 * `readActiveSession` / `forceSessionRefresh`.
 *
 * The declared replies (`refresh.json`, transcribed from the backend; see its
 * manifest entry) go through the REAL HTTP client and the REAL session code,
 * with only `fetch` and the request's cookie jar stubbed. What is pinned is
 * what the BFF does with each shape: rotate, keep the refresh token it has,
 * retry, or end the session.
 *
 * Expectations are literals, never read back from the fixture.
 */

type WireCase = { status: number; body: Record<string, unknown>; headers?: Record<string, string> };
type RefreshWire = Record<
  "rotated" | "grace" | "reuse" | "loggedOut" | "expired" | "invalid" | "lockBusy",
  WireCase
>;

const wire = readWireFixture<RefreshWire>("refresh.json");

const SECRET = "contract-secret-at-least-thirty-two-chars";
const COOKIE = "authjs.session-token";

process.env.MAINTMODE_API_BASE_URL = "http://backend.test/maintmode";
process.env.MAINTMODE_AUTH_API_BASE_URL = "http://backend.test/auth";
process.env.MAINTMODE_AUTH_SECRET = SECRET;
process.env.MAINTMODE_APP_BASE_URL = "http://localhost:3000";
process.env.MAINTMODE_AUTH_PUBLIC_BASE_URL = "http://localhost:9000/auth";

class Jar extends Map<string, string> {
  writes = 0;
}
const requestJar = new AsyncLocalStorage<Jar>();

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => {
    const jar = requestJar.getStore();
    if (!jar) throw new Error("cookies() called outside a request");
    return {
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
      set: ({ name, value }: { name: string; value: string }) => {
        jar.set(name, value);
        jar.writes += 1;
      },
    };
  },
}));

const fetchMock = vi.fn();
let session: typeof import("@/server/auth/session-token");
let cookie: typeof import("@/server/auth/session-cookie");

beforeEach(async () => {
  // Settled refreshes are kept for a minute; every case starts from none.
  vi.resetModules();
  session = await import("@/server/auth/session-token");
  cookie = await import("@/server/auth/session-cookie");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function respond({ status, body, headers = {} }: WireCase) {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `status ${status}`,
    headers: new Headers(headers),
    text: async () => text,
  };
}

async function signedInJar(refreshToken = "refresh-current"): Promise<Jar> {
  const jar = new Jar();
  jar.set(
    COOKIE,
    await cookie.encodeSession(
      {
        accessToken: "access-current",
        refreshToken,
        accessTokenExpiresAt: 0,
        user: { id: "u-1", email: "u-1@example.test", displayName: "U", roles: [] },
      },
      COOKIE,
      SECRET,
    ),
  );
  return jar;
}

async function stored(jar: Jar) {
  const value = jar.get(COOKIE);
  return value ? cookie.decodeSession(value, COOKIE, SECRET) : null;
}

describe("refresh — the request", () => {
  it("posts the refresh token from the cookie, in the body, to /api/v1/refresh", async () => {
    fetchMock.mockResolvedValueOnce(respond(wire.rotated));

    await requestJar.run(await signedInJar(), () => session.readActiveSession());

    expect(String(fetchMock.mock.calls[0][0])).toBe("http://backend.test/auth/api/v1/refresh");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ refresh_token: "refresh-current" });
  });
});

describe("refresh — as declared", () => {
  it("stores both tokens of a rotation", async () => {
    fetchMock.mockResolvedValueOnce(respond(wire.rotated));
    const jar = await signedInJar();

    const result = await requestJar.run(jar, () => session.readActiveSession());

    expect(result).toMatchObject({ accessToken: "<access-token>", refreshToken: "<refresh-token>" });
    expect(await stored(jar)).toMatchObject({
      accessToken: "<access-token>",
      refreshToken: "<refresh-token>",
    });
  });

  it("uses the grace reply's access token and keeps the refresh token the cookie holds", async () => {
    // Precondition with a literal field name: the case only means something if
    // the declared grace reply really lacks the refresh token.
    expect(Object.keys(wire.grace.body)).not.toContain("refresh_token");
    fetchMock.mockResolvedValueOnce(respond(wire.grace));
    const jar = await signedInJar();
    const before = jar.get(COOKIE);

    const result = await requestJar.run(jar, () => session.readActiveSession());

    expect(result).toMatchObject({ accessToken: "<access-token>", refreshToken: "refresh-current" });
    expect(jar.writes).toBe(0);
    expect(jar.get(COOKIE)).toBe(before);
  });

  it.each(["reuse", "loggedOut", "expired", "invalid"] as const)(
    "ends the session on the declared %s refusal, without a retry",
    async (shape) => {
      expect(wire[shape].status).toBe(401);
      fetchMock.mockResolvedValue(respond(wire[shape]));
      const jar = await signedInJar();

      expect(await requestJar.run(jar, () => session.readActiveSession())).toBeNull();
      expect(jar.get(COOKIE)).toBe("");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("retries the declared lock-busy refusal after its Retry-After, keeping the session", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fetchMock.mockResolvedValueOnce(respond(wire.lockBusy)).mockResolvedValueOnce(respond(wire.grace));
    const jar = await signedInJar();

    const pending = requestJar.run(jar, () => session.readActiveSession());
    for (let i = 0; i < 1_000 && fetchMock.mock.calls.length < 1; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(await pending).toMatchObject({ accessToken: "<access-token>", refreshToken: "refresh-current" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(jar.get(COOKIE)).not.toBe("");
  });

  it("keeps the session when lock-busy persists, failing the request as unavailable", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue(respond(wire.lockBusy));
    const jar = await signedInJar();
    const before = jar.get(COOKIE);

    const settled = requestJar
      .run(jar, () => session.forceSessionRefresh())
      .then(
        () => null,
        (error: unknown) => error,
      );
    for (let i = 0; i < 1_000 && fetchMock.mock.calls.length < 1; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    await vi.advanceTimersByTimeAsync(2_000);

    const error = await settled;
    expect(error).toBeInstanceOf(session.SessionRefreshUnavailableError);
    const { normalizeRouteError } = await import("@/server/backend/errors/bff-error");
    expect(normalizeRouteError(error)).toMatchObject({ status: 503, code: "BACKEND_UNAVAILABLE" });
    expect(jar.get(COOKIE)).toBe(before);
  });
});
