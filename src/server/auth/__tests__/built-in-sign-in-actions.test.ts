import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RUK-288 — the server actions behind the built-in methods.
 *
 * Two properties are defended here that nothing else covers: the request step
 * must not leak whether an address has an account, and the sign-in destination
 * must survive an attacker-chosen `next`.
 */

const requestOtpCode = vi.fn();
const signIn = vi.fn();
const setOtpBinding = vi.fn();
const bindWithinReissueCooldown = vi.fn();
const clearOtpBinding = vi.fn();
const putBindingToSleep = vi.fn();

/** The deadline the mocked cookie write reports back. */
const DEADLINE = Date.parse("2026-09-27T12:05:00Z");

vi.mock("@/server/auth/backend-token-exchange", () => ({
  requestOtpCode: (...args: unknown[]) => requestOtpCode(...args),
}));
vi.mock("@/server/auth/auth-config", () => ({
  signIn: (...args: unknown[]) => signIn(...args),
}));
// The keep-the-binding decision itself is tested on the real module in
// otp-nonce-cookie.test.ts; here only what the action does with its answer.
vi.mock("@/server/auth/otp-nonce-cookie", () => ({
  bindWithinReissueCooldown: (...args: unknown[]) => bindWithinReissueCooldown(...args),
  setOtpBinding: (...args: unknown[]) => setOtpBinding(...args),
  clearOtpBinding: () => clearOtpBinding(),
  putBindingToSleep: (...args: unknown[]) => putBindingToSleep(...args),
}));

const { changeEmailAction, credentialsSignInAction, requestOtpAction } =
  await import("@/server/auth/built-in-sign-in-actions");

beforeEach(() => {
  requestOtpCode.mockReset();
  signIn.mockReset();
  setOtpBinding.mockReset().mockResolvedValue(DEADLINE);
  bindWithinReissueCooldown.mockReset().mockResolvedValue(undefined);
  clearOtpBinding.mockReset();
  putBindingToSleep.mockReset();
});

describe("requestOtpAction — the address must stay unknowable", () => {
  it("stores the binding and reports success with the code's deadline", async () => {
    requestOtpCode.mockResolvedValue({ session_nonce: "n-1" });

    await expect(requestOtpAction("someone@example.test")).resolves.toEqual({ expiresAt: DEADLINE });
    expect(setOtpBinding).toHaveBeenCalledWith({ nonce: "n-1", email: "someone@example.test" });
  });

  it("answers identically for an address with no account", async () => {
    // The backend returns 202 with a placeholder nonce for unknown addresses.
    // Any branch here would undo an anti-enumeration guarantee the backend goes
    // to considerable lengths to provide.
    requestOtpCode.mockResolvedValue({ session_nonce: "placeholder" });

    await expect(requestOtpAction("nobody@example.test")).resolves.toEqual({ expiresAt: DEADLINE });
  });

  it("never returns an address-specific error when the call fails", async () => {
    requestOtpCode.mockRejectedValue(new Error("boom"));

    const result = await requestOtpAction("someone@example.test");

    expect(result.error).toBe("otp_request_failed");
    expect(JSON.stringify(result)).not.toContain("someone@example.test");
  });

  it("separates rate limiting from an unreachable service", async () => {
    requestOtpCode.mockRejectedValue(Object.assign(new Error("429"), { status: 429 }));

    await expect(requestOtpAction("someone@example.test")).resolves.toEqual({
      error: "otp_requests_rate_limited",
    });
  });

  it("maps every non-429 failure to the one generic code", async () => {
    // A status-specific branch here (a 404 becoming "unknown_account", say)
    // would hand back exactly what the backend's uniform 202 exists to hide.
    for (const status of [400, 403, 404, 500, 503]) {
      requestOtpCode.mockRejectedValueOnce(Object.assign(new Error("x"), { status }));
      const result = await requestOtpAction("someone@example.test");
      expect(result).toEqual({ error: "otp_request_failed" });
    }
  });

  it("refuses an empty address before calling the backend", async () => {
    await expect(requestOtpAction("   ")).resolves.toEqual({ error: "invalid_email" });
    expect(requestOtpCode).not.toHaveBeenCalled();
  });

  it("trims the address so the binding matches what verify will send", async () => {
    requestOtpCode.mockResolvedValue({ session_nonce: "n-2" });

    await requestOtpAction("  spaced@example.test  ");

    expect(requestOtpCode).toHaveBeenCalledWith("spaced@example.test");
    expect(setOtpBinding).toHaveBeenCalledWith({ nonce: "n-2", email: "spaced@example.test" });
  });
});

