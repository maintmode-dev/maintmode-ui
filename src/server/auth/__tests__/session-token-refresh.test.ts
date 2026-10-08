import { AsyncLocalStorage } from "node:async_hooks";

import { decodeSession, encodeSession } from "@/server/auth/session-cookie";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { forceSessionRefresh, readActiveSession, type SessionPayload } from "@/server/auth/session-token";
import type { BackendTokenPair } from "@/server/auth/contracts";

const SECRET = "test-secret-at-least-thirty-two-characters-long";
const COOKIE = "authjs.session-token";

// One cookie jar per simulated request. `cookies()` resolves against whichever
// request the calling code is running in, the way Next's request-scoped storage
// does — which is what lets a refresh write land on the wrong user's response.
type Jar = Map<string, string>;
const requestJar = new AsyncLocalStorage<Jar>();

vi.mock("next/headers", () => ({
  cookies: () => {
    const jar = requestJar.getStore();
    if (!jar) throw new Error("cookies() called outside a request");
    return Promise.resolve({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
      set: ({ name, value }: { name: string; value: string }) => {
        jar.set(name, value);
      },
    });
  },
}));

vi.mock("@/shared/config/auth-config", () => ({
  parseMaintmodeAuthConfig: () => ({ authSecret: SECRET, appBaseUrl: "http://localhost:3000" }),
}));

// Counts session-cookie decodes that have settled. A request's path from
// "cookie decoded" to "joined or started a refresh" is synchronous, so once a
// `vi.waitFor` (a macrotask) sees the count, every request counted has already
// claimed its place in the in-flight map. That replaces a fixed sleep, which
// under a loaded full-suite run let the requests arrive in the opposite order.
const decodes = vi.hoisted(() => ({ settled: 0 }));
vi.mock("@/server/auth/session-cookie", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/session-cookie")>();
  return {
    ...actual,
    decodeSession: async (...args: Parameters<typeof actual.decodeSession>) => {
      try {
        return await actual.decodeSession(...args);
      } finally {
        decodes.settled += 1;
      }
    },
  };
});

/** Resolves once `count` requests have decoded their cookie and reached the refresh. */
async function requestsReachedRefresh(count: number): Promise<void> {
  await vi.waitFor(() => expect(decodes.settled).toBe(count));
}

