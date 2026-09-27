import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  OTP_NONCE_COOKIE,
  PWRESET_NONCE_COOKIE,
  bindWithinReissueCooldown,
  clearAllBindings,
  clearOtpBinding,
  clearPasswordResetBinding,
  readOtpBinding,
  readPasswordResetBinding,
  setOtpBinding,
  putBindingToSleep,
  recordRefusedCode,
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

/**
 * BUG-13/BUG-14 (v0.2.0-rc). Inside the backend's reissue cooldown (60s) a
 * request is answered 202 with no email and a nonce that matches nothing, and
 * the backend keeps ONE code per user for sign-in and reset alike. So a flow
 * must stay bound to the live code — its own, or the other flow's for the same
 * address — instead of asking again.
 */
describe("bindWithinReissueCooldown", () => {
  const TTL_MS = 300_000;
  const binding = (
    secondsAgo: number,
    email = "op@example.test",
    nonce = "live",
    extra: { fails?: number; dormant?: boolean } = {},
  ) => encode({ nonce, email, exp: Date.now() - secondsAgo * 1000 + TTL_MS, ...extra });

  function written(call = 0) {
    const [name, value, opts] = store.set.mock.calls[call];
    return {
      name,
      maxAge: (opts as { maxAge: number }).maxAge,
      value: JSON.parse(Buffer.from(value as string, "base64url").toString("utf8")) as {
        nonce: string;
        exp: number;
        fails?: number;
        dormant?: boolean;
      },
    };
  }

  function cookiesAre(values: { otp?: string; reset?: string }) {
    store.get.mockImplementation((name: string) => {
      const value =
        name === OTP_NONCE_COOKIE ? values.otp : name === PWRESET_NONCE_COOKIE ? values.reset : undefined;
      return value === undefined ? undefined : { value };
    });
  }

  beforeEach(() => {
    store.set.mockReset();
    store.get.mockReset();
  });

  it("keeps its own fresh binding for the same address, writing nothing", async () => {
    cookiesAre({ otp: binding(20) });

    const kept = await bindWithinReissueCooldown("sign-in", "  OP@Example.test ");

    expect(kept?.expiresAt).toBeGreaterThan(Date.now());
    expect(kept?.spent).toBeUndefined();
    expect(store.set).not.toHaveBeenCalled();
  });

  it.each([
    ["sign-in", OTP_NONCE_COOKIE, { reset: binding(20, "op@example.test", "reset-nonce") }, "reset-nonce"],
    ["reset", PWRESET_NONCE_COOKIE, { otp: binding(20, "op@example.test", "signin-nonce") }, "signin-nonce"],
  ] as const)("binds %s to the other flow's live code", async (flow, cookie, cookies, nonce) => {
    cookiesAre(cookies);

    const kept = await bindWithinReissueCooldown(flow, "op@example.test");

    expect(kept).toBeDefined();
    expect(store.set).toHaveBeenCalledTimes(1);
    const { name, value, maxAge } = written();
    expect(name).toBe(cookie);
    // The same code: its nonce, and its deadline — not a fresh five minutes.
    expect(value.nonce).toBe(nonce);
    expect(value.exp).toBe(kept?.expiresAt);
    expect(maxAge).toBeLessThanOrEqual(280);
  });

  it("asks for a code when the live binding is for another address", async () => {
    cookiesAre({
      otp: binding(20, "someone-else@example.test"),
      reset: binding(20, "someone-else@example.test"),
    });

    expect(await bindWithinReissueCooldown("reset", "op@example.test")).toBeUndefined();
    expect(store.set).not.toHaveBeenCalled();
  });

  it("asks for a code once the cooldown has passed", async () => {
    cookiesAre({ otp: binding(61), reset: binding(61) });

    expect(await bindWithinReissueCooldown("sign-in", "op@example.test")).toBeUndefined();
  });

  it("asks for a code when the binding's age is unknown", async () => {
    // Written before the deadline field existed.
    cookiesAre({ otp: encode({ nonce: "old", email: "op@example.test" }) });

    expect(await bindWithinReissueCooldown("sign-in", "op@example.test")).toBeUndefined();
  });
  // QA regress of BUG-13: leaving step two and asking again for the same
  // address inside the minute.
  it("wakes its own dormant binding for the same address", async () => {
    cookiesAre({ otp: binding(20, "op@example.test", "asleep", { dormant: true }) });

    const kept = await bindWithinReissueCooldown("sign-in", "op@example.test");

    expect(kept?.expiresAt).toBeGreaterThan(Date.now());
    const { name, value } = written();
    expect(name).toBe(OTP_NONCE_COOKIE);
    expect(value.nonce).toBe("asleep");
    expect(value.dormant).toBeUndefined();
  });

  it("reports the refusals a kept code has already taken, across both flows", async () => {
    cookiesAre({
      otp: binding(20, "op@example.test", "shared", { fails: 3, dormant: true }),
      reset: binding(20, "op@example.test", "shared", { fails: 1 }),
    });

    expect((await bindWithinReissueCooldown("sign-in", "op@example.test"))?.refused).toBe(4);
  });

  it("reports the other flow's refusals when binding to its code", async () => {
    cookiesAre({ reset: binding(20, "op@example.test", "shared", { fails: 2 }) });

    expect((await bindWithinReissueCooldown("sign-in", "op@example.test"))?.refused).toBe(2);
  });

  it("answers spent for a code refused five times, until it expires", async () => {
    // Long past the cooldown: the burnt code still holds the backend's slot.
    cookiesAre({ otp: binding(200, "op@example.test", "burnt", { fails: 5 }) });

    const kept = await bindWithinReissueCooldown("sign-in", "op@example.test");

    expect(kept?.spent).toBe(true);
    expect(kept?.expiresAt).toBeGreaterThan(Date.now());
    expect(store.set).not.toHaveBeenCalled();
  });

  it("answers spent for a code burnt in the other flow, even asleep", async () => {
    cookiesAre({ otp: binding(200, "op@example.test", "burnt", { fails: 5, dormant: true }) });

    expect((await bindWithinReissueCooldown("reset", "op@example.test"))?.spent).toBe(true);
  });

  it("sums refusals across both flows for the same code", async () => {
    // Three refused while signing in, two while resetting: five on the one
    // code the backend holds, though neither cookie reaches five alone.
    cookiesAre({
      otp: binding(200, "op@example.test", "shared", { fails: 3 }),
      reset: binding(200, "op@example.test", "shared", { fails: 2 }),
    });

    expect((await bindWithinReissueCooldown("sign-in", "op@example.test"))?.spent).toBe(true);
  });

  it("does not sum refusals of different codes", async () => {
    cookiesAre({
      otp: binding(200, "op@example.test", "one", { fails: 3 }),
      reset: binding(200, "op@example.test", "two", { fails: 2 }),
    });

    expect(await bindWithinReissueCooldown("sign-in", "op@example.test")).toBeUndefined();
  });

  it("asks for a code once a burnt code has expired", async () => {
    cookiesAre({ otp: binding(301, "op@example.test", "burnt", { fails: 5 }) });

    expect(await bindWithinReissueCooldown("sign-in", "op@example.test")).toBeUndefined();
  });

  it("copies the other flow's code with its own refusal count at zero", async () => {
    cookiesAre({ otp: binding(20, "op@example.test", "shared", { fails: 3 }) });

    await bindWithinReissueCooldown("reset", "op@example.test");

    // Carried over, the three would be counted twice by the sum above.
    expect(written().value.fails).toBeUndefined();
  });
});

