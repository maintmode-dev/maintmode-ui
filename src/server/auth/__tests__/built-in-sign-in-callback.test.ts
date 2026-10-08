import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RUK-288 AC-3a / AC-4 / AC-7 — the sign-in callback's own decisions.
 *
 * This is the authoritative half of the ticket. The client only renders what
 * this callback hands it, so testing the rendering alone leaves the actual
 * decision — is this a lost binding or a wrong code? — unguarded. Every case
 * below was mutation-checked: breaking the behaviour it names makes it fail.
 */

const verifyOtpCode = vi.fn();
const loginWithPassword = vi.fn();
const acceptInvitationWithPassword = vi.fn();
const loginWithBreakGlass = vi.fn();
const fetchBackendMe = vi.fn();
const readOtpBinding = vi.fn();
const clearOtpBinding = vi.fn();
const clearAllBindings = vi.fn();
const recordRefusedCode = vi.fn();

vi.mock("@/server/auth/backend-token-exchange", () => ({
  verifyOtpCode: (...args: unknown[]) => verifyOtpCode(...args),
  loginWithPassword: (...args: unknown[]) => loginWithPassword(...args),
  acceptInvitationWithPassword: (...args: unknown[]) => acceptInvitationWithPassword(...args),
  loginWithBreakGlass: (...args: unknown[]) => loginWithBreakGlass(...args),
  fetchBackendMe: (...args: unknown[]) => fetchBackendMe(...args),
  exchangeGoogleIdToken: vi.fn(),
  refreshBackendToken: vi.fn(),
}));

vi.mock("@/server/auth/otp-nonce-cookie", () => ({
  readOtpBinding: () => readOtpBinding(),
  clearOtpBinding: () => clearOtpBinding(),
  clearAllBindings: () => clearAllBindings(),
  recordRefusedCode: (...args: unknown[]) => recordRefusedCode(...args),
  setOtpBinding: vi.fn(),
  // The real implementation: normalization is part of the behaviour under test,
  // so stubbing it would hide the case-variant bug this file now covers.
  normalizeEmail: (email: string) => email.trim().toLowerCase(),
}));

const { runBuiltInSignIn } = await import("@/server/auth/built-in-sign-in");
const { AUTH_ERROR_CODES, BackendAuthError } = await import("@/server/auth/contracts");

type Account = { provider: string; maintmodeTokens?: unknown; maintmodeUser?: unknown };

function callSignIn(account: Account, user: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return runBuiltInSignIn(account as any, user as any);
}

const TOKENS = { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 };
const ME = { id: "u-1", email: "someone@example.test", display_name: "Someone", roles: ["viewer"] };

const OTP_USER = {
  signInKind: "otp",
  email: "someone@example.test",
  otpCode: "123456",
};

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  return promise.then(
    () => undefined,
    (error: unknown) => (error as { code?: string }).code,
  );
}

beforeEach(() => {
  verifyOtpCode.mockReset();
  loginWithPassword.mockReset();
  acceptInvitationWithPassword.mockReset();
  loginWithBreakGlass.mockReset();
  fetchBackendMe.mockReset();
  readOtpBinding.mockReset();
  clearOtpBinding.mockReset();
  clearAllBindings.mockReset();
  recordRefusedCode.mockReset();
});

/**
 * BUG-2 (v0.2.0-rc). The backend withdrew its distinct `otp_session_mismatch`:
 * telling a lost binding apart from a wrong code revealed whether an account
 * exists. Every verify failure is now one answer, and the local binding check
 * must answer with it too — a distinct code from this side would be a second
 * copy of the signal the backend removed.
 */
