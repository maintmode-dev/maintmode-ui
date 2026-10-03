import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readWireFixture } from "./_harness";

/**
 * Accepting an invitation by setting a password —
 * `POST /api/v1/users/invitations/accept/password`.
 *
 * The recorded responses go through the REAL HTTP client and the REAL refusal
 * mapping (`runBuiltInSignIn`), with only `fetch` stubbed, because both decide
 * on the wire: success needs BOTH tokens, and each refusal is told apart by its
 * status AND its `code`. A backend that renamed `method_disabled`, or answered
 * policy failures with `invalid`, would send the wrong advice to someone holding
 * a valid invitation; recorded bodies are what notice.
 *
 * Expectations are literals, never read back from the fixture.
 *
 * Not here: 403 `seats_limit_exceeded` and 409 `conflict`, which the dev stand
 * cannot produce (see the fixture's `_not_recorded`). Their mapping is covered
 * by `built-in-sign-in-callback.test.ts` against the announced contract.
 */

type WireCase = { status: number; body: unknown; cacheControl?: string };

const wire = readWireFixture<{
  success: WireCase;
  invitation_invalid: WireCase;
  password_policy: WireCase;
  method_disabled: WireCase;
}>("invitation-accept-password.json");
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

const INVITE = { signInKind: "invite" as const, invitationToken: "tok-1", password: "invite-test-password" };

/** The code `runBuiltInSignIn` refuses with, or undefined when it signs in. */
async function outcome(account: Record<string, unknown> = {}): Promise<string | undefined> {
  return runBuiltInSignIn(account, INVITE).then(
    () => undefined,
    (error: unknown) => (error as { code?: string }).code,
  );
}

describe("accepting an invitation with a password — as recorded", () => {
  it("signs in with the recorded success, which carries both tokens", async () => {
    fetchMock
      .mockResolvedValueOnce(respond(wire.success))
      .mockResolvedValueOnce(respond({ status: 200, body: me }));
    const account: Record<string, unknown> = {};

    expect(await outcome(account)).toBeUndefined();
    expect(account.maintmodeTokens).toMatchObject({
      access_token: "<access-token>",
      refresh_token: "<refresh-token>",
    });
    // Tokens on the wire must not be cached by anything in between.
    expect(wire.success.cacheControl).toBe("no-store");
  });

  it("posts to the accept-with-password path with the token and the password", async () => {
    fetchMock
      .mockResolvedValueOnce(respond(wire.success))
      .mockResolvedValueOnce(respond({ status: 200, body: me }));

    await outcome();

    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/v1\/users\/invitations\/accept\/password$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      invitation_token: "tok-1",
      password: "invite-test-password",
    });
  });

  it.each([
    ["a reused link", "invitation_invalid", "invitation_invalid"],
    ["a short password", "password_policy", "password_policy_violation"],
    ["password sign-in switched off", "method_disabled", "method_disabled"],
  ] as const)("maps %s to its own code", async (_label, recorded, expected) => {
    fetchMock.mockResolvedValueOnce(respond(wire[recorded]));

    expect(await outcome()).toBe(expected);
  });
});
