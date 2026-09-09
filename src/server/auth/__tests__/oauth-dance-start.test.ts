import { beforeEach, describe, expect, it, vi } from "vitest";

const setOAuthNext = vi.fn();
const clearOAuthNext = vi.fn();
const readActiveSession = vi.fn();
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirect(url),
}));
vi.mock("@/server/auth/oauth-next-cookie", () => ({
  setOAuthNext: (...args: unknown[]) => setOAuthNext(...args),
  clearOAuthNext: () => clearOAuthNext(),
  readOAuthNext: vi.fn(),
}));
// The module also holds the receiver action, which imports NextAuth's `signIn`.
// Mocked so this file exercises the redirect without loading the auth runtime.
vi.mock("@/server/auth/auth-config", () => ({ signIn: vi.fn() }));
vi.mock("@/server/auth/session-token", () => ({ readActiveSession: () => readActiveSession() }));

const { startOAuthDanceAction } = await import("@/server/auth/oauth-dance-actions");

const ENV = {
  MAINTMODE_AUTH_SECRET: "a".repeat(32),
  MAINTMODE_APP_BASE_URL: "http://localhost:3000",
  MAINTMODE_AUTH_PUBLIC_BASE_URL: "http://localhost:9000/auth",
};

/**
 * RUK-292 — the provider button stops being an OAuth client and becomes a
 * redirect. Two properties matter here and nothing else covers them: the
 * destination is stashed BEFORE the browser leaves (it cannot survive the dance
 * any other way), and the target is built from the browser-reachable base rather
 * than the server-to-server one.
 */
describe("startOAuthDanceAction", () => {
  beforeEach(() => {
    setOAuthNext.mockReset();
    clearOAuthNext.mockReset();
    // No session unless a test says otherwise: the refusal below is the
    // exception, not the common path.
    readActiveSession.mockReset().mockResolvedValue(null);
    redirect.mockClear();
    for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
  });

  async function run(providerId: string, next?: string, invitation?: string): Promise<string> {
    try {
      await startOAuthDanceAction(providerId, next, invitation);
    } catch (error) {
      return String((error as Error).message).replace("NEXT_REDIRECT:", "");
    }
    throw new Error("expected the action to redirect");
  }

  it("redirects to the backend's start endpoint for the provider", async () => {
    const target = await run("google", "/calendar");

    // Literal, not composed from the same pieces the code uses: an expectation
    // built the way the implementation builds it passes under any mutation of
    // the join.
    expect(target).toBe("http://localhost:9000/auth/api/v1/login/oauth/google/start");
  });

  it("stashes the destination before redirecting", async () => {
    await run("google", "/calendar?view=week");

    expect(setOAuthNext).toHaveBeenCalledWith("/calendar?view=week");
    expect(setOAuthNext.mock.invocationCallOrder[0]).toBeLessThan(redirect.mock.invocationCallOrder[0]);
  });

  it("stores / when no destination is given", async () => {
    await run("google");

    expect(setOAuthNext).toHaveBeenCalledWith("/");
  });

  /**
   * The action is exported, so it is invocable by action id with an argument the
   * login page never produced. Sanitizing only in the page would leave that door
   * open.
   */
  it("sanitizes an attacker-supplied destination", async () => {
    await run("google", "//evil.test/steal");

    expect(setOAuthNext).toHaveBeenCalledWith("/");
  });

  it("escapes the provider segment", async () => {
    const target = await run("../../admin");

    expect(target).toContain("%2F");
    expect(target).not.toContain("/../");
  });

  /**
   * The base is the one thing that cannot be guessed from a passing test in one
   * environment: `MAINTMODE_AUTH_API_BASE_URL` is a container name in dev and
   * local, so using it would ship a dead button everywhere but prod.
   */
  it("builds the target from the public base, not the server-to-server one", async () => {
    vi.stubEnv("MAINTMODE_AUTH_PUBLIC_BASE_URL", "https://app.example/auth");
    vi.stubEnv("MAINTMODE_AUTH_API_BASE_URL", "http://caddy:3000/auth");

    const target = await run("google");

    expect(target.startsWith("https://app.example/auth/")).toBe(true);
  });
  /**
   * RUK-292 follow-up: the invitation rides to the backend as a query parameter.
   */
  it("carries the invitation when one is given", async () => {
    const target = await run("google", undefined, "inv-token-1");

    expect(target).toBe("http://localhost:9000/auth/api/v1/login/oauth/google/start?invitation=inv-token-1");
  });

  /**
   * The parameter must be ABSENT, not empty, when there is no invitation — this
   * is what keeps the login path's URL byte-for-byte what it was.
   */
  it.each([
    ["undefined", undefined],
    ["an empty string", ""],
    ["whitespace", "   "],
  ])("omits the parameter entirely for %s", async (_case, invitation) => {
    const target = await run("google", undefined, invitation);

    expect(target).toBe("http://localhost:9000/auth/api/v1/login/oauth/google/start");
  });

  /**
   * A token carrying `&` or `#` would otherwise truncate the URL or inject a
   * second parameter into the backend's request.
   */
  it.each([
    ["ampersand", "a&b=c", "a%26b%3Dc"],
    ["hash", "a#b", "a%23b"],
    ["space", "a b", "a%20b"],
  ])("encodes %s in the invitation", async (_case, raw, encoded) => {
    const target = await run("google", undefined, raw);

    expect(target).toBe(`http://localhost:9000/auth/api/v1/login/oauth/google/start?invitation=${encoded}`);
  });

  /**
   * Session refusal.
   *
   * The action is exported, so it is invocable by action id with attacker-chosen
   * arguments — a check that lived only in the page's render would not cover
   * that. Unconditional, not gated on the invitation: `/login`'s caller never
   * reaches it because the proxy bounces a signed-in user off that path.
   */
  it("refuses to start a dance when a session already exists", async () => {
    readActiveSession.mockResolvedValue({ user: { id: "u-1" } });

    expect(await run("google", undefined, "inv-token-1")).toBe("/");
    expect(setOAuthNext).not.toHaveBeenCalled();
  });

  it("refuses an ordinary sign-in too, not just an invitation", async () => {
    readActiveSession.mockResolvedValue({ user: { id: "u-1" } });

    expect(await run("google", "/calendar")).toBe("/");
    expect(setOAuthNext).not.toHaveBeenCalled();
  });
});