describe("BUG-2 — every verify failure is one answer", () => {
  it("reports the uniform failure when this browser holds no binding at all", async () => {
    readOtpBinding.mockResolvedValue(undefined);

    const code = await codeOf(callSignIn({ provider: "backend-login" }, OTP_USER));

    expect(code).toBe(AUTH_ERROR_CODES.otpVerificationFailed);
    // Never reaches the backend: there is nothing to verify against.
    expect(verifyOtpCode).not.toHaveBeenCalled();
  });

  it("accepts a case variant of the bound address instead of destroying the code", async () => {
    // Password managers and autofill routinely normalize case, so someone who
    // typed `User@…` at step one may well submit `user@…` at step two. Treating
    // that as a different address would clear the cookie and throw away a
    // perfectly valid code — the binding locking out the user it protects.
    readOtpBinding.mockResolvedValue({ nonce: "n-1", email: "someone@example.test" });
    verifyOtpCode.mockResolvedValue(TOKENS);
    fetchBackendMe.mockResolvedValue(ME);

    await expect(
      callSignIn({ provider: "backend-login" }, { ...OTP_USER, email: "  SoMeOne@Example.TEST " }),
    ).resolves.toBe(true);

    // ...and the address sent to the backend is the BOUND one, so step two
    // cannot be pointed at a different address by construction.
    expect(verifyOtpCode).toHaveBeenCalledWith({
      email: "someone@example.test",
      code: "123456",
      sessionNonce: "n-1",
    });
  });

  it("refuses a binding issued for a different address, with the same answer", async () => {
    // The only thing stopping a nonce issued for one address being spent on
    // another. Without it the binding binds nothing.
    readOtpBinding.mockResolvedValue({ nonce: "n-1", email: "someone-else@example.test" });

    const code = await codeOf(callSignIn({ provider: "backend-login" }, OTP_USER));

    expect(code).toBe(AUTH_ERROR_CODES.otpVerificationFailed);
    expect(verifyOtpCode).not.toHaveBeenCalled();
  });

  it("answers uniformly even if an older backend still names a mismatch", async () => {
    // A backend deployed before the contract change still sends the withdrawn
    // code. Surfacing it would keep the account-existence signal alive on
    // exactly the instances that have not upgraded.
    readOtpBinding.mockResolvedValue({ nonce: "n-stale", email: "someone@example.test" });
    verifyOtpCode.mockRejectedValue(
      new BackendAuthError(401, JSON.stringify({ code: "otp_session_mismatch" })),
    );

    const code = await codeOf(callSignIn({ provider: "backend-login" }, OTP_USER));

    expect(code).toBe(AUTH_ERROR_CODES.otpVerificationFailed);
  });

  it("reports a wrong code as a wrong code, and keeps the binding alive", async () => {
    readOtpBinding.mockResolvedValue({ nonce: "n-1", email: "someone@example.test" });
    verifyOtpCode.mockRejectedValue(new BackendAuthError(401, JSON.stringify({ code: "unauthorized" })));

    const code = await codeOf(callSignIn({ provider: "backend-login" }, OTP_USER));

    expect(code).toBe(AUTH_ERROR_CODES.otpVerificationFailed);
    // The user has five attempts per code; clearing the cookie here would spend
    // the rest of them for no reason. The refusal is counted in it instead, so
    // a burnt code stays recognisable after a reload.
    expect(clearOtpBinding).not.toHaveBeenCalled();
    expect(recordRefusedCode).toHaveBeenCalledWith("sign-in");
  });
});

describe("AC-4 — the binding is cleared exactly when the flow is over", () => {
  it("clears it when the binding is unusable, so the retry starts clean", async () => {
    readOtpBinding.mockResolvedValue(undefined);

    await codeOf(callSignIn({ provider: "backend-login" }, OTP_USER));

    expect(clearOtpBinding).toHaveBeenCalled();
  });

  it("clears every binding after a successful verify so a code cannot be replayed", async () => {
    // The backend keeps one code for sign-in and reset: the reset flow may be
    // bound to the code just spent.
    readOtpBinding.mockResolvedValue({ nonce: "n-1", email: "someone@example.test" });
    verifyOtpCode.mockResolvedValue(TOKENS);
    fetchBackendMe.mockResolvedValue(ME);

    await callSignIn({ provider: "backend-login" }, OTP_USER);

    expect(clearAllBindings).toHaveBeenCalledTimes(1);
    expect(recordRefusedCode).not.toHaveBeenCalled();
  });
});

