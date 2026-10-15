import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loginAsDevUser } from "@/server/auth/backend-token-exchange";
import { BackendAuthError } from "@/server/auth/contracts";

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("loginAsDevUser", () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    process.env.MAINTMODE_API_BASE_URL = "http://backend.test/maintmode";
    process.env.MAINTMODE_AUTH_API_BASE_URL = "http://backend.test/auth";
    process.env.MAINTMODE_BACKEND_S2S_TOKEN = "s2s-token-for-tests-0123456789abcdef";
    process.env.MAINTMODE_API_TIMEOUT_MS = "5000";
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts the roles to the dev login and returns the pair", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { access_token: "at-1", refresh_token: "rt-1", expires_in: 900 }),
    );

    const pair = await loginAsDevUser(["admin", "editor"]);

    expect(pair).toEqual({ access_token: "at-1", refresh_token: "rt-1", expires_in: 900 });
    const [url, init] = fetchMock.mock.calls[0];
    // Resolves against the AUTH base, preserving the `/auth` prefix.
    expect(String(url)).toBe("http://backend.test/auth/api/v1/login/dev");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ roles: ["admin", "editor"] });
  });

  it("refuses a pair without a refresh token", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { access_token: "at", expires_in: 900 }));

    await expect(loginAsDevUser(["admin"])).rejects.toBeInstanceOf(BackendAuthError);
  });

  it("propagates the backend 400 for an unknown role as a BackendAuthError", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { code: "invalid request", message: "" }));

    await expect(loginAsDevUser(["admin"])).rejects.toBeInstanceOf(BackendAuthError);
  });
});
