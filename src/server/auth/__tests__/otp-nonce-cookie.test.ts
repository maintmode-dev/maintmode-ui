import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  OTP_NONCE_COOKIE,
  clearOtpBinding,
  readOtpBinding,
  setOtpBinding,
} from "@/server/auth/otp-nonce-cookie";

const store = {
  set: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve(store),
}));

/** Encodes exactly as the module does, so round-trip tests aren't self-fulfilling. */
function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

describe("otp-nonce-cookie — the binding never reaches browser JavaScript", () => {
  beforeEach(() => {
    store.set.mockReset();
    store.get.mockReset();
    store.delete.mockReset();
  });

  it("writes an httpOnly, SameSite=Lax, 5-minute cookie", async () => {
    await setOtpBinding({ nonce: "n-1", email: "someone@example.test" });

    expect(store.set).toHaveBeenCalledTimes(1);
    const [name, , opts] = store.set.mock.calls[0];
    expect(name).toBe(OTP_NONCE_COOKIE);
    expect(opts).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, path: "/" });
    // Equal to the backend TTL, not longer: a margin would create a window where
    // a live cookie carries a dead code, producing "wrong code" for a user whose
    // code merely expired.
    expect(opts.maxAge).toBe(300);
  });

  it("uses the __Host- prefix so a sibling subdomain cannot plant a binding", () => {
    expect(OTP_NONCE_COOKIE.startsWith("__Host-")).toBe(true);
  });

  it("never stores the nonce in a readable form", async () => {
    await setOtpBinding({ nonce: "raw-nonce-value", email: "a@example.test" });

    const [, value] = store.set.mock.calls[0];
    expect(value).not.toContain("raw-nonce-value");
  });

  it("normalizes the address before binding it", async () => {
    // The backend normalizes server-side, so binding the raw input would make
    // the two disagree about what "the same address" means.
    await setOtpBinding({ nonce: "n-1", email: "  User@Example.TEST  " });

    const [, value] = store.set.mock.calls[0];
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    expect(decoded.email).toBe("user@example.test");
  });

  it("round-trips the nonce and the email", async () => {
    store.get.mockReturnValue({ value: encode({ nonce: "n-9", email: "user@example.test" }) });

    expect(await readOtpBinding()).toEqual({ nonce: "n-9", email: "user@example.test" });
  });

  it("clears the cookie by name", async () => {
    await clearOtpBinding();

    expect(store.delete).toHaveBeenCalledWith(OTP_NONCE_COOKIE);
  });
});

describe("otp-nonce-cookie — a broken cookie means 'no binding', never a crash", () => {
  beforeEach(() => {
    store.get.mockReset();
  });

  it.each([
    ["absent", undefined],
    ["empty", { value: "" }],
    ["not base64url", { value: "!!!not-base64!!!" }],
    ["base64 but not JSON", { value: Buffer.from("plain text", "utf8").toString("base64url") }],
    ["JSON but not an object", { value: encode("a string") }],
    ["JSON null", { value: encode(null) }],
    ["missing email", { value: encode({ nonce: "n" }) }],
    ["missing nonce", { value: encode({ email: "a@b.test" }) }],
    ["empty nonce", { value: encode({ nonce: "", email: "a@b.test" }) }],
    ["wrong field types", { value: encode({ nonce: 42, email: ["a"] }) }],
    ["truncated", { value: encode({ nonce: "n", email: "a@b.test" }).slice(0, 6) }],
  ])("resolves %s to undefined instead of throwing", async (_label, cookie) => {
    store.get.mockReturnValue(cookie);

    await expect(readOtpBinding()).resolves.toBeUndefined();
  });
});

describe("otp-nonce-cookie — the encoding resists a hostile email address", () => {
  it("cannot let a delimiter-bearing address control the parsed nonce", async () => {
    // The reason this is base64url(JSON) and not `${nonce}:${email}`: the
    // address is attacker-supplied, so a naive join would let it smuggle a
    // nonce of the attacker's choosing past the parser.
    const hostile = 'evil:attacker-nonce","nonce":"attacker-nonce@example.test';
    await setOtpBinding({ nonce: "real-nonce", email: hostile });

    const [, written] = store.set.mock.calls[0];
    store.get.mockReturnValue({ value: written });

    const read = await readOtpBinding();
    expect(read?.nonce).toBe("real-nonce");
    expect(read?.email).toBe(hostile);
  });
});
