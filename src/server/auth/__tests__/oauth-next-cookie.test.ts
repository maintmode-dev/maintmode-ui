import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  OAUTH_NEXT_COOKIE,
  clearOAuthNext,
  readOAuthNext,
  setOAuthNext,
} from "@/server/auth/oauth-next-cookie";

const store = {
  set: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve(store),
}));

/**
 * RUK-292. This cookie is the only thing carrying the post-login destination
 * across the dance, and it spends that time in the browser — so the properties
 * worth defending are the ones that stop it becoming an open redirect, plus the
 * attribute that lets it survive the cross-origin return trip at all.
 */
describe("oauth-next-cookie", () => {
  beforeEach(() => {
    store.set.mockReset();
    store.get.mockReset();
    store.delete.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stores the destination httpOnly and lax so it survives the return navigation", async () => {
    await setOAuthNext("/calendar?view=week");

    expect(store.set).toHaveBeenCalledWith(
      OAUTH_NEXT_COOKIE,
      "/calendar?view=week",
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }),
    );
  });

  it("marks the cookie secure only in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await setOAuthNext("/");
    expect(store.set.mock.calls[0][2]).toMatchObject({ secure: true });

    store.set.mockReset();
    vi.stubEnv("NODE_ENV", "development");
    await setOAuthNext("/");
    expect(store.set.mock.calls[0][2]).toMatchObject({ secure: false });
  });

  it("sanitizes on write", async () => {
    await setOAuthNext("//evil.test/steal");

    expect(store.set).toHaveBeenCalledWith(OAUTH_NEXT_COOKIE, "/", expect.anything());
  });

  /**
   * The load-bearing one. A value written by an earlier build, or tampered with
   * in the browser, must not become a redirect target just because it arrived in
   * a cookie we set. Sanitizing on write alone would trust the browser to have
   * kept our value intact.
   */
  it.each([
    ["//evil.test/steal", "/"],
    ["https://evil.test", "/"],
    ["/\\evil.test", "/"],
    ["/calendar", "/calendar"],
  ])("sanitizes %s on read", async (stored, expected) => {
    store.get.mockReturnValue({ value: stored });

    await expect(readOAuthNext()).resolves.toBe(expected);
  });

  it("falls back to / when the cookie is absent", async () => {
    store.get.mockReturnValue(undefined);

    await expect(readOAuthNext()).resolves.toBe("/");
  });

  /**
   * Reading must not clear. The caller clears in exactly one place, before any
   * branch can return, so that "cleared on every exit" is true by construction
   * rather than in five branches that each had to remember.
   */
  it("does not clear as a side effect of reading", async () => {
    store.get.mockReturnValue({ value: "/calendar" });

    await readOAuthNext();

    expect(store.delete).not.toHaveBeenCalled();
  });

  it("clears the cookie by name", async () => {
    await clearOAuthNext();

    expect(store.delete).toHaveBeenCalledWith(OAUTH_NEXT_COOKIE);
  });
});
