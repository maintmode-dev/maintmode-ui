import { AsyncLocalStorage } from "node:async_hooks";

import { decodeSession, encodeSession, type SessionPayload } from "@/server/auth/session-cookie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BackendRefreshReply } from "@/server/auth/contracts";

const SECRET = "test-secret-at-least-thirty-two-characters-long";
const COOKIE = "authjs.session-token";

// One cookie jar per simulated request. `cookies()` resolves against whichever
// request the calling code is running in, the way Next's request-scoped storage
// does — which is what lets a refresh write land on the wrong user's response.
// `writes` records what the code under test set, so a test can tell
// "the cookie was not rewritten" from "it was rewritten with the same tokens".
class Jar extends Map<string, string> {
  writes = 0;
}
const requestJar = new AsyncLocalStorage<Jar>();

vi.mock("next/headers", () => ({
  cookies: () => {
    const jar = requestJar.getStore();
    if (!jar) throw new Error("cookies() called outside a request");
    return Promise.resolve({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
      set: ({ name, value }: { name: string; value: string }) => {
        jar.set(name, value);
        jar.writes += 1;
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

const refreshBackendToken = vi.fn<(refreshToken: string) => Promise<BackendRefreshReply>>();
vi.mock("@/server/auth/backend-token-exchange", () => ({
  refreshBackendToken: (refreshToken: string) => refreshBackendToken(refreshToken),
}));

// The module keeps settled refreshes for a minute, so every test gets a fresh
// copy — and the error classes that copy checks `instanceof` against.
let session: typeof import("@/server/auth/session-token");
let BackendAuthError: typeof import("@/server/auth/contracts").BackendAuthError;

beforeEach(async () => {
  vi.resetModules();
  session = await import("@/server/auth/session-token");
  ({ BackendAuthError } = await import("@/server/auth/contracts"));
  refreshBackendToken.mockReset();
  decodes.settled = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A backend refusal as `postBackendJson` throws it. */
function backendError(status: number, message = "", retryAfter?: string) {
  const body = JSON.stringify({ code: status === 401 ? "unauthorized" : "x", message });
  return new BackendAuthError(status, body, undefined, retryAfter);
}

async function jarFor(
  userId: string,
  refreshToken: string,
  { expiresAt = 0 }: { expiresAt?: number } = {},
): Promise<Jar> {
  const payload: SessionPayload = {
    accessToken: `access-${userId}-old`,
    refreshToken,
    accessTokenExpiresAt: expiresAt,
    user: { id: userId, email: `${userId}@example.test`, displayName: userId, roles: [] },
  };
  const jar = new Jar();
  jar.set(COOKIE, await encodeSession(payload, COOKIE, SECRET));
  return jar;
}

async function cookiePayload(jar: Jar) {
  const value = jar.get(COOKIE);
  return value ? decodeSession(value, COOKIE, SECRET) : null;
}

/**
 * Resolves once the retry's timer is armed. Not `vi.waitFor`: under fake timers
 * it advances the clock on every poll, which would eat into the delay a test
 * is measuring. `setImmediate` is left real, so this only lets I/O settle.
 */
async function untilRetryScheduled(): Promise<void> {
  for (let i = 0; i < 1_000 && vi.getTimerCount() === 0; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  expect(vi.getTimerCount()).toBe(1);
  expect(refreshBackendToken).toHaveBeenCalledTimes(1);
}

const ROTATED = { access_token: "access-a-new", refresh_token: "refresh-a-2", expires_in: 900 };

describe("session refresh never crosses users", () => {
  // H-1 (security review 2026-10-07). A process-wide in-flight slot handed user
  // B the pair minted for user A whenever their refreshes overlapped.
  it("gives each user the pair minted for their own refresh token while both are in flight", async () => {
    const pending = new Map<string, ReturnType<typeof deferred<BackendRefreshReply>>>();
    refreshBackendToken.mockImplementation((rt) => {
      const d = deferred<BackendRefreshReply>();
      pending.set(rt, d);
      return d.promise;
    });
    const jarA = await jarFor("user-a", "refresh-a");
    const jarB = await jarFor("user-b", "refresh-b");

    const sessionA = requestJar.run(jarA, () => session.readActiveSession());
    await vi.waitFor(() => expect(pending.has("refresh-a")).toBe(true));
    const sessionB = requestJar.run(jarB, () => session.readActiveSession());
    // B reaches the refresh while A's is still pending.
    await requestsReachedRefresh(2);

    pending.get("refresh-a")!.resolve(ROTATED);
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
    const d = deferred<BackendRefreshReply>();
    refreshBackendToken.mockReturnValue(d.promise);
    // Two parallel requests from one browser: same session, two responses.
    const first = await jarFor("user-a", "refresh-a");
    const second = await jarFor("user-a", "refresh-a");

    const one = requestJar.run(first, () => session.forceSessionRefresh());
    const two = requestJar.run(second, () => session.forceSessionRefresh());
    // Both requests have joined the one refresh before it settles.
    await requestsReachedRefresh(2);
    d.resolve(ROTATED);
    await Promise.all([one, two]);

    // The same token is spent once.
    expect(refreshBackendToken).toHaveBeenCalledTimes(1);
    expect(await cookiePayload(first)).toMatchObject({ refreshToken: "refresh-a-2" });
    expect(await cookiePayload(second)).toMatchObject({ refreshToken: "refresh-a-2" });
  });

  it("clears only the session whose refresh the backend refused", async () => {
    refreshBackendToken.mockImplementation((rt) =>
      rt === "refresh-a"
        ? Promise.reject(backendError(401, "invalid refresh token"))
        : Promise.resolve({ access_token: "access-b-new", refresh_token: "refresh-b-2", expires_in: 900 }),
    );
    const jarA = await jarFor("user-a", "refresh-a");
    const jarB = await jarFor("user-b", "refresh-b");

    const [a, b] = await Promise.all([
      requestJar.run(jarA, () => session.forceSessionRefresh()),
      requestJar.run(jarB, () => session.forceSessionRefresh()),
    ]);

    expect(a).toBeNull();
    expect(jarA.get(COOKIE)).toBe("");
    expect(b).toMatchObject({ user: { id: "user-b" } });
    expect(await cookiePayload(jarB)).toMatchObject({ refreshToken: "refresh-b-2" });
  });

  it("fails one user's refresh without touching another's still in flight", async () => {
    const pending = new Map<string, ReturnType<typeof deferred<BackendRefreshReply>>>();
    refreshBackendToken.mockImplementation((rt) => {
      const d = deferred<BackendRefreshReply>();
      pending.set(rt, d);
      return d.promise;
    });
    const jarA = await jarFor("user-a", "refresh-a");
    const jarB = await jarFor("user-b", "refresh-b");

    const sessionA = requestJar.run(jarA, () => session.forceSessionRefresh());
    const sessionB = requestJar.run(jarB, () => session.forceSessionRefresh());
    await requestsReachedRefresh(2);
    await vi.waitFor(() => expect(pending.size).toBe(2));

    pending.get("refresh-a")!.reject(backendError(401, "token reuse detected"));
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
    const d = deferred<BackendRefreshReply>();
    refreshBackendToken.mockReturnValue(d.promise);
    const jarA = await jarFor("user-a", "refresh-shared");
    const jarB = await jarFor("user-b", "refresh-shared");

    // A's refresh is in flight before B shows up; started together, either one
    // could decode first and the test would be asserting a coin toss.
    const sessionA = requestJar.run(jarA, () => session.forceSessionRefresh());
    await requestsReachedRefresh(1);
    const sessionB = requestJar.run(jarB, () => session.forceSessionRefresh());
    await requestsReachedRefresh(2);
    d.resolve(ROTATED);

    const [a, b] = await Promise.all([sessionA, sessionB]);
    expect(refreshBackendToken).toHaveBeenCalledTimes(1);
    expect(a).toMatchObject({ user: { id: "user-a" } });
    expect(b).toBeNull();
    expect(jarB.get(COOKIE)).toBe("");
    // Never legitimate, so it is logged — without the token or either user.
    const lines = log.mock.calls.map(([line]) => String(line));
    expect(lines.some((line) => line.includes("refresh token presented by two different users"))).toBe(true);
    expect(lines.join("\n")).not.toMatch(/refresh-shared|user-a|user-b/);
  });

  it("ends the session in every request sharing a refresh the backend refused", async () => {
    const d = deferred<void>();
    refreshBackendToken.mockImplementation(() =>
      d.promise.then(() => Promise.reject(backendError(401, "logout already"))),
    );
    const first = await jarFor("user-a", "refresh-a");
    const second = await jarFor("user-a", "refresh-a");

    const one = requestJar.run(first, () => session.forceSessionRefresh());
    const two = requestJar.run(second, () => session.forceSessionRefresh());
    await requestsReachedRefresh(2);
    d.resolve();

    // The clear happens in each caller's own request context: run once inside
    // the shared promise it would land only on the first request's response.
    expect(await Promise.all([one, two])).toEqual([null, null]);
    expect(refreshBackendToken).toHaveBeenCalledTimes(1);
    expect(first.get(COOKIE)).toBe("");
    expect(second.get(COOKIE)).toBe("");
  });
});

describe("a grace reply keeps the refresh token the cookie already holds", () => {
  // Inside the backend's 30s grace window a just-rotated token is answered with
  // a new access token and NO refresh token (`omitempty`), meaning "keep the one
  // you have". Treating that as a failure signed the racing request out.
  it.each([
    ["absent", { access_token: "access-grace", expires_in: 900 }],
    ["empty", { access_token: "access-grace", refresh_token: "", expires_in: 900 }],
  ])(
    "uses the new access token for this request and leaves the cookie alone when refresh_token is %s",
    async (_case, reply) => {
      refreshBackendToken.mockResolvedValue(reply);
      const jar = await jarFor("user-a", "refresh-a");
      const before = jar.get(COOKIE);

      const result = await requestJar.run(jar, () => session.readActiveSession());

      expect(result).toMatchObject({ accessToken: "access-grace", refreshToken: "refresh-a" });
      // Not rewritten at all — not even with the same refresh token — so the
      // winner's rotated cookie is the only one the browser receives.
      expect(jar.writes).toBe(0);
      expect(jar.get(COOKIE)).toBe(before);
    },
  );

  it("never persists an empty refresh token, even for requests served from the settled refresh", async () => {
    refreshBackendToken.mockResolvedValue({
      access_token: "access-grace",
      refresh_token: "",
      expires_in: 900,
    });
    const first = await jarFor("user-a", "refresh-a");
    const late = await jarFor("user-a", "refresh-a");

    await requestJar.run(first, () => session.forceSessionRefresh());
    const result = await requestJar.run(late, () => session.forceSessionRefresh());

    expect(refreshBackendToken).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ accessToken: "access-grace", refreshToken: "refresh-a" });
    expect(first.writes + late.writes).toBe(0);
    expect(await cookiePayload(late)).toMatchObject({ refreshToken: "refresh-a" });
  });

  it("writes the cookie when the grace reply does carry the successor", async () => {
    refreshBackendToken.mockResolvedValue(ROTATED);
    const jar = await jarFor("user-a", "refresh-a");

    await requestJar.run(jar, () => session.readActiveSession());

    expect(jar.writes).toBe(1);
    expect(await cookiePayload(jar)).toMatchObject({
      accessToken: "access-a-new",
      refreshToken: "refresh-a-2",
    });
  });
});

describe("a settled refresh answers late requests for a while", () => {
  // A request that left the browser before the winner's cookie came back still
  // carries the old refresh token. Spending it again would meet the grace reply
  // at best and, past the grace window, reuse detection — which revokes the
  // whole session.
  it("hands a request arriving after the refresh settled the same pair, without a second backend call", async () => {
    refreshBackendToken.mockResolvedValueOnce(ROTATED);
    const winner = await jarFor("user-a", "refresh-a");
    const late = await jarFor("user-a", "refresh-a");

    const first = await requestJar.run(winner, () => session.forceSessionRefresh());
    const second = await requestJar.run(late, () => session.forceSessionRefresh());

    expect(refreshBackendToken).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    // Every cookie written for this rotation carries identical tokens.
    const [a, b] = [await cookiePayload(winner), await cookiePayload(late)];
    expect(b).toMatchObject({ accessToken: a!.accessToken, refreshToken: "refresh-a-2" });
    expect(a!.accessTokenExpiresAt).toBe(b!.accessTokenExpiresAt);
  });

  it("goes back to the backend once the settled refresh is older than the TTL", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    refreshBackendToken.mockResolvedValueOnce(ROTATED).mockResolvedValueOnce({
      access_token: "access-a-3",
      refresh_token: "refresh-a-3",
      expires_in: 900,
    });

    await requestJar.run(await jarFor("user-a", "refresh-a"), () => session.forceSessionRefresh());
    vi.setSystemTime(Date.now() + session.REFRESH_RESULT_TTL_MS - 1_000);
    const within = await requestJar.run(await jarFor("user-a", "refresh-a"), () =>
      session.forceSessionRefresh(),
    );
    vi.setSystemTime(Date.now() + 2_000);
    const after = await requestJar.run(await jarFor("user-a", "refresh-a"), () =>
      session.forceSessionRefresh(),
    );

    expect(within).toMatchObject({ accessToken: "access-a-new" });
    expect(after).toMatchObject({ accessToken: "access-a-3" });
    expect(refreshBackendToken).toHaveBeenCalledTimes(2);
  });

  it("keeps the TTL between 30 and 60 seconds — past the backend's grace window, not much longer", () => {
    expect(session.REFRESH_RESULT_TTL_MS).toBeGreaterThan(30_000);
    expect(session.REFRESH_RESULT_TTL_MS).toBeLessThanOrEqual(60_000);
  });

  it("does not keep a failed refresh as the answer for its token", async () => {
    refreshBackendToken.mockRejectedValueOnce(backendError(401, "invalid refresh token"));
    refreshBackendToken.mockResolvedValueOnce({ access_token: "a2", refresh_token: "r2", expires_in: 900 });

    await requestJar.run(await jarFor("user-a", "refresh-a"), () => session.forceSessionRefresh());
    const retried = await requestJar.run(await jarFor("user-a", "refresh-a"), () =>
      session.forceSessionRefresh(),
    );

    expect(refreshBackendToken).toHaveBeenCalledTimes(2);
    expect(retried).toMatchObject({ accessToken: "a2" });
  });
});

describe("a transient refresh failure keeps the session", () => {
  it.each([
    ["the lock is busy (429)", () => backendError(429, "lock is already held", "1")],
    ["the lock is busy (409, as swagger documents it)", () => backendError(409, "lock is already held")],
    ["the backend fails (500)", () => backendError(500, "internal server error")],
    ["the backend is unavailable (503)", () => backendError(503)],
    ["the network fails", () => new TypeError("fetch failed")],
    ["the request times out", () => new DOMException("This operation was aborted", "AbortError")],
  ])("retries once when %s, and keeps the rotated pair", async (_case, failure) => {
    refreshBackendToken.mockRejectedValueOnce(failure()).mockResolvedValueOnce(ROTATED);
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const jar = await jarFor("user-a", "refresh-a");

    const pending = requestJar.run(jar, () => session.forceSessionRefresh());
    await untilRetryScheduled();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(await pending).toMatchObject({ accessToken: "access-a-new" });
    expect(refreshBackendToken).toHaveBeenCalledTimes(2);
    expect(await cookiePayload(jar)).toMatchObject({ refreshToken: "refresh-a-2" });
  });

  it("waits for the backend's Retry-After before the retry", async () => {
    refreshBackendToken.mockRejectedValueOnce(backendError(429, "lock is already held", "1"));
    refreshBackendToken.mockResolvedValueOnce(ROTATED);
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const jar = await jarFor("user-a", "refresh-a");

    const pending = requestJar.run(jar, () => session.forceSessionRefresh());
    await untilRetryScheduled();
    await vi.advanceTimersByTimeAsync(999);
    expect(refreshBackendToken).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await pending;
    expect(refreshBackendToken).toHaveBeenCalledTimes(2);
  });

  it("caps a long Retry-After: the user's request is waiting on it", async () => {
    refreshBackendToken.mockRejectedValueOnce(backendError(429, "lock is already held", "120"));
    refreshBackendToken.mockResolvedValueOnce(ROTATED);
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const jar = await jarFor("user-a", "refresh-a");

    const pending = requestJar.run(jar, () => session.forceSessionRefresh());
    await untilRetryScheduled();
    await vi.advanceTimersByTimeAsync(2_000);

    await pending;
    expect(refreshBackendToken).toHaveBeenCalledTimes(2);
  });

  it("fails just this request after the retry fails too, leaving the cookie untouched", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    refreshBackendToken.mockRejectedValue(backendError(503));
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const jar = await jarFor("user-a", "refresh-a");
    const before = jar.get(COOKIE);

    const pending = requestJar.run(jar, () => session.forceSessionRefresh());
    const settled = pending.then(
      () => null,
      (error: unknown) => error,
    );
    await untilRetryScheduled();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(await settled).toBeInstanceOf(session.SessionRefreshUnavailableError);
    expect(refreshBackendToken).toHaveBeenCalledTimes(2);
    expect(jar.writes).toBe(0);
    expect(jar.get(COOKIE)).toBe(before);
    // Logged by status alone: no token, no user.
    const lines = log.mock.calls.map(([line]) => String(line)).join("\n");
    expect(lines).toContain("backend answered 503");
    expect(lines).not.toMatch(/refresh-a|access-user-a|user-a/);
  });

  it.each([
    ["another 4xx", () => Promise.reject(backendError(400, "invalid request"))],
    ["a reply without a usable expiry", () => Promise.resolve({ ...ROTATED, expires_in: 0 })],
  ])("does not retry %s, and does not clear the session either", async (_case, outcome) => {
    refreshBackendToken.mockImplementation(outcome);
    const jar = await jarFor("user-a", "refresh-a");

    await expect(requestJar.run(jar, () => session.forceSessionRefresh())).rejects.toBeInstanceOf(
      session.SessionRefreshUnavailableError,
    );
    expect(refreshBackendToken).toHaveBeenCalledTimes(1);
    expect(jar.writes).toBe(0);
  });

  it("ends the session when the retry gets a definitive answer", async () => {
    refreshBackendToken
      .mockRejectedValueOnce(backendError(429, "lock is already held", "0"))
      .mockRejectedValueOnce(backendError(401, "token reuse detected"));
    const jar = await jarFor("user-a", "refresh-a");

    expect(await requestJar.run(jar, () => session.forceSessionRefresh())).toBeNull();
    expect(jar.get(COOKIE)).toBe("");
  });

  it("serves the current session while its access token still has time left", async () => {
    refreshBackendToken.mockRejectedValue(backendError(503));
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    // Inside the one-minute leeway, so a refresh is attempted, but not expired.
    const jar = await jarFor("user-a", "refresh-a", { expiresAt: Date.now() + 30_000 });

    const pending = requestJar.run(jar, () => session.readActiveSession());
    await untilRetryScheduled();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(await pending).toMatchObject({ accessToken: "access-user-a-old", refreshToken: "refresh-a" });
    expect(jar.writes).toBe(0);
  });

  it("throws from readActiveSession once the access token has expired, keeping the cookie", async () => {
    refreshBackendToken.mockRejectedValue(new TypeError("fetch failed"));
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const jar = await jarFor("user-a", "refresh-a", { expiresAt: Date.now() - 1 });

    const settled = requestJar
      .run(jar, () => session.readActiveSession())
      .then(
        () => null,
        (error: unknown) => error,
      );
    await untilRetryScheduled();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(await settled).toBeInstanceOf(session.SessionRefreshUnavailableError);
    expect(jar.writes).toBe(0);
  });

  it("counts as signed in for action guards, and as nothing to revoke for sign-out", async () => {
    refreshBackendToken.mockRejectedValue(backendError(400));
    const expired = { expiresAt: Date.now() - 1 };

    expect(await requestJar.run(await jarFor("user-a", "refresh-a", expired), session.hasActiveSession)).toBe(
      true,
    );
    expect(
      await requestJar.run(await jarFor("user-a", "refresh-b", expired), session.readActiveSessionForSignOut),
    ).toBeNull();
  });
});

describe("a definitive backend answer ends the session", () => {
  // Every state in which the session is over answers 401 `unauthorized`
  // (`unauthorizedErrors`, backend httperrors/mapper.go).
  it.each(["invalid refresh token", "token reuse detected", "logout already", "token expired"])(
    "clears the cookie on 401 %s, without a retry",
    async (message) => {
      refreshBackendToken.mockRejectedValue(backendError(401, message));
      const jar = await jarFor("user-a", "refresh-a");

      expect(await requestJar.run(jar, () => session.readActiveSession())).toBeNull();
      expect(jar.get(COOKIE)).toBe("");
      expect(refreshBackendToken).toHaveBeenCalledTimes(1);
      expect(await requestJar.run(jar, session.hasActiveSession)).toBe(false);
    },
  );
});

describe("readActiveSession refreshes only near expiry", () => {
  it("refreshes an access token inside the one-minute leeway", async () => {
    refreshBackendToken.mockResolvedValue({ access_token: "a2", refresh_token: "r2", expires_in: 900 });
    const jar = await jarFor("user-a", "refresh-a", { expiresAt: Date.now() + 30_000 });

    const result = await requestJar.run(jar, () => session.readActiveSession());

    expect(refreshBackendToken).toHaveBeenCalledWith("refresh-a");
    expect(result).toMatchObject({ accessToken: "a2" });
  });

  // The new expiry is what the leeway check reads next time. In milliseconds:
  // read as seconds, a 15-minute token looks expired at once and every request
  // spends the refresh token again.
  it("persists an expiry expires_in seconds ahead, so the next read spends nothing", async () => {
    refreshBackendToken.mockResolvedValue({ access_token: "a2", refresh_token: "r2", expires_in: 900 });
    const jar = await jarFor("user-a", "refresh-a");
    const before = Date.now();

    await requestJar.run(jar, () => session.readActiveSession());
    const stored = await cookiePayload(jar);
    const again = await requestJar.run(jar, () => session.readActiveSession());

    expect(stored!.accessTokenExpiresAt).toBeGreaterThanOrEqual(before + 900_000);
    expect(stored!.accessTokenExpiresAt).toBeLessThanOrEqual(Date.now() + 900_000);
    expect(refreshBackendToken).toHaveBeenCalledTimes(1);
    expect(again).toMatchObject({ accessToken: "a2" });
  });

  it("returns a token with time left as it is, spending nothing", async () => {
    const jar = await jarFor("user-a", "refresh-a", { expiresAt: Date.now() + 5 * 60_000 });

    const result = await requestJar.run(jar, () => session.readActiveSession());

    expect(refreshBackendToken).not.toHaveBeenCalled();
    expect(result).toMatchObject({ accessToken: "access-user-a-old", refreshToken: "refresh-a" });
  });
});