describe("refusals, sleep and redemption", () => {
  const TTL_MS = 300_000;

  beforeEach(() => {
    store.set.mockReset();
    store.get.mockReset();
    store.delete.mockReset();
  });

  function cookieIs(value: unknown) {
    store.get.mockImplementation((name: string) =>
      name === OTP_NONCE_COOKIE ? { value: encode(value) } : undefined,
    );
  }

  function writtenValue() {
    return JSON.parse(Buffer.from(store.set.mock.calls[0][1] as string, "base64url").toString("utf8")) as {
      nonce: string;
      exp: number;
      fails?: number;
      dormant?: boolean;
    };
  }

  it("counts a refusal in the binding, keeping the code's deadline", async () => {
    const exp = Date.now() + 120_000;
    cookieIs({ nonce: "n", email: "op@example.test", exp, fails: 2 });

    await recordRefusedCode("sign-in");

    expect(store.set.mock.calls[0][0]).toBe(OTP_NONCE_COOKIE);
    expect(writtenValue()).toMatchObject({ nonce: "n", exp, fails: 3 });
  });

  it("writes nothing when there is no binding to count against", async () => {
    store.get.mockReturnValue(undefined);

    await recordRefusedCode("reset");

    expect(store.set).not.toHaveBeenCalled();
  });

  it("puts a binding to sleep without changing its code or deadline", async () => {
    const exp = Date.now() + TTL_MS - 20_000;
    cookieIs({ nonce: "n", email: "op@example.test", exp, fails: 1 });

    await putBindingToSleep("sign-in");

    expect(writtenValue()).toEqual({ nonce: "n", email: "op@example.test", exp, fails: 1, dormant: true });
    expect(store.delete).not.toHaveBeenCalled();
  });

  it("hides a dormant binding from the flow's own read", async () => {
    // Asleep, it must neither resume the step the user left nor verify a code.
    cookieIs({ nonce: "n", email: "op@example.test", exp: Date.now() + 60_000, dormant: true });

    expect(await readOtpBinding()).toBeUndefined();
  });

  it("clears both flows' bindings once a code is redeemed", async () => {
    await clearAllBindings();

    const names = store.delete.mock.calls.map(([arg]) => (arg as { name: string }).name);
    expect(names).toEqual(expect.arrayContaining([OTP_NONCE_COOKIE, PWRESET_NONCE_COOKIE]));
    expect(names).toHaveLength(2);
  });
});
