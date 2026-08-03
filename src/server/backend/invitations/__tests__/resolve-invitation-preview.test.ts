import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BackendRequestError } from "@/server/backend/errors/backend-request-error";

const backendRequest = vi.hoisted(() => vi.fn());

vi.mock("@/server/backend/client/backend-client", () => ({ backendRequest }));

const { resolveInvitationPreview } = await import("../resolve-invitation-preview");

// Both calls are required, and the pairing is not redundant: under vitest 4,
// `mockReset()` alone and `mockClear()` alone each leave a queued-but-unconsumed
// `...Once` implementation in place — only the pair drains it. Verified against
// this vitest version rather than assumed.
//
// Why it matters here: two cases below queue `...Once` and consume it in the
// same test, so a green run leaks nothing. But if either ever fails or times out
// *before* its call, the leftover implementation fires inside whichever test
// runs next — surfacing as an UNCAUGHT `BackendRequestError` blamed on an
// innocent case. Draining unconditionally makes that failure mode impossible
// instead of merely unlikely.
beforeEach(() => {
  backendRequest.mockReset();
  backendRequest.mockClear();
});
afterEach(() => vi.clearAllMocks());

describe("resolveInvitationPreview", () => {
  it("returns the valid status and provider for a live invite", async () => {
    backendRequest.mockResolvedValue({ status: "valid", suggested_provider: "google" });

    await expect(resolveInvitationPreview("tok-1")).resolves.toEqual({
      status: "valid",
      suggested_provider: "google",
    });
  });

  it("passes the token to the auth-base preview endpoint, URL-encoded", async () => {
    backendRequest.mockResolvedValue({ status: "valid" });

    await resolveInvitationPreview("a b&c");

    expect(backendRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/v1/users/invitations/preview?token=a%20b%26c",
        method: "GET",
        useAuthBase: true,
        cache: "no-store",
      }),
    );
  });

  it("short-circuits a missing token without touching the backend", async () => {
    await expect(resolveInvitationPreview(undefined)).resolves.toEqual({ status: "missing" });
    await expect(resolveInvitationPreview("")).resolves.toEqual({ status: "missing" });
    await expect(resolveInvitationPreview("   ")).resolves.toEqual({ status: "missing" });

    expect(backendRequest).not.toHaveBeenCalled();
  });

  it.each(["invalid", "expired", "accepted", "revoked"])(
    "passes through the terminal status %s",
    async (status) => {
      backendRequest.mockResolvedValue({ status });

      await expect(resolveInvitationPreview("tok-1")).resolves.toMatchObject({ status });
    },
  );

  it("collapses an unrecognized backend status to invalid, never valid-looking", async () => {
    backendRequest.mockResolvedValue({ status: "pending_review" });

    await expect(resolveInvitationPreview("tok-1")).resolves.toMatchObject({ status: "invalid" });
  });

  it("strips any extra fields the backend might add (no PII leak to a public page)", async () => {
    backendRequest.mockResolvedValue({
      status: "valid",
      suggested_provider: "google",
      email: "victim@corp.test",
      roles: ["admin"],
      inviter: { email: "boss@corp.test" },
    });

    const result = await resolveInvitationPreview("tok-1");

    expect(result).toEqual({ status: "valid", suggested_provider: "google" });
    expect(result).not.toHaveProperty("email");
    expect(result).not.toHaveProperty("roles");
    expect(result).not.toHaveProperty("inviter");
  });

  it("does not redirect or rethrow on backend failure — it renders a retryable state", async () => {
    // The server-side equivalent of `skipAuthRedirect: true`: an invited user has
    // no session, so a failed preview must never bounce them to /login.
    backendRequest.mockImplementationOnce(() => {
      throw new BackendRequestError(401, "unauthorized");
    });

    await expect(resolveInvitationPreview("tok-1")).resolves.toEqual({ status: "unknown_error" });
  });

  it("keeps failures indistinguishable from one another (anti-enumeration)", async () => {
    const failures = [
      new BackendRequestError(404, "not found"),
      new BackendRequestError(500, "boom"),
      new BackendRequestError(403, "forbidden"),
      new Error("socket hang up"),
    ];

    for (const failure of failures) {
      backendRequest.mockRejectedValueOnce(failure);
      // Every failure mode yields the same payload — an enumerator learns nothing
      // about whether the token corresponds to a real invite.
      await expect(resolveInvitationPreview("tok-1")).resolves.toEqual({ status: "unknown_error" });
    }
  });

  it("never throws a 404 for an unknown token (anti-enumeration, mirrors the BFF route)", async () => {
    backendRequest.mockResolvedValue({ status: "invalid" });

    // Unknown tokens resolve, they do not error — same 200-shaped contract the
    // public BFF route deliberately preserves.
    await expect(resolveInvitationPreview("definitely-not-a-token")).resolves.toEqual({
      status: "invalid",
      suggested_provider: undefined,
    });
  });
});
