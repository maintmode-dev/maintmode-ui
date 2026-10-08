import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  OAUTH_BINDING_COOKIE,
  bindingFor,
  clearOAuthBinding,
  mintOAuthBinding,
  readOAuthBindingProof,
} from "@/server/auth/oauth-binding-cookie";

const store = { set: vi.fn(), get: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve(store) }));

beforeEach(() => {
  store.set.mockReset();
  store.get.mockReset();
  store.delete.mockReset();
});

/**
 * M-1 / backend L1. The backend checks `base64url(SHA-256(proof)) == binding`
 * (`internal/services/auth/dance_binding.go`), so the two sides must agree on
 * the encoding byte for byte: unpadded base64url, hash over the ASCII nonce.
 */
describe("bindingFor", () => {
  it("is unpadded base64url of SHA-256 — the published test vector for 'abc'", () => {
    expect(bindingFor("abc")).toBe("ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0");
  });
});

describe("mintOAuthBinding", () => {
  it("keeps a fresh 32-byte nonce in a __Host- cookie and returns its hash", async () => {
    const binding = await mintOAuthBinding();

    const [name, nonce, attributes] = store.set.mock.calls[0];
    expect(name).toBe("__Host-mm.oauth_binding");
    // 32 random bytes, unpadded base64url: what the backend decodes and sizes.
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(attributes).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 900,
    });
    expect(binding).toBe(bindingFor(nonce));
    // The nonce itself never goes on the URL.
    expect(binding).not.toBe(nonce);
  });

  it("never reuses a nonce", async () => {
    await mintOAuthBinding();
    await mintOAuthBinding();

    expect(store.set.mock.calls[0][1]).not.toBe(store.set.mock.calls[1][1]);
  });
});

describe("readOAuthBindingProof", () => {
  it("reads the nonce under the name it was written with", async () => {
    store.get.mockImplementation((name: string) =>
      name === OAUTH_BINDING_COOKIE ? { value: "n" } : undefined,
    );

    await expect(readOAuthBindingProof()).resolves.toBe("n");
  });

  it.each([[undefined], [{ value: "" }]])("answers null when there is no nonce (%j)", async (cookie) => {
    store.get.mockReturnValue(cookie);

    await expect(readOAuthBindingProof()).resolves.toBeNull();
  });
});

describe("clearOAuthBinding", () => {
  // Through Next's real serializer: a browser ignores a delete of a `__Host-`
  // cookie whose Set-Cookie lacks Secure, and the nonce would outlive its dance.
  it("clears the cookie with a delete the browser will apply", async () => {
    await clearOAuthBinding();

    const { ResponseCookies } = await import("next/dist/compiled/@edge-runtime/cookies");
    const headers = new Headers();
    new ResponseCookies(headers).delete(store.delete.mock.calls[0]?.[0]);
    const header = headers.get("set-cookie") ?? "";
    expect(header).toMatch(/^__Host-mm\.oauth_binding=;/);
    expect(header).toContain("Secure");
    expect(header).toContain("Path=/");
  });
});
