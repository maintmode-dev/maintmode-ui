import { beforeEach, describe, expect, it, vi } from "vitest";

import { BackendRequestError, BackendUnauthorizedError } from "@/server/backend/errors/backend-request-error";

const authenticatedBackendRequest = vi.fn();
vi.mock("@/server/backend/client/authenticated-backend-request", () => ({
  authenticatedBackendRequest: (opts: unknown) => authenticatedBackendRequest(opts),
}));

const { completeProviderLink } = await import("@/server/auth/provider-link");

beforeEach(() => {
  authenticatedBackendRequest.mockReset();
});

/**
 * Backend M1: a link completes from the owner's session. Status → outcome as
 * agreed with the backend: 204 linked, 409 conflict, 400 link_invalid.
 */
describe("completeProviderLink", () => {
  it("posts the link code and binding proof to the auth base with the session", async () => {
    authenticatedBackendRequest.mockResolvedValue(undefined);

    await expect(completeProviderLink("lc-1", "nonce-1")).resolves.toBe("linked");

    const opts = authenticatedBackendRequest.mock.calls[0][0];
    expect(opts).toMatchObject({
      path: "/api/v1/me/providers/link/complete",
      method: "POST",
      useAuthBase: true,
    });
    expect(JSON.parse(opts.body)).toEqual({ link_code: "lc-1", binding_proof: "nonce-1" });
  });

  it("reads a 409 as a conflict, with its own advice", async () => {
    authenticatedBackendRequest.mockRejectedValue(new BackendRequestError(409, '{"code":"conflict"}'));

    await expect(completeProviderLink("lc-1", "n")).resolves.toBe("link_conflict");
  });

  it.each([
    ["400 link_invalid", new BackendRequestError(400, '{"code":"link_invalid"}')],
    ["a dead session", new BackendUnauthorizedError("no active session")],
    ["an outage", new Error("ECONNREFUSED")],
  ])("reads %s as a failed link, never throwing", async (_label, error) => {
    authenticatedBackendRequest.mockRejectedValue(error);

    await expect(completeProviderLink("lc-1", "n")).resolves.toBe("failed");
  });
});