describe("AC-3a — a verified code establishes the session", () => {
  it("sends the code with the nonce this browser holds", async () => {
    readOtpBinding.mockResolvedValue({ nonce: "n-42", email: "someone@example.test" });
    verifyOtpCode.mockResolvedValue(TOKENS);
    fetchBackendMe.mockResolvedValue(ME);

    await callSignIn({ provider: "backend-login" }, OTP_USER);

    expect(verifyOtpCode).toHaveBeenCalledWith({
      email: "someone@example.test",
      code: "123456",
      sessionNonce: "n-42",
    });
  });

  it("attaches the token pair and profile to the account, and returns true", async () => {
    const account: Account = { provider: "backend-login" };
    readOtpBinding.mockResolvedValue({ nonce: "n-1", email: "someone@example.test" });
    verifyOtpCode.mockResolvedValue(TOKENS);
    fetchBackendMe.mockResolvedValue(ME);

    await expect(callSignIn(account, OTP_USER)).resolves.toBe(true);

    expect(account.maintmodeTokens).toEqual(TOKENS);
    expect(account.maintmodeUser).toEqual({
      id: "u-1",
      email: "someone@example.test",
      displayName: "Someone",
      roles: ["viewer"],
    });
  });

  it("signs in with a password and attaches the same shape", async () => {
    const account: Account = { provider: "backend-login" };
    loginWithPassword.mockResolvedValue(TOKENS);
    fetchBackendMe.mockResolvedValue(ME);

    await expect(
      callSignIn(account, { signInKind: "password", email: "admin@example.test", password: "pw" }),
    ).resolves.toBe(true);

    expect(loginWithPassword).toHaveBeenCalledWith({ email: "admin@example.test", password: "pw" });
    expect(account.maintmodeTokens).toEqual(TOKENS);
    // A password sign-in must never touch the OTP binding.
    expect(readOtpBinding).not.toHaveBeenCalled();
  });
});

describe("failures are attributed to the stage that actually failed", () => {
  it("calls a password failure invalid credentials, naming no field", async () => {
    loginWithPassword.mockRejectedValue(new BackendAuthError(401, JSON.stringify({ code: "unauthorized" })));

    const code = await codeOf(
      callSignIn(
        { provider: "backend-login" },
        { signInKind: "password", email: "admin@example.test", password: "wrong" },
      ),
    );

    expect(code).toBe(AUTH_ERROR_CODES.invalidCredentials);
  });

  // The backend now limits /login/password per address as well as per IP, and
  // counts it before any account lookup, so a 429 enumerates nothing.
  it("calls a rate-limited password sign-in rate limited, not wrong", async () => {
    loginWithPassword.mockRejectedValue(
      new BackendAuthError(429, JSON.stringify({ code: "too many requests" })),
    );

    const code = await codeOf(
      callSignIn(
        { provider: "backend-login" },
        { signInKind: "password", email: "admin@example.test", password: "right" },
      ),
    );

    expect(code).toBe(AUTH_ERROR_CODES.otpRateLimited);
  });

  it("distinguishes a profile-load failure from a credential failure", async () => {
    // Collapsing these once mislabeled every exchange-stage failure; the split
    // try/catch exists to keep them apart.
    readOtpBinding.mockResolvedValue({ nonce: "n-1", email: "someone@example.test" });
    verifyOtpCode.mockResolvedValue(TOKENS);
    fetchBackendMe.mockRejectedValue(new Error("me exploded"));

    const code = await codeOf(callSignIn({ provider: "backend-login" }, OTP_USER));

    expect(code).toBe(AUTH_ERROR_CODES.identityLookupFailed);
    expect(code).not.toBe(AUTH_ERROR_CODES.otpVerificationFailed);
  });
});

