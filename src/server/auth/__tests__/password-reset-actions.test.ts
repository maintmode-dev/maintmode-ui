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

beforeEach(() => {
  vi.clearAllMocks();
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

    expect(registered).toEqual({});
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

  it("accepts an 11-character Cyrillic password, which is 22 bytes", async () => {
    confirmPasswordReset.mockResolvedValue(undefined);

    const result = await confirmPasswordResetAction({
      email: "op@example.test",
      code: "123456",
      newPassword: "паролькудли",
    });

    expect(result).toEqual({ done: true });
    expect(confirmPasswordReset).toHaveBeenCalled();
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

  it("reports a lost binding with the reset flow's own code, not sign-in's", async () => {
    readPasswordResetBinding.mockResolvedValue(undefined);

    const result = await confirmPasswordResetAction({
      email: "op@example.test",
      code: "123456",
      newPassword: "a-long-enough-password",
    });

    // Not `otp_session_mismatch`: its copy returns the user to sign-in, which
    // is not where someone mid-reset is trying to go.
    expect(result).toEqual({ error: "password_reset_session_mismatch" });
    expect(confirmPasswordReset).not.toHaveBeenCalled();
  });

  it("refuses when the bound address is not the one being confirmed", async () => {
    readPasswordResetBinding.mockResolvedValue({ nonce: "n", email: "someone-else@example.test" });

    const result = await confirmPasswordResetAction({
      email: "op@example.test",
      code: "123456",
      newPassword: "a-long-enough-password",
    });

    expect(result).toEqual({ error: "password_reset_session_mismatch" });
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
  });

  it("clears the binding when the backend reports a session mismatch", async () => {
    confirmPasswordReset.mockRejectedValueOnce(
      backendError(401, '{"code":"otp_session_mismatch","message":"authentication failed"}'),
    );

    const result = await confirmPasswordResetAction({
      email: "op@example.test",
      code: "123456",
      newPassword: "a-long-enough-password",
    });

    expect(result).toEqual({ error: "password_reset_session_mismatch" });
    expect(clearPasswordResetBinding).toHaveBeenCalled();
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
  it("clears only the reset binding", async () => {
    await abandonPasswordResetAction();

    expect(clearPasswordResetBinding).toHaveBeenCalledTimes(1);
  });
});
