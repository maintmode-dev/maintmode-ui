import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readWireFixture } from "./_harness";

/**
 * Break-glass sign-in by password alone — `POST /api/v1/login/break-glass`,
 * behind `/login/recovery`.
 *
 * The recorded responses go through the REAL HTTP client and the REAL sign-in
 * runner (`runBuiltInSignIn`), with only `fetch` stubbed: success must carry
 * BOTH tokens, and every refusal must come out as the one uniform answer, so
 * the page cannot tell "wrong password" from "no break-glass on this instance".
 *
 * Expectations are literals, never read back from the fixture.
 */

type WireCase = { status: number; body: unknown; cacheControl?: string };

const wire = readWireFixture<{ success: WireCase; refused: WireCase }>("login-break-glass.json");
const me = readWireFixture<Record<string, unknown>>("me.json");

const fetchMock = vi.fn();

const { runBuiltInSignIn } = await import("@/server/auth/built-in-sign-in");

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  process.env.MAINTMODE_API_BASE_URL = "http://backend.test/maintmode";
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
