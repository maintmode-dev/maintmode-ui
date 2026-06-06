import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  INVITATION_TOKEN_COOKIE,
  clearInvitationToken,
  readInvitationToken,
  setInvitationToken,
} from "@/server/auth/invitation-cookie";

const store = {
  set: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve(store),
}));

describe("invitation-cookie", () => {
  beforeEach(() => {
    store.set.mockReset();
    store.get.mockReset();
    store.delete.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("writes the token as an httpOnly, SameSite=Lax, short-lived cookie", async () => {
    await setInvitationToken("raw-invite-token");

    expect(store.set).toHaveBeenCalledTimes(1);
    const [name, value, opts] = store.set.mock.calls[0];
    expect(name).toBe(INVITATION_TOKEN_COOKIE);
    expect(value).toBe("raw-invite-token");
    expect(opts).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    // Bounded lifetime so a stale token can't linger across sessions.
    expect(opts.maxAge).toBeGreaterThan(0);
    expect(opts.maxAge).toBeLessThanOrEqual(15 * 60);
  });

  it("marks the cookie secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await setInvitationToken("t");
    expect(store.set.mock.calls[0][2]).toMatchObject({ secure: true });
  });

  it("does not mark the cookie secure outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await setInvitationToken("t");
    expect(store.set.mock.calls[0][2]).toMatchObject({ secure: false });
  });

  it("reads the token back, treating an empty value as absent", async () => {
    store.get.mockReturnValueOnce({ value: "raw-invite-token" });
    expect(await readInvitationToken()).toBe("raw-invite-token");

    store.get.mockReturnValueOnce({ value: "" });
    expect(await readInvitationToken()).toBeUndefined();

    store.get.mockReturnValueOnce(undefined);
    expect(await readInvitationToken()).toBeUndefined();
  });

  it("clears the cookie for single-use consumption", async () => {
    await clearInvitationToken();
    expect(store.delete).toHaveBeenCalledWith(INVITATION_TOKEN_COOKIE);
  });
});
