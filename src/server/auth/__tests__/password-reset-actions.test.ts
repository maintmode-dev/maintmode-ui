import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  abandonPasswordResetAction,
  confirmPasswordResetAction,
  requestPasswordResetAction,
} from "@/server/auth/password-reset-actions";

const requestPasswordResetCode = vi.fn();
const confirmPasswordReset = vi.fn();
const setPasswordResetBinding = vi.fn();
const readPasswordResetBinding = vi.fn();
const clearPasswordResetBinding = vi.fn();
const bindWithinReissueCooldown = vi.fn();
const putBindingToSleep = vi.fn();
const recordRefusedCode = vi.fn();
const clearAllBindings = vi.fn();
const signOut = vi.fn();
const clearActiveSession = vi.fn();

vi.mock("@/server/auth/backend-token-exchange", () => ({
  requestPasswordResetCode: (...args: unknown[]) => requestPasswordResetCode(...args),
  confirmPasswordReset: (...args: unknown[]) => confirmPasswordReset(...args),
}));

vi.mock("@/server/auth/otp-nonce-cookie", async (importOriginal) => {
  // `normalizeEmail` is the real one: the binding check compares against it, and
  // a stubbed version would make the mismatch tests agree with themselves.
  const actual = await importOriginal<typeof import("@/server/auth/otp-nonce-cookie")>();
  return {
    normalizeEmail: actual.normalizeEmail,
    bindWithinReissueCooldown: (...args: unknown[]) => bindWithinReissueCooldown(...args),
    putBindingToSleep: (...args: unknown[]) => putBindingToSleep(...args),
    recordRefusedCode: (...args: unknown[]) => recordRefusedCode(...args),
    clearAllBindings: () => clearAllBindings(),
    setPasswordResetBinding: (...args: unknown[]) => setPasswordResetBinding(...args),
    readPasswordResetBinding: () => readPasswordResetBinding(),
    clearPasswordResetBinding: () => clearPasswordResetBinding(),
  };
});

vi.mock("@/server/auth/auth-config", () => ({ signOut: (...args: unknown[]) => signOut(...args) }));
vi.mock("@/server/auth/session-token", () => ({ clearActiveSession: () => clearActiveSession() }));

/** A backend failure as `postBackendJson` throws it. */
function backendError(status: number, body = "") {
  return Object.assign(new Error(`backend ${status}`), { status, responseBody: body });
}

/** The deadline the mocked cookie write reports back. */
const DEADLINE = Date.parse("2026-09-27T12:05:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  setPasswordResetBinding.mockResolvedValue(DEADLINE);
  bindWithinReissueCooldown.mockResolvedValue(undefined);
  console.error = vi.fn();
});

