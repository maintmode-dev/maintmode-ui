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
      // `maxAge` included: it is the attribute whose entire purpose is
      // outliving the provider round-trip. A shortened value degrades every
      // deep link to `/` while every other assertion here still passes.
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 900 }),
    );
  });

  /**
   * M-1 (security review 2026-10-07). The cookie is also the receiver's proof
   * that THIS browser started the dance, so a sibling subdomain must not be able
   * to plant it: `__Host-` forbids a `Domain`, and requires `Secure` in every
   * environment — a browser drops a `__Host-` cookie set without it.
   */
  it("is a __Host- cookie, secure in every environment", async () => {
    expect(OAUTH_NEXT_COOKIE.startsWith("__Host-")).toBe(true);

    vi.stubEnv("NODE_ENV", "development");
    await setOAuthNext("/");
    expect(store.set.mock.calls[0][2]).toMatchObject({ secure: true, path: "/" });
    expect(store.set.mock.calls[0][2]).not.toHaveProperty("domain");
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

  // Absent and empty are different answers: absent means this browser did not
  // start a dance, and the receiver refuses to redeem a code on it.
  it("reports an absent cookie as null, not as /", async () => {
    store.get.mockReturnValue(undefined);

    await expect(readOAuthNext()).resolves.toBeNull();
  });

  /**
   * Since M-1 an absent cookie is a refusal, so a read under any other name than
   * the one written — the old `mm.oauth_next`, say — turns every OAuth sign-in
   * into `oauth_handoff_failed`. The other tests here answer `get` whatever name
   * it is asked for, so only a store that honours the name can see that.
   */
  it("reads and clears the cookie under the name it was written with", async () => {
    await setOAuthNext("/calendar");
    const [writtenName, writtenValue] = store.set.mock.calls[0];
    store.get.mockImplementation((name: string) =>
      name === writtenName ? { name, value: writtenValue } : undefined,
    );

    await expect(readOAuthNext()).resolves.toBe("/calendar");
    await clearOAuthNext();
    expect(store.delete.mock.calls[0][0]).toMatchObject({ name: writtenName });
  });

  it("falls back to / when the cookie is present but empty", async () => {
    store.get.mockReturnValue({ value: "" });

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

  // Read through Next's real cookie serializer, not the mock's arguments: a
  // browser ignores a delete of a `__Host-` cookie whose `Set-Cookie` lacks
  // `Secure`, and the proof would outlive its dance.
  it("clears the cookie with a delete the browser will apply", async () => {
    await clearOAuthNext();

    const { ResponseCookies } = await import("next/dist/compiled/@edge-runtime/cookies");
    const headers = new Headers();
    new ResponseCookies(headers).delete(store.delete.mock.calls[0]?.[0]);
    const header = headers.get("set-cookie") ?? "";
    expect(header).toMatch(/^__Host-mm\.oauth_next=;/);
    expect(header).toContain("Secure");
    expect(header).toContain("Path=/");
    expect(header).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});
