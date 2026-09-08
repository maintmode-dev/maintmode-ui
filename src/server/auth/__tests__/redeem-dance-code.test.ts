import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { redeemOAuthDanceCode } from "@/server/auth/backend-token-exchange";
import { BackendAuthError } from "@/server/auth/contracts";

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * RUK-292 — redeeming the one-time code from the backend's OAuth callback.
 *
 * Field names are asserted as literals rather than read back out of the payload
 * the test itself built: an expectation derived from its own fixture holds under
 * every mutation of that fixture, so it stays green while the contract moves.
 */
describe("redeemOAuthDanceCode", () => {
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
  });

  it("posts the code to the dance exchange endpoint", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { access_token: "at", refresh_token: "rt" }));

    await redeemOAuthDanceCode("one-time-code");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://backend.test/auth/api/v1/login/oauth/code/exchange");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ code: "one-time-code" });
  });

  it("returns the token pair", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { access_token: "at-1", refresh_token: "rt-1" }));

    const pair = await redeemOAuthDanceCode("code");

    expect(pair.access_token).toBe("at-1");
    expect(pair.refresh_token).toBe("rt-1");
  });

  /**
   * 401 and 429 are both reachable in normal use — the second because the
   * limiter's bucket is keyed on IP with no route component, so a burst on
   * password sign-in can refuse a redemption. Both must surface as an error
   * carrying its status, never as a resolved value: a redemption that "succeeds"
   * with no tokens would establish a session for nobody.
   */
  it.each([401, 429, 500])("raises a BackendAuthError carrying status %i", async (status) => {
    fetchMock.mockResolvedValue(jsonResponse(status, { code: "unauthorized" }));

    const error = await redeemOAuthDanceCode("code").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BackendAuthError);
    expect((error as BackendAuthError).status).toBe(status);
  });

  it("rejects a 200 that carries no access token", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { refresh_token: "rt" }));

    await expect(redeemOAuthDanceCode("code")).rejects.toBeInstanceOf(BackendAuthError);
  });
});