describe("requesting a reset code cannot become an account-existence oracle", () => {
  // AC-1. The backend answers 202 for a registered address, an unknown one and
  // a blocked one alike; this asserts the ACTION collapses them too, which is
  // the only half of that promise the frontend owns.
  it("answers identically for every address the backend accepts", async () => {
    requestPasswordResetCode.mockResolvedValue({ session_nonce: "n" });

    const registered = await requestPasswordResetAction("known@example.test");
    const unknown = await requestPasswordResetAction("nobody@example.test");
    const blocked = await requestPasswordResetAction("blocked@example.test");

    expect(registered).toEqual({ expiresAt: DEADLINE });
    expect(unknown).toEqual(registered);
    expect(blocked).toEqual(registered);
  });

  it("binds the nonce to this browser", async () => {
    requestPasswordResetCode.mockResolvedValue({ session_nonce: "nonce-1" });

    await requestPasswordResetAction("op@example.test");

    expect(setPasswordResetBinding).toHaveBeenCalledWith({ nonce: "nonce-1", email: "op@example.test" });
  });

  it("rejects an empty address without calling the backend", async () => {
    await expect(requestPasswordResetAction("   ")).resolves.toEqual({ error: "invalid_email" });
    expect(requestPasswordResetCode).not.toHaveBeenCalled();
  });

  // AC-12. A rate limit is not a verdict on the address, and an outage is a
  // fact about the service — neither may wear the uniform copy, which would
  // tell every user their input was wrong.
  it("separates a rate limit and an outage from the uniform answer", async () => {
    requestPasswordResetCode.mockRejectedValueOnce(backendError(429));
    await expect(requestPasswordResetAction("op@example.test")).resolves.toEqual({
      error: "otp_rate_limited",
    });

    requestPasswordResetCode.mockRejectedValueOnce(backendError(503));
    await expect(requestPasswordResetAction("op@example.test")).resolves.toEqual({
      error: "password_reset_unavailable",
    });

    requestPasswordResetCode.mockRejectedValueOnce(backendError(404));
    await expect(requestPasswordResetAction("op@example.test")).resolves.toEqual({
      error: "password_reset_unavailable",
    });
  });

  // A rejected input is not an outage. Today this endpoint answers only 202 and
  // 429, but reporting a future 4xx as "the service is down" would send a user
  // whose address was refused off to wait for a recovery that never comes.
  it("does not report a rejected request as an outage", async () => {
    requestPasswordResetCode.mockRejectedValueOnce(backendError(400));

    await expect(requestPasswordResetAction("op@example.test")).resolves.toEqual({
      error: "invalid_email",
    });
  });
});

