import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readWireFixture } from "./_harness";

/**
 * RUK-311 — the BFF authenticates itself to the auth backend.
 *
 * Contract (confirmed by the backend owner, 2026-10-13): every request the BFF
 * sends to the auth backend carries `X-S2S-APPNAME: maintmode-ui` and
 * `X-S2S-TOKEN: <MAINTMODE_BACKEND_S2S_TOKEN>`. The backend enforces it on the
 * token endpoints (refresh, password, break-glass, OTP verify, the OAuth code
 * exchange, the dev Google exchange, invitation accept) and ignores it
 * elsewhere, so the BFF sends it on EVERY auth-base request: the protected set
 * can then grow without a frontend release. Business API requests never carry
 * it.
 *
 * What is pinned is the REQUEST, through the real `backendFetch` and
 * `backendRequest`, with only `fetch` and `next/headers` stubbed. The 200 the
 * stub answers with is a shape every caller accepts, not a backend reply under
 * test, so it is deliberately not a wire fixture.
 *
 * Expectations are literals written here — header names, `maintmode-ui`, the
 * token this file sets — never imported from `s2s-headers.ts`, so renaming a
 * constant there fails this file instead of moving with it.
 */

const TOKEN = "s2s-contract-token-0123456789abcdefghij";

process.env.MAINTMODE_API_BASE_URL = "http://backend.test/maintmode";
process.env.MAINTMODE_AUTH_API_BASE_URL = "http://backend.test/auth";
process.env.MAINTMODE_BACKEND_S2S_TOKEN = TOKEN;

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

const fetchMock = vi.fn();

type WireCase = { status: number; body: Record<string, unknown> };
const wire = readWireFixture<Record<"invalidClient" | "unauthorized", WireCase>>("s2s-client-auth.json");

function refusal({ status, body }: WireCase) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** The ERROR lines `logError` wrote, parsed. */
function errorLines(spy: { mock: { calls: unknown[][] } }): Array<Record<string, unknown>> {
  return spy.mock.calls.map((args) => JSON.parse(String(args[0])) as Record<string, unknown>);
}

/** Satisfies every token-exchange caller's shape check. */
const ACCEPTED_BY_EVERY_CALLER = {
  access_token: "access-placeholder",
  refresh_token: "refresh-placeholder",
  session_nonce: "nonce-placeholder",
  id: "user-placeholder",
  email: "user@example.test",
};

function ok(body: unknown = ACCEPTED_BY_EVERY_CALLER) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

type SentRequest = { url: string; headers: Headers };

function sentRequests(): SentRequest[] {
  return fetchMock.mock.calls.map(([target, init]) => ({
    url: String(target),
    headers: new Headers((init as RequestInit | undefined)?.headers),
  }));
}

let exchange: typeof import("@/server/auth/backend-token-exchange");
let client: typeof import("@/server/backend/client/backend-client");