/**
 * Accepting an invitation by setting a password. Each refusal is told apart,
 * because each asks the person for something different — and none of them
 * enumerates anything: the caller holds the invitation, which names the address.
 *
 * NOTE: the envelopes below follow the contract the backend announced for
 * `POST /api/v1/users/invitations/accept/password`; they are not yet recorded
 * from the wire. The recorded fixture and its contract test land once the
 * endpoint is on the local stand.
 */
describe("accepting an invitation with a password", () => {
  const INVITE_USER = { signInKind: "invite", invitationToken: "tok-1", password: "correct horse battery" };
  const refusal = (status: number, body: unknown) => new BackendAuthError(status, JSON.stringify(body));

  it("sends the token and password, and signs in with the pair it gets back", async () => {
    acceptInvitationWithPassword.mockResolvedValue(TOKENS);
    fetchBackendMe.mockResolvedValue(ME);
    const account: Account = { provider: "backend-login" };

    await expect(callSignIn(account, INVITE_USER)).resolves.toBe(true);

    expect(acceptInvitationWithPassword).toHaveBeenCalledWith({
      invitationToken: "tok-1",
      password: "correct horse battery",
    });
    expect(loginWithPassword).not.toHaveBeenCalled();
    expect(account.maintmodeTokens).toEqual(TOKENS);
  });

  it.each([
    ["an unusable invitation", refusal(400, { code: "invalid" }), "invitation_invalid"],
    [
      "a password outside the policy",
      refusal(400, { code: "invalid request", message: "x" }),
      "password_policy_violation",
    ],
    ["password sign-in switched off", refusal(403, { code: "method_disabled" }), "method_disabled"],
    ["no free seat", refusal(403, { code: "seats_limit_exceeded" }), "seats_limit_exceeded"],
    ["an existing account", refusal(409, { code: "conflict" }), "account_exists"],
    ["the rate limiter", refusal(429, ""), "invite_rate_limited"],
    ["a 403 with no known code", refusal(403, { code: "something_new" }), "invite_accept_failed"],
    ["a server error", refusal(502, "bad gateway"), "invite_accept_failed"],
    ["a transport failure", new Error("ECONNREFUSED"), "invite_accept_failed"],
  ])("maps %s to its own code", async (_label, error, expected) => {
    acceptInvitationWithPassword.mockRejectedValue(error);

    expect(await codeOf(callSignIn({ provider: "backend-login" }, INVITE_USER))).toBe(expected);
    expect(fetchBackendMe).not.toHaveBeenCalled();
  });
});

/**
 * Break-glass signs in by password alone on its own endpoint; `/login/password`
 * no longer accepts the break-glass password.
 */
describe("break-glass sign-in", () => {
  const BREAK_GLASS = { signInKind: "break-glass", password: "correct horse battery staple" };

  it("signs in through the break-glass endpoint with the password only", async () => {
    loginWithBreakGlass.mockResolvedValue(TOKENS);
    fetchBackendMe.mockResolvedValue(ME);
    const account: Account = { provider: "backend-login" };

    await expect(callSignIn(account, BREAK_GLASS)).resolves.toBe(true);

    expect(loginWithBreakGlass).toHaveBeenCalledWith("correct horse battery staple");
    expect(loginWithPassword).not.toHaveBeenCalled();
    expect(account.maintmodeTokens).toEqual(TOKENS);
  });

  it.each([
    ["the uniform 401", new BackendAuthError(401, JSON.stringify({ code: "unauthorized" }))],
    ["the rate limiter", new BackendAuthError(429, "")],
    ["a transport failure", new Error("ECONNREFUSED")],
  ])("answers %s with the one uniform failure", async (_label, error) => {
    loginWithBreakGlass.mockRejectedValue(error);

    expect(await codeOf(callSignIn({ provider: "backend-login" }, BREAK_GLASS))).toBe(
      AUTH_ERROR_CODES.invalidCredentials,
    );
  });
});