describe("confirming a reset", () => {
  beforeEach(() => {
    readPasswordResetBinding.mockResolvedValue({ nonce: "nonce-1", email: "op@example.test" });
  });

  // AC-3, at the action boundary. The backend hides a policy violation inside
  // the same 401 as a wrong code, so a password that fails the policy must
  // never reach it — the user would be told their correct code was wrong.
  it("refuses a short password without spending an attempt", async () => {
    const result = await confirmPasswordResetAction({
      email: "op@example.test",
      code: "123456",
      newPassword: "short",
    });

    expect(result).toEqual({ error: "password_policy_violation" });
    expect(confirmPasswordReset).not.toHaveBeenCalled();
    // The binding survives: nothing was spent, and the code is still good.
    expect(clearPasswordResetBinding).not.toHaveBeenCalled();
  });

  // AC-4. Past the 204 the password IS changed and every session is dead.
  it("tears the local session down on success", async () => {
    confirmPasswordReset.mockResolvedValue(undefined);

    await confirmPasswordResetAction({
      email: "op@example.test",
      code: "123456",
      newPassword: "a-long-enough-password",
    });

    expect(signOut).toHaveBeenCalledWith({ redirect: false });
    expect(clearActiveSession).toHaveBeenCalled();
    // One code serves both flows on the backend: the sign-in binding may hold
    // the code just spent, so both go.
    expect(clearAllBindings).toHaveBeenCalledTimes(1);
  });

  // AC-4, the half that matters more. The backend has already committed the
  // change; a teardown that throws must not swallow the confirmation, or the
  // user is left believing their password is unchanged when it is not.
  it("still confirms when the teardown throws", async () => {
    confirmPasswordReset.mockResolvedValue(undefined);
    signOut.mockRejectedValueOnce(new Error("cookie store unavailable"));

    const result = await confirmPasswordResetAction({
      email: "op@example.test",
      code: "123456",
      newPassword: "a-long-enough-password",
    });

    expect(result).toEqual({ done: true });
  });

  it("sends the bound nonce, not anything the caller supplied", async () => {
    confirmPasswordReset.mockResolvedValue(undefined);

    await confirmPasswordResetAction({
      email: "OP@Example.test",
      code: "123456",
      newPassword: "a-long-enough-password",
    });

    expect(confirmPasswordReset).toHaveBeenCalledWith({
      email: "op@example.test",
      code: "123456",
      sessionNonce: "nonce-1",
      newPassword: "a-long-enough-password",
    });
  });

  it("reports a lost binding as the uniform failure, without calling the backend", async () => {
    readPasswordResetBinding.mockResolvedValue(undefined);

    const result = await confirmPasswordResetAction({
      email: "op@example.test",
      code: "123456",
      newPassword: "a-long-enough-password",
    });

    // BUG-2: no distinct lost-binding code — the backend withdrew its own for
    // revealing whether an account exists, and this must not be a second copy.
    expect(result).toEqual({ error: "password_reset_failed" });
    expect(confirmPasswordReset).not.toHaveBeenCalled();
  });

  it("refuses when the bound address is not the one being confirmed", async () => {
    readPasswordResetBinding.mockResolvedValue({ nonce: "n", email: "someone-else@example.test" });

    const result = await confirmPasswordResetAction({
      email: "op@example.test",
      code: "123456",
      newPassword: "a-long-enough-password",
    });

    expect(result).toEqual({ error: "password_reset_failed" });
    expect(confirmPasswordReset).not.toHaveBeenCalled();
  });

  // The clear policy, which is the difference between a recoverable mistype and
  // a destroyed code.
  it("keeps the binding on a wrong code, so remaining attempts survive", async () => {
    confirmPasswordReset.mockRejectedValueOnce(
      backendError(401, '{"code":"unauthorized","message":"authentication failed"}'),
    );

    const result = await confirmPasswordResetAction({
      email: "op@example.test",
      code: "000000",
      newPassword: "a-long-enough-password",
    });

    expect(result).toEqual({ error: "password_reset_failed" });
    expect(clearPasswordResetBinding).not.toHaveBeenCalled();
    // Counted in the cookie, so a code burnt by five refusals is still known
    // to be burnt after a reload.
    expect(recordRefusedCode).toHaveBeenCalledWith("reset");
  });

  it("answers a withdrawn mismatch code uniformly, and keeps the binding", async () => {
    // An older backend may still send the code the contract withdrew. It must
    // not be surfaced, and the binding stays — attempts may remain.
    confirmPasswordReset.mockRejectedValueOnce(
      backendError(401, '{ "code": "otp_session_mismatch", "message": "authentication failed" }'),
    );

    const result = await confirmPasswordResetAction({
      email: "op@example.test",
      code: "123456",
      newPassword: "a-long-enough-password",
    });

    expect(result).toEqual({ error: "password_reset_failed" });
    expect(clearPasswordResetBinding).not.toHaveBeenCalled();
  });

  // §3.6 requires the rate limit to keep its own copy on BOTH endpoints. The
  // request path already had this; the confirm path did not, and folding a 429
  // into "unavailable" tells a throttled user the service is broken.
  it("keeps a rate limit apart from an outage, and keeps the binding", async () => {
    confirmPasswordReset.mockRejectedValueOnce(backendError(429));

    const result = await confirmPasswordResetAction({
      email: "op@example.test",
      code: "123456",
      newPassword: "a-long-enough-password",
    });

    expect(result).toEqual({ error: "otp_rate_limited" });
    expect(clearPasswordResetBinding).not.toHaveBeenCalled();
    // A throttled request never reached the code: no attempt was spent.
    expect(recordRefusedCode).not.toHaveBeenCalled();
  });

  // §3.4's rule, made executable. A substring implementation would match the
  // code wherever it appears — including inside `message` — and would then
  // clear a binding that still had attempts left, destroying a usable code.
  // Every other fixture here has field and substring agreeing, so only this
  // one separates the two implementations.
  it("reads the code FIELD, not the message text", async () => {
    confirmPasswordReset.mockRejectedValueOnce(
      backendError(
        401,
        '{"code":"unauthorized","message":"authentication failed for otp_session_mismatch reasons"}',
      ),
    );

    const result = await confirmPasswordResetAction({
      email: "op@example.test",
      code: "123456",
      newPassword: "a-long-enough-password",
    });

    expect(result).toEqual({ error: "password_reset_failed" });
    expect(clearPasswordResetBinding).not.toHaveBeenCalled();
  });

  it("keeps an outage apart from a wrong code, and keeps the binding", async () => {
    confirmPasswordReset.mockRejectedValueOnce(backendError(502));

    const result = await confirmPasswordResetAction({
      email: "op@example.test",
      code: "123456",
      newPassword: "a-long-enough-password",
    });

    expect(result).toEqual({ error: "password_reset_unavailable" });
    expect(clearPasswordResetBinding).not.toHaveBeenCalled();
    expect(recordRefusedCode).not.toHaveBeenCalled();
  });

  // The teardown error can be a BackendAuthError whose `responseBody` is the
  // raw refresh response — a token pair. Logging the object would serialize it.
  it("never logs credential material when the teardown fails", async () => {
    confirmPasswordReset.mockResolvedValue(undefined);
    signOut.mockRejectedValueOnce(
      Object.assign(new Error("refresh failed"), {
        status: 401,
        responseBody: '{"access_token":"at_SECRET","refresh_token":"rt_SECRET"}',
      }),
    );

    await confirmPasswordResetAction({
      email: "op@example.test",
      code: "123456",
      newPassword: "a-long-enough-password",
    });

    const logged = JSON.stringify((console.error as unknown as ReturnType<typeof vi.fn>).mock.calls);
    expect(logged).not.toContain("rt_SECRET");
    expect(logged).not.toContain("access_token");
  });

  it("never logs the address or the code", async () => {
    confirmPasswordReset.mockRejectedValueOnce(backendError(401, "{}"));

    await confirmPasswordResetAction({
      email: "secret@example.test",
      code: "424242",
      newPassword: "a-long-enough-password",
    });

    const logged = JSON.stringify((console.error as unknown as ReturnType<typeof vi.fn>).mock.calls);
    expect(logged).not.toContain("secret@example.test");
    expect(logged).not.toContain("424242");
  });
});