beforeEach(async () => {
  vi.resetModules();
  exchange = await import("@/server/auth/backend-token-exchange");
  client = await import("@/server/backend/client/backend-client");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => ok());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("s2s client credential — auth backend requests carry it", () => {
  // Every exported function of backend-token-exchange.ts. A new one added
  // there without a row here is a gap this list should be extended for.
  const calls: Array<[string, () => Promise<unknown>]> = [
    ["exchangeGoogleIdToken", () => exchange.exchangeGoogleIdToken("dev-bypass", "admin")],
    [
      "acceptInvitationWithPassword",
      () => exchange.acceptInvitationWithPassword({ invitationToken: "inv", password: "pw-placeholder" }),
    ],
    ["requestOtpCode", () => exchange.requestOtpCode("user@example.test")],
    [
      "verifyOtpCode",
      () => exchange.verifyOtpCode({ email: "user@example.test", code: "123456", sessionNonce: "n" }),
    ],
    ["loginWithPassword", () => exchange.loginWithPassword({ email: "user@example.test", password: "pw" })],
    ["loginWithBreakGlass", () => exchange.loginWithBreakGlass("pw-placeholder")],
    ["redeemOAuthDanceCode", () => exchange.redeemOAuthDanceCode("code", "proof")],
    ["requestPasswordResetCode", () => exchange.requestPasswordResetCode("user@example.test")],
    [
      "confirmPasswordReset",
      () =>
        exchange.confirmPasswordReset({
          email: "user@example.test",
          code: "123456",
          sessionNonce: "n",
          newPassword: "pw-placeholder-new",
        }),
    ],
    [
      "changeBackendPassword",
      () => exchange.changeBackendPassword({ accessToken: "at", currentPassword: "a", newPassword: "b" }),
    ],
    ["refreshBackendToken", () => exchange.refreshBackendToken("refresh-placeholder")],
    ["revokeBackendSession", () => exchange.revokeBackendSession("at", "rt")],
    ["revokeAllBackendSessions", () => exchange.revokeAllBackendSessions("at")],
    ["fetchBackendMe", () => exchange.fetchBackendMe("at")],
  ];

  it("covers every exported function of backend-token-exchange", () => {
    const exported = Object.entries(exchange)
      .filter(([, value]) => typeof value === "function")
      .map(([name]) => name)
      .sort();
    expect(calls.map(([name]) => name).sort()).toEqual(exported);
  });

  it.each(calls)("%s sends the app name and the token", async (_name, call) => {
    await call();

    const [request] = sentRequests();
    expect(request.url.startsWith("http://backend.test/auth/")).toBe(true);
    expect(request.headers.get("x-s2s-appname")).toBe("maintmode-ui");
    expect(request.headers.get("x-s2s-token")).toBe(TOKEN);
  });

  it("backendRequest sends them on the auth base", async () => {
    await client.backendRequest({ path: "/api/v1/auth/providers", useAuthBase: true });

    const [request] = sentRequests();
    expect(request.url).toBe("http://backend.test/auth/api/v1/auth/providers");
    expect(request.headers.get("x-s2s-appname")).toBe("maintmode-ui");
    expect(request.headers.get("x-s2s-token")).toBe(TOKEN);
  });

  it("backendRequest does not send them to the business API", async () => {
    await client.backendRequest({ path: "/api/v1/maintenances", accessToken: "at" });

    const [request] = sentRequests();
    expect(request.url).toBe("http://backend.test/maintmode/api/v1/maintenances");
    expect(request.headers.get("x-s2s-appname")).toBeNull();
    expect(request.headers.get("x-s2s-token")).toBeNull();
  });

  it("a caller's header of the same name, in any case, cannot replace the credential", async () => {
    await client.backendRequest({
      path: "/api/v1/auth/providers",
      useAuthBase: true,
      headers: { "X-S2S-Token": "caller-value", "X-S2S-AppName": "someone-else" },
    });

    const [request] = sentRequests();
    // Exactly the configured values — not replaced, and not merged into a
    // combined "caller-value, <token>" either.
    expect(request.headers.get("x-s2s-token")).toBe(TOKEN);
    expect(request.headers.get("x-s2s-appname")).toBe("maintmode-ui");
  });

  it("keeps the caller's other headers and the access token", async () => {
    await client.backendRequest({
      path: "/api/v1/auth/providers",
      useAuthBase: true,
      accessToken: "at",
      headers: { "X-Request-Id": "rid" },
    });

    const [request] = sentRequests();
    expect(request.headers.get("authorization")).toBe("Bearer at");
    expect(request.headers.get("x-request-id")).toBe("rid");
    expect(request.headers.get("accept")).toBe("application/json");
  });
});

describe("s2s client credential — a refused credential", () => {
  // Precondition with literal codes: the cases below only mean something if
  // the declared envelopes really carry them.
  it("is declared as the backend owner confirmed it", () => {
    expect(wire.invalidClient.status).toBe(401);
    expect(wire.invalidClient.body.code).toBe("invalid_client");
    expect(wire.unauthorized.status).toBe(401);
    expect(wire.unauthorized.body.code).toBe("unauthorized");
  });

  it("stays an error on a token endpoint and is logged once, naming the variable, never the value", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockImplementation(async () => refusal(wire.invalidClient));

    const failure = await exchange.loginWithBreakGlass("pw-placeholder").catch((error: unknown) => error);

    expect(failure).toMatchObject({ name: "BackendAuthError", status: 401 });
    const lines = errorLines(errors);
    expect(lines).toHaveLength(1);
    expect(lines[0].level).toBe("ERROR");
    expect(String(lines[0].msg)).toContain("MAINTMODE_BACKEND_S2S_TOKEN");
    expect(lines[0].err).toBe("invalid_client on /api/v1/login/break-glass");
    expect(JSON.stringify(lines[0])).not.toContain(TOKEN);
  });

  it("hands the caller the untouched body after logging", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockImplementation(async () => refusal(wire.invalidClient));

    const failure = await exchange
      .refreshBackendToken("refresh-placeholder")
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ status: 401 });
    expect(JSON.parse((failure as { responseBody: string }).responseBody)).toMatchObject({
      code: "invalid_client",
    });
  });

  it("does not log a refused refresh token or credential", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockImplementation(async () => refusal(wire.unauthorized));

    await expect(exchange.refreshBackendToken("refresh-placeholder")).rejects.toMatchObject({ status: 401 });
    expect(errors).not.toHaveBeenCalled();
  });

  it("is logged on the auth-base backendRequest path too, without the query string", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockImplementation(async () => refusal(wire.invalidClient));
    const { BackendUnauthorizedError } = await import("@/server/backend/errors/backend-request-error");

    const failure = await client
      .backendRequest({
        path: "/api/v1/users/invitations/preview?token=invite-secret-value",
        useAuthBase: true,
      })
      .catch((error: unknown) => error);

    // The class `authenticatedBackendRequest`'s refresh-and-retry and the 401 →
    // AUTH_REQUIRED mapping key on: reporting must not change it.
    expect(failure).toBeInstanceOf(BackendUnauthorizedError);
    const lines = errorLines(errors);
    expect(lines).toHaveLength(1);
    expect(lines[0].err).toBe("invalid_client on /api/v1/users/invitations/preview");
    expect(JSON.stringify(lines[0])).not.toContain("invite-secret-value");
    expect(JSON.stringify(lines[0])).not.toContain(TOKEN);
  });

  it("does not log an ordinary 401 on the backendRequest path", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockImplementation(async () => refusal(wire.unauthorized));

    await expect(
      client.backendRequest({ path: "/api/v1/auth/providers", useAuthBase: true }),
    ).rejects.toThrow();
    expect(errors).not.toHaveBeenCalled();
  });

  it("never changes the caller's outcome when the reply cannot be read for the report", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const text = JSON.stringify(wire.invalidClient.body);
    // A reply without clone(): the report cannot read a copy, and must give up
    // silently rather than throw into the caller's handling.
    fetchMock.mockImplementation(async () => ({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      headers: new Headers(),
      text: async () => text,
    }));

    await expect(exchange.refreshBackendToken("refresh-placeholder")).rejects.toMatchObject({
      name: "BackendAuthError",
      status: 401,
      responseBody: text,
    });
  });
});
