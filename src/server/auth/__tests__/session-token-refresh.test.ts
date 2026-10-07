import { AsyncLocalStorage } from "node:async_hooks";

import { decode, encode } from "next-auth/jwt";
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
  parseMaintmodeAuthConfig: () => ({ authSecret: SECRET }),
}));

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
  const value = await encode({
    token: payload as unknown as Record<string, unknown>,
    secret: SECRET,
    salt: COOKIE,
  });
  return new Map([[COOKIE, value]]);
}

async function cookiePayload(jar: Jar) {
  return (await decode({ token: jar.get(COOKIE), secret: SECRET, salt: COOKIE })) as SessionPayload | null;
}

beforeEach(() => {
  refreshBackendToken.mockReset();
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
    // Give B time to reach the refresh while A's is still pending.
    await new Promise((resolve) => setTimeout(resolve, 50));

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
    await vi.waitFor(() => expect(refreshBackendToken).toHaveBeenCalled());
    // Let the second request finish decoding its cookie and join the refresh.
    await new Promise((resolve) => setTimeout(resolve, 50));
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

  it("refuses a refresh token that is already being refreshed for another user", async () => {
    const d = deferred<BackendTokenPair>();
    refreshBackendToken.mockReturnValue(d.promise);
    const jarA = await jarFor("user-a", "refresh-shared");
    const jarB = await jarFor("user-b", "refresh-shared");

    const sessionA = requestJar.run(jarA, () => forceSessionRefresh());
    const sessionB = requestJar.run(jarB, () => forceSessionRefresh());
    await vi.waitFor(() => expect(refreshBackendToken).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    d.resolve({ access_token: "access-a-new", refresh_token: "refresh-a-2", expires_in: 900 });

    const [a, b] = await Promise.all([sessionA, sessionB]);
    expect(refreshBackendToken).toHaveBeenCalledTimes(1);
    expect(a).toMatchObject({ user: { id: "user-a" } });
    expect(b).toBeNull();
    expect(jarB.get(COOKIE)).toBe("");
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
});