const refreshBackendToken = vi.fn<(refreshToken: string) => Promise<BackendTokenPair>>();
vi.mock("@/server/auth/backend-token-exchange", () => ({
  refreshBackendToken: (refreshToken: string) => refreshBackendToken(refreshToken),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function jarFor(userId: string, refreshToken: string, expiresAt = 0): Promise<Jar> {
  const payload: SessionPayload = {
    accessToken: `access-${userId}-old`,
    refreshToken,
    accessTokenExpiresAt: expiresAt,
    user: { id: userId, email: `${userId}@example.test`, displayName: userId, roles: [] },
  };
  const value = await encodeSession(payload, COOKIE, SECRET);
  return new Map([[COOKIE, value]]);
}

async function cookiePayload(jar: Jar) {
  const value = jar.get(COOKIE);
  return value ? decodeSession(value, COOKIE, SECRET) : null;
}

beforeEach(() => {
  refreshBackendToken.mockReset();
  decodes.settled = 0;
});

describe("session refresh never crosses users", () => {
  // H-1 (security review 2026-10-07). A process-wide in-flight slot handed user
  // B the pair minted for user A whenever their refreshes overlapped.
  it("gives each user the pair minted for their own refresh token while both are in flight", async () => {
    const pending = new Map<string, ReturnType<typeof deferred<BackendTokenPair>>>();
    refreshBackendToken.mockImplementation((rt) => {
      const d = deferred<BackendTokenPair>();
      pending.set(rt, d);
      return d.promise;
    });
    const jarA = await jarFor("user-a", "refresh-a");
    const jarB = await jarFor("user-b", "refresh-b");

    const sessionA = requestJar.run(jarA, () => readActiveSession());
    await vi.waitFor(() => expect(pending.has("refresh-a")).toBe(true));
    const sessionB = requestJar.run(jarB, () => readActiveSession());
    // B reaches the refresh while A's is still pending.
    await requestsReachedRefresh(2);

    pending
      .get("refresh-a")!
      .resolve({ access_token: "access-a-new", refresh_token: "refresh-a-2", expires_in: 900 });
    pending
      .get("refresh-b")
      ?.resolve({ access_token: "access-b-new", refresh_token: "refresh-b-2", expires_in: 900 });

    const [a, b] = await Promise.all([sessionA, sessionB]);
    expect(a).toMatchObject({ accessToken: "access-a-new", user: { id: "user-a" } });
    expect(b).toMatchObject({ accessToken: "access-b-new", user: { id: "user-b" } });
    expect(refreshBackendToken.mock.calls.map(([rt]) => rt).sort()).toEqual(["refresh-a", "refresh-b"]);

    // Each response carries its own rotated session, not the other user's.
    expect(await cookiePayload(jarA)).toMatchObject({ refreshToken: "refresh-a-2", user: { id: "user-a" } });
    expect(await cookiePayload(jarB)).toMatchObject({ refreshToken: "refresh-b-2", user: { id: "user-b" } });
  });

  it("writes the rotated cookie into every request sharing a refresh, not only the first", async () => {
    const d = deferred<BackendTokenPair>();
    refreshBackendToken.mockReturnValue(d.promise);
    // Two parallel requests from one browser: same session, two responses.
    const first = await jarFor("user-a", "refresh-a");
    const second = await jarFor("user-a", "refresh-a");

    const one = requestJar.run(first, () => forceSessionRefresh());
    const two = requestJar.run(second, () => forceSessionRefresh());
    // Both requests have joined the one refresh before it settles.
    await requestsReachedRefresh(2);
    d.resolve({ access_token: "access-a-new", refresh_token: "refresh-a-2", expires_in: 900 });
    await Promise.all([one, two]);

    // The same token is spent once: a second spend lands in the backend's grace
    // window, which answers without a refresh token and ends the session.
    expect(refreshBackendToken).toHaveBeenCalledTimes(1);
    expect(await cookiePayload(first)).toMatchObject({ refreshToken: "refresh-a-2" });
    expect(await cookiePayload(second)).toMatchObject({ refreshToken: "refresh-a-2" });
  });

  it("clears only the session whose refresh failed", async () => {
    refreshBackendToken.mockImplementation((rt) =>
      rt === "refresh-a"
        ? Promise.reject(new Error("401"))
        : Promise.resolve({ access_token: "access-b-new", refresh_token: "refresh-b-2", expires_in: 900 }),
    );
    const jarA = await jarFor("user-a", "refresh-a");
    const jarB = await jarFor("user-b", "refresh-b");

    const [a, b] = await Promise.all([
      requestJar.run(jarA, () => forceSessionRefresh()),
      requestJar.run(jarB, () => forceSessionRefresh()),
    ]);

    expect(a).toBeNull();
    expect(jarA.get(COOKIE)).toBe("");
    expect(b).toMatchObject({ user: { id: "user-b" } });
    expect(await cookiePayload(jarB)).toMatchObject({ refreshToken: "refresh-b-2" });
  });

  it("fails one user's refresh without touching another's still in flight", async () => {
    const pending = new Map<string, ReturnType<typeof deferred<BackendTokenPair>>>();
    refreshBackendToken.mockImplementation((rt) => {
      const d = deferred<BackendTokenPair>();
      pending.set(rt, d);
      return d.promise;
    });
    const jarA = await jarFor("user-a", "refresh-a");
    const jarB = await jarFor("user-b", "refresh-b");

    const sessionA = requestJar.run(jarA, () => forceSessionRefresh());
    const sessionB = requestJar.run(jarB, () => forceSessionRefresh());
    await requestsReachedRefresh(2);
    await vi.waitFor(() => expect(pending.size).toBe(2));

    pending.get("refresh-a")!.reject(new Error("401"));
    expect(await sessionA).toBeNull();
    expect(jarA.get(COOKIE)).toBe("");
    pending
      .get("refresh-b")!
      .resolve({ access_token: "access-b-new", refresh_token: "refresh-b-2", expires_in: 900 });

    expect(await sessionB).toMatchObject({ accessToken: "access-b-new", user: { id: "user-b" } });
    expect(await cookiePayload(jarB)).toMatchObject({ refreshToken: "refresh-b-2" });
  });

  it("refuses a refresh token that is already being refreshed for another user", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deferred<BackendTokenPair>();
    refreshBackendToken.mockReturnValue(d.promise);
    const jarA = await jarFor("user-a", "refresh-shared");
    const jarB = await jarFor("user-b", "refresh-shared");

    // A's refresh is in flight before B shows up; started together, either one
    // could decode first and the test would be asserting a coin toss.
    const sessionA = requestJar.run(jarA, () => forceSessionRefresh());
    await requestsReachedRefresh(1);
    const sessionB = requestJar.run(jarB, () => forceSessionRefresh());
    await requestsReachedRefresh(2);
    d.resolve({ access_token: "access-a-new", refresh_token: "refresh-a-2", expires_in: 900 });

    const [a, b] = await Promise.all([sessionA, sessionB]);
    expect(refreshBackendToken).toHaveBeenCalledTimes(1);
    expect(a).toMatchObject({ user: { id: "user-a" } });
    expect(b).toBeNull();
    expect(jarB.get(COOKIE)).toBe("");
    // Never legitimate, so it is logged — without the token or either user.
    const lines = log.mock.calls.map(([line]) => String(line));
    expect(lines.some((line) => line.includes("refresh token presented by two different users"))).toBe(true);
    expect(lines.join("\n")).not.toMatch(/refresh-shared|user-a|user-b/);
    log.mockRestore();
  });

  it("lets the next refresh of the same token through once the previous one settled", async () => {
    refreshBackendToken.mockRejectedValueOnce(new Error("503"));
    refreshBackendToken.mockResolvedValueOnce({ access_token: "a2", refresh_token: "r2", expires_in: 900 });

    await requestJar.run(await jarFor("user-a", "refresh-a"), () => forceSessionRefresh());
    const retried = await requestJar.run(await jarFor("user-a", "refresh-a"), () => forceSessionRefresh());

    // A settled failure must not stay cached as the answer for that token.
    expect(refreshBackendToken).toHaveBeenCalledTimes(2);
    expect(retried).toMatchObject({ accessToken: "a2" });
  });

  // The clear happens in each caller's own request context. Run once inside the
  // shared promise — the shape the process-wide slot had — it lands only on the
  // response of whichever request started the refresh, and the others keep a
  // cookie holding a refresh token the backend has already spent.
  it.each([
    ["the backend rejects the refresh", () => Promise.reject(new Error("401"))],
    [
      "the backend answers without a usable expiry",
      () => Promise.resolve({ access_token: "access-a-new", refresh_token: "refresh-a-2", expires_in: 0 }),
    ],
  ])("ends the session in every request sharing a refresh when %s", async (_case, outcome) => {
    const d = deferred<void>();
    refreshBackendToken.mockImplementation(() => d.promise.then(outcome));
    const first = await jarFor("user-a", "refresh-a");
    const second = await jarFor("user-a", "refresh-a");

    const one = requestJar.run(first, () => forceSessionRefresh());
    const two = requestJar.run(second, () => forceSessionRefresh());
    await requestsReachedRefresh(2);
    d.resolve();

    expect(await Promise.all([one, two])).toEqual([null, null]);
    expect(refreshBackendToken).toHaveBeenCalledTimes(1);
    expect(first.get(COOKIE)).toBe("");
    expect(second.get(COOKIE)).toBe("");
  });

  // A slot left behind after success is never reclaimed — the map grows by one
  // entry per refresh for the life of the process — and a later request still
  // holding that token would be handed the stale pair instead of the backend's
  // answer.
  it("releases the in-flight slot after a successful refresh too", async () => {
    refreshBackendToken
      .mockResolvedValueOnce({ access_token: "a2", refresh_token: "r2", expires_in: 900 })
      .mockResolvedValueOnce({ access_token: "a3", refresh_token: "r3", expires_in: 900 });

    await requestJar.run(await jarFor("user-a", "refresh-a"), () => forceSessionRefresh());
    const later = await requestJar.run(await jarFor("user-a", "refresh-a"), () => forceSessionRefresh());

    expect(refreshBackendToken).toHaveBeenCalledTimes(2);
    expect(later).toMatchObject({ accessToken: "a3" });
  });
});

describe("readActiveSession refreshes only near expiry", () => {
  it("refreshes an access token inside the one-minute leeway", async () => {
    refreshBackendToken.mockResolvedValue({ access_token: "a2", refresh_token: "r2", expires_in: 900 });
    const jar = await jarFor("user-a", "refresh-a", Date.now() + 30_000);

    const session = await requestJar.run(jar, () => readActiveSession());

    expect(refreshBackendToken).toHaveBeenCalledWith("refresh-a");
    expect(session).toMatchObject({ accessToken: "a2" });
  });

  // The new expiry is what the leeway check reads next time. In milliseconds:
  // read as seconds, a 15-minute token looks expired at once and every request
  // spends the refresh token again.
  it("persists an expiry expires_in seconds ahead, so the next read spends nothing", async () => {
    refreshBackendToken.mockResolvedValue({ access_token: "a2", refresh_token: "r2", expires_in: 900 });
    const jar = await jarFor("user-a", "refresh-a");
    const before = Date.now();

    await requestJar.run(jar, () => readActiveSession());
    const stored = await cookiePayload(jar);
    const again = await requestJar.run(jar, () => readActiveSession());

    expect(stored!.accessTokenExpiresAt).toBeGreaterThanOrEqual(before + 900_000);
    expect(stored!.accessTokenExpiresAt).toBeLessThanOrEqual(Date.now() + 900_000);
    expect(refreshBackendToken).toHaveBeenCalledTimes(1);
    expect(again).toMatchObject({ accessToken: "a2" });
  });

  it("returns a token with time left as it is, spending nothing", async () => {
    const jar = await jarFor("user-a", "refresh-a", Date.now() + 5 * 60_000);

    const session = await requestJar.run(jar, () => readActiveSession());

    expect(refreshBackendToken).not.toHaveBeenCalled();
    expect(session).toMatchObject({ accessToken: "access-user-a-old", refreshToken: "refresh-a" });
  });
});
