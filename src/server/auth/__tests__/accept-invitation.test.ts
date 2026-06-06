import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { acceptInvitation } from "@/server/auth/backend-token-exchange";
import { BackendAuthError } from "@/server/auth/contracts";

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("acceptInvitation", () => {
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

  it("posts the invitation token + oauth payload to the auth accept endpoint", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        access_token: "at-123",
        refresh_token: "rt-456",
        expires_in: 900,
      }),
    );

    const pair = await acceptInvitation({
      invitationToken: "raw-invite-token",
      provider: "google",
      idToken: "google-id-token",
    });

    expect(pair).toEqual({ access_token: "at-123", refresh_token: "rt-456", expires_in: 900 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    // Resolves against the AUTH base, preserving the `/auth` prefix.
    expect(String(url)).toBe("http://backend.test/auth/api/v1/users/invitations/accept");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      invitation_token: "raw-invite-token",
      oauth_payload: { provider: "google", id_token: "google-id-token" },
    });
  });

  it("throws BackendAuthError on the backend's privacy-stripped 400 (no leak)", async () => {
    // The backend collapses every accept failure to a bare 400 {code} with no
    // message — assert we propagate it as an auth error rather than swallowing.
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { code: "email_mismatch", message: "" }));

    await expect(
      acceptInvitation({ invitationToken: "t", provider: "google", idToken: "x" }),
    ).rejects.toBeInstanceOf(BackendAuthError);
  });

  it("rejects a token pair missing the refresh token", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { access_token: "at-only" }));

    await expect(
      acceptInvitation({ invitationToken: "t", provider: "google", idToken: "x" }),
    ).rejects.toBeInstanceOf(BackendAuthError);
  });
});
