import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readWireFixture } from "./_harness";

import { decodeSession } from "@/server/auth/session-cookie";

/**
 * Break-glass sign-in by password alone — `POST /api/v1/login/break-glass`,
 * behind `/login/recovery`.
 *
 * The recorded responses go through the REAL HTTP client and the REAL sign-in
 * runner (`runBuiltInSignIn`), with only `fetch` stubbed: success must carry
 * BOTH tokens, and every refusal must come out as the one uniform answer, so
 * the page cannot tell "wrong password" from "no break-glass on this instance".
 *
 * One case goes further, into the REAL session writer (`establishSession`),
 * and so also stubs the request's cookie jar and sets the auth env: it pins
 * what the recorded success — from a backend before RUK-310, without
 * `session_expires_at` — does to the session cookie.
 *
 * Expectations are literals, never read back from the fixture.
 */

type WireCase = { status: number; body: unknown; cacheControl?: string };

const wire = readWireFixture<{ success: WireCase; refused: WireCase }>("login-break-glass.json");
const me = readWireFixture<Record<string, unknown>>("me.json");

const fetchMock = vi.fn();

const SECRET = "contract-secret-at-least-thirty-two-chars";
const COOKIE = "authjs.session-token";
process.env.MAINTMODE_AUTH_SECRET = SECRET;
process.env.MAINTMODE_AUTH_API_BASE_URL = "http://backend.test/auth";
process.env.MAINTMODE_APP_BASE_URL = "http://localhost:3000";
process.env.MAINTMODE_AUTH_PUBLIC_BASE_URL = "http://localhost:9000/auth";

const cookieJar = new Map<string, { value: string; maxAge?: number }>();
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)!.value } : undefined),
    set: ({ name, value, maxAge }: { name: string; value: string; maxAge?: number }) => {
      cookieJar.set(name, { value, maxAge });
    },
  }),
}));

const { runBuiltInSignIn } = await import("@/server/auth/built-in-sign-in");
const { establishSession } = await import("@/server/auth/session-token");

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  process.env.MAINTMODE_API_BASE_URL = "http://backend.test/maintmode";
  process.env.MAINTMODE_BACKEND_S2S_TOKEN = "s2s-token-for-tests-0123456789abcdef";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function respond({ status, body }: WireCase) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `status ${status}`,
    text: async () => text,
  };
}

const BREAK_GLASS = { signInKind: "break-glass" as const, password: "break-glass-test-password" };

/** The code `runBuiltInSignIn` refuses with, or undefined when it signs in. */
async function outcome(account: Record<string, unknown> = {}): Promise<string | undefined> {
  return runBuiltInSignIn(account, BREAK_GLASS).then(
    () => undefined,
    (error: unknown) => (error as { code?: string }).code,
  );
}

describe("break-glass sign-in — as recorded", () => {
  it("signs in with the recorded success, which carries both tokens", async () => {
    fetchMock
      .mockResolvedValueOnce(respond(wire.success))
      .mockResolvedValueOnce(respond({ status: 200, body: me }));
    const account: Record<string, unknown> = {};

    expect(await outcome(account)).toBeUndefined();
    expect(account.maintmodeTokens).toMatchObject({
      access_token: "<access-token>",
      refresh_token: "<refresh-token>",
      expires_in: 300,
    });
    expect(wire.success.cacheControl).toBe("no-store");
  });

  it("posts the password alone to the break-glass path", async () => {
    fetchMock
      .mockResolvedValueOnce(respond(wire.success))
      .mockResolvedValueOnce(respond({ status: 200, body: me }));

    await outcome();

    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/v1\/login\/break-glass$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ password: "break-glass-test-password" });
  });

  it("reads the recorded refusal as the one uniform failure", async () => {
    fetchMock.mockResolvedValueOnce(respond(wire.refused));

    expect(await outcome()).toBe("invalid_credentials");
    expect(wire.refused.status).toBe(401);
  });
});

/**
 * OLD BACKEND, FIELD ABSENT → LEGACY FALLBACK. This is NOT the break-glass
 * contract: the backend ends a break-glass session 24h after sign-in, and a
 * cookie that outlives it by 29 days is exactly the bug `session_expires_at`
 * (RUK-310) fixes. It pins that the BFF keeps working against the backend this
 * fixture was recorded from. When the fixture is re-recorded with the field,
 * `contract-gaps.test.ts` goes red, and this case is retired together with that
 * absence assertion in favour of a positive 24h contract test
 * (docs/contract-gaps.md, `session_expires_at`).
 */
describe("break-glass session cookie — old backend, field absent → legacy fallback", () => {
  // 2026-10-14T12:00:00Z
  const NOW = Date.UTC(2026, 9, 14, 12, 0, 0);
  const THIRTY_DAYS_S = 30 * 24 * 60 * 60;

  afterEach(() => {
    vi.useRealTimers();
    cookieJar.clear();
  });

  it("gives the recorded success today's 720h-from-sign-in cookie", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const user = { id: "u-1", email: "break-glass@maintmode.invalid", displayName: "Break-glass", roles: [] };

    await establishSession(wire.success.body as Parameters<typeof establishSession>[0], user);

    expect(cookieJar.get(COOKIE)?.maxAge).toBe(THIRTY_DAYS_S);
    const stored = await decodeSession(cookieJar.get(COOKIE)!.value, COOKIE, SECRET);
    expect(stored).toMatchObject({ sessionStartedAt: NOW });
    expect(stored && "sessionExpiresAt" in stored).toBe(false);
    vi.setSystemTime(NOW + THIRTY_DAYS_S * 1000 + 60_000);
    expect(await decodeSession(cookieJar.get(COOKIE)!.value, COOKIE, SECRET)).toBeNull();
  });
});