describe("abandoning the flow", () => {
  it("puts the reset binding to sleep rather than deleting it", async () => {
    // Deleted, coming back to the same address inside the reissue cooldown
    // asked the backend again: 202, no email, and a nonce that matches nothing
    // (QA regress of BUG-13).
    await abandonPasswordResetAction();

    expect(putBindingToSleep).toHaveBeenCalledWith("reset");
    expect(clearPasswordResetBinding).not.toHaveBeenCalled();
  });
});

/** As for sign-in: a live bound code means no backend call (BUG-13/BUG-14). */
describe("requestPasswordResetAction — inside the backend's reissue cooldown", () => {
  it("skips the backend and reports the kept code's deadline", async () => {
    bindWithinReissueCooldown.mockResolvedValue({ expiresAt: DEADLINE - 60_000 });

    const result = await requestPasswordResetAction("  op@example.test ");

    expect(bindWithinReissueCooldown).toHaveBeenCalledWith("reset", "op@example.test");
    expect(result).toEqual({ expiresAt: DEADLINE - 60_000 });
    expect(requestPasswordResetCode).not.toHaveBeenCalled();
    expect(setPasswordResetBinding).not.toHaveBeenCalled();
  });

  it("passes on how many attempts the kept code has already lost", async () => {
    bindWithinReissueCooldown.mockResolvedValue({ expiresAt: DEADLINE - 60_000, refused: 2 });

    await expect(requestPasswordResetAction("op@example.test")).resolves.toEqual({
      expiresAt: DEADLINE - 60_000,
      refused: 2,
    });
  });

  it("says the bound code is burnt instead of pretending a new one was sent", async () => {
    // Five refusals burn the code until its TTL; the backend's 202 in that
    // window sends nothing, so "check your inbox" would be a lie.
    bindWithinReissueCooldown.mockResolvedValue({ expiresAt: DEADLINE - 60_000, spent: true });

    const result = await requestPasswordResetAction("op@example.test");

    expect(result).toEqual({ error: "otp_attempts_spent", expiresAt: DEADLINE - 60_000 });
    expect(requestPasswordResetCode).not.toHaveBeenCalled();
  });
});
