import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  OTP_NONCE_COOKIE,
  PWRESET_NONCE_COOKIE,
  clearOtpBinding,
  clearPasswordResetBinding,
  readOtpBinding,
  readPasswordResetBinding,
  setOtpBinding,
  setPasswordResetBinding,
} from "@/server/auth/otp-nonce-cookie";

const store = {
  set: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve(store),
}));

/** The `Set-Cookie` Next would emit for a `store.delete(...)` call with these arguments. */
async function serializeDelete(arg: unknown): Promise<string> {
  const { ResponseCookies } = await import("next/dist/compiled/@edge-runtime/cookies");
  const headers = new Headers();
  const cookies = new ResponseCookies(headers);
  if (typeof arg === "string") {
    cookies.delete(arg);
  } else {
    cookies.delete(arg as Exclude<Parameters<typeof cookies.delete>[0], string>);
  }
  return headers.get("set-cookie") ?? "";
}

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

    // A binding written before the deadline existed still reads — with no
    // deadline, which the flow treats as unknown.
    expect(await readOtpBinding()).toEqual({ nonce: "n-9", email: "user@example.test" });
  });

  /**
   * UX-12 (v0.2.0-rc): the code's deadline travels in the binding so a flow
   * resumed after a reload counts down from what is left. It is the write time
   * plus the cookie's own maxAge, so the two cannot disagree.
   */
  it("writes the code's deadline and reads it back", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T10:00:00Z"));
    try {
      await setOtpBinding({ nonce: "n-1", email: "someone@example.test" });
    } finally {
      vi.useRealTimers();
    }

    const written = store.set.mock.calls[0]?.[1] as string;
    const decoded = JSON.parse(Buffer.from(written, "base64url").toString("utf8")) as { exp: number };
    expect(decoded.exp).toBe(Date.parse("2026-09-27T10:05:00Z"));

    store.get.mockReturnValue({ value: written });
    expect((await readOtpBinding())?.expiresAt).toBe(Date.parse("2026-09-27T10:05:00Z"));
  });

  it("ignores a deadline that is not a number", async () => {
    store.get.mockReturnValue({ value: encode({ nonce: "n", email: "a@b.test", exp: "soon" }) });

    expect(await readOtpBinding()).toEqual({ nonce: "n", email: "a@b.test" });
  });

  /**
   * Replayed through Next's REAL cookie serializer rather than asserted on the
   * call: the defect was in what reached the wire. `delete(name)` serializes
   * without `Secure`, and a browser drops a `Set-Cookie` for a `__Host-` cookie
   * that lacks it — so the old assertion, `toHaveBeenCalledWith(name)`, pinned
   * the bug in place.
   */
  it.each([
    ["sign-in", clearOtpBinding, OTP_NONCE_COOKIE],
    ["reset", clearPasswordResetBinding, PWRESET_NONCE_COOKIE],
  ] as const)("clears the %s binding with a delete the browser will apply", async (_flow, clear, name) => {
    await clear();

    const header = await serializeDelete(store.delete.mock.calls[0]?.[0]);
    expect(header).toMatch(new RegExp(`^${name.replace(/\./g, "\\.")}=;`));
    expect(header).toContain("Secure");
    expect(header).toContain("Path=/");
    expect(header).toMatch(/Expires=Thu, 01 Jan 1970/);
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

describe("two flows, two cookies (RUK-289)", () => {
  beforeEach(() => {
    store.set.mockReset();
    store.get.mockReset();
    store.delete.mockReset();
  });

  // Asserted as literal strings against the real exported constants, NOT
  // re-derived from whatever produces them and NOT mocked. Both names are
  // deployed artifacts: renaming the sign-in one invalidates every binding a
  // user is holding mid-flow at deploy time, and a test that recomputes the
  // name would pass through exactly that rename.
  it("pins both cookie names as deployed artifacts", () => {
    expect(OTP_NONCE_COOKIE).toBe("__Host-mm.otp_nonce");
    expect(PWRESET_NONCE_COOKIE).toBe("__Host-mm.pwreset_nonce");
  });

  // The bug this split exists for: with ONE cookie, requesting a password-reset
  // code overwrites the sign-in binding, and the email equality check PASSES
  // because the address is the same. The sign-in code is then verified against
  // the reset nonce and the user is told a correct code is wrong.
  //
  // Note what this does NOT claim: the sign-in CODE does not survive either,
  // because the backend keeps one OTP record per user and issuing a reset code
  // consumes the live one (SPEC §1.5). Only the local binding is separated.
  it("writing a reset binding leaves the sign-in binding untouched", async () => {
    await setOtpBinding({ nonce: "signin-nonce", email: "op@example.test" });
    await setPasswordResetBinding({ nonce: "reset-nonce", email: "op@example.test" });

    const written = store.set.mock.calls.map(([name]) => name);
    expect(written).toEqual(["__Host-mm.otp_nonce", "__Host-mm.pwreset_nonce"]);
  });

  it("reads the reset binding from its own cookie", async () => {
    store.get.mockImplementation((name: string) =>
      name === "__Host-mm.pwreset_nonce"
        ? { value: encode({ nonce: "reset-nonce", email: "op@example.test" }) }
        : undefined,
    );

    await expect(readPasswordResetBinding()).resolves.toEqual({
      nonce: "reset-nonce",
      email: "op@example.test",
    });
    // The sign-in reader must not fall back to the reset cookie.
    await expect(readOtpBinding()).resolves.toBeUndefined();
  });

  it("clearing one flow's binding does not clear the other's", async () => {
    await clearPasswordResetBinding();

    expect(store.delete).toHaveBeenCalledTimes(1);
    expect(store.delete.mock.calls[0]?.[0]).toMatchObject({ name: "__Host-mm.pwreset_nonce" });
  });

  it("keeps the reset cookie's flags and TTL identical to sign-in's", async () => {
    await setPasswordResetBinding({ nonce: "n", email: "op@example.test" });

    const [, , opts] = store.set.mock.calls[0];
    expect(opts).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, path: "/" });
    expect(opts.maxAge).toBe(300);
  });
});
