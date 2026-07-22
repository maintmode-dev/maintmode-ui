import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { exchangeGoogleIdToken } from "@/server/auth/backend-token-exchange";
import { BackendAuthError } from "@/server/auth/contracts";

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function headerValue(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

describe("exchangeGoogleIdToken", () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    process.env.MAINTMODE_API_BASE_URL = "http://backend.test/maintmode";
    process.env.MAINTMODE_AUTH_API_BASE_URL = "http://backend.test/auth";
    process.env.MAINTMODE_API_TIMEOUT_MS = "5000";
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts the id_token to the auth exchange endpoint", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { access_token: "at-1", refresh_token: "rt-1", expires_in: 900 }),
    );

    const pair = await exchangeGoogleIdToken("google-id-token");

    expect(pair).toEqual({ access_token: "at-1", refresh_token: "rt-1", expires_in: 900 });
    const [url, init] = fetchMock.mock.calls[0];
    // Resolves against the AUTH base, preserving the `/auth` prefix.
    expect(String(url)).toBe("http://backend.test/auth/api/v1/login/oauth/exchange/google");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ id_token: "google-id-token" });
  });

  it("does not send X-Test-Roles when no roles are provided", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { access_token: "at", refresh_token: "rt", expires_in: 900 }),
    );

    await exchangeGoogleIdToken("google-id-token");

    expect(headerValue(fetchMock.mock.calls[0][1], "X-Test-Roles")).toBeNull();
  });

  it("sends the X-Test-Roles header verbatim when roles are provided", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { access_token: "at", refresh_token: "rt", expires_in: 900 }),
    );

    await exchangeGoogleIdToken("google-id-token", "admin,editor");

    expect(headerValue(fetchMock.mock.calls[0][1], "X-Test-Roles")).toBe("admin,editor");
  });

  it("treats an empty roles string as no header", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { access_token: "at", refresh_token: "rt", expires_in: 900 }),
    );

    await exchangeGoogleIdToken("google-id-token", "");

    expect(headerValue(fetchMock.mock.calls[0][1], "X-Test-Roles")).toBeNull();
  });

  it("propagates the backend 400 for an unknown role as a BackendAuthError", async () => {
    // Contract: an unknown role fails the whole exchange with a 400 (invalid_role).
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { code: "invalid_role", message: "" }));

    await expect(exchangeGoogleIdToken("google-id-token", "wizard")).rejects.toBeInstanceOf(BackendAuthError);
  });
});