describe("credentialsSignInAction — the destination is sanitized here too", () => {
  function redirectToOf(): string {
    return (signIn.mock.calls[0]?.[1] as { redirectTo: string }).redirectTo;
  }

  it.each([
    ["a protocol-relative URL", "//evil.test"],
    ["an absolute URL", "https://evil.test/steal"],
    ["a backslash-prefixed path", "/\\evil.test"],
  ])("refuses %s as a sign-in destination", async (_label, next) => {
    signIn.mockResolvedValue(undefined);

    await credentialsSignInAction({ kind: "password", email: "a@b.test", password: "pw", next });

    // This action is invocable by action id, so it cannot assume its caller
    // already sanitized the value.
    expect(redirectToOf()).not.toContain("evil.test");
  });

  it("keeps an ordinary in-app path", async () => {
    signIn.mockResolvedValue(undefined);

    await credentialsSignInAction({
      kind: "password",
      email: "a@b.test",
      password: "pw",
      next: "/maintenance/m-1001",
    });

    expect(redirectToOf()).toBe("/maintenance/m-1001");
  });

  it("rethrows the redirect that signals a successful sign-in", async () => {
    // Next signals a redirect by throwing. Swallowing it as a failure would
    // break the happy path of every sign-in on the page.
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;push;/;" });
    signIn.mockRejectedValue(redirect);

    await expect(
      credentialsSignInAction({ kind: "password", email: "a@b.test", password: "pw" }),
    ).rejects.toBe(redirect);
  });

  it("answers a withdrawn mismatch code with the uniform failure, and keeps the binding", async () => {
    // BUG-2: the lost-binding code is gone from the contract. Should one still
    // arrive, it must not be surfaced — and the binding stays, since the user
    // may have attempts left on a code the backend still honours.
    signIn.mockRejectedValue(Object.assign(new Error("x"), { code: "otp_session_mismatch" }));

    const result = await credentialsSignInAction({
      kind: "otp",
      email: "a@b.test",
      code: "123456",
    });

    expect(result.error).toBe("otp_verification_failed");
    expect(clearOtpBinding).not.toHaveBeenCalled();
  });

  it("passes a rate limit through instead of calling the code wrong", async () => {
    // Collapsed into the uniform failure, a 429 told a throttled user their
    // code was wrong and spent their local attempt budget.
    signIn.mockRejectedValue(Object.assign(new Error("x"), { code: "otp_rate_limited" }));

    const result = await credentialsSignInAction({ kind: "otp", email: "a@b.test", code: "123456" });

    expect(result.error).toBe("otp_rate_limited");
  });
});

/**
 * Inside the backend's reissue cooldown a request is answered 202 with NO
 * email and a nonce that matches nothing (BUG-13/BUG-14). When the cookie
 * module says the flow is already bound to a live code, the action must not
 * call the backend and must report that code's deadline.
 */
describe("requestOtpAction — inside the backend's reissue cooldown", () => {
  it("skips the backend and reports the kept code's deadline", async () => {
    bindWithinReissueCooldown.mockResolvedValue({ expiresAt: DEADLINE - 60_000 });

    const result = await requestOtpAction("  someone@example.test ");

    expect(bindWithinReissueCooldown).toHaveBeenCalledWith("sign-in", "someone@example.test");
    expect(result).toEqual({ expiresAt: DEADLINE - 60_000 });
    expect(requestOtpCode).not.toHaveBeenCalled();
    expect(setOtpBinding).not.toHaveBeenCalled();
  });

  it("passes on how many attempts the kept code has already lost", async () => {
    bindWithinReissueCooldown.mockResolvedValue({ expiresAt: DEADLINE - 60_000, refused: 4 });

    await expect(requestOtpAction("someone@example.test")).resolves.toEqual({
      expiresAt: DEADLINE - 60_000,
      refused: 4,
    });
  });

  it("says the bound code is burnt instead of pretending a new one was sent", async () => {
    bindWithinReissueCooldown.mockResolvedValue({ expiresAt: DEADLINE - 60_000, spent: true });

    const result = await requestOtpAction("someone@example.test");

    expect(result).toEqual({ error: "otp_attempts_spent", expiresAt: DEADLINE - 60_000 });
    expect(requestOtpCode).not.toHaveBeenCalled();
  });

  it("requests a code when nothing live is bound", async () => {
    requestOtpCode.mockResolvedValue({ session_nonce: "fresh" });

    await requestOtpAction("someone@example.test");

    expect(requestOtpCode).toHaveBeenCalledTimes(1);
    expect(setOtpBinding).toHaveBeenCalledWith({ nonce: "fresh", email: "someone@example.test" });
  });
});

describe("changeEmailAction — leaving step two", () => {
  it("puts the binding to sleep rather than deleting it", async () => {
    // Deleted, coming back to the same address inside the reissue cooldown
    // asked the backend again: 202, no email, a nonce that matches nothing.
    await changeEmailAction();

    expect(putBindingToSleep).toHaveBeenCalledWith("sign-in");
    expect(clearOtpBinding).not.toHaveBeenCalled();
  });
});
