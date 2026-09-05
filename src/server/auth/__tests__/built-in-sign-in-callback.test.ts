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
const fetchBackendMe = vi.fn();
const readOtpBinding = vi.fn();
const clearOtpBinding = vi.fn();

vi.mock("@/server/auth/backend-token-exchange", () => ({
  verifyOtpCode: (...args: unknown[]) => verifyOtpCode(...args),
  loginWithPassword: (...args: unknown[]) => loginWithPassword(...args),
  fetchBackendMe: (...args: unknown[]) => fetchBackendMe(...args),
  exchangeGoogleIdToken: vi.fn(),
  acceptInvitation: vi.fn(),
  refreshBackendToken: vi.fn(),
}));

vi.mock("@/server/auth/otp-nonce-cookie", () => ({
  readOtpBinding: () => readOtpBinding(),
  clearOtpBinding: () => clearOtpBinding(),
  setOtpBinding: vi.fn(),
  OTP_NONCE_COOKIE: "__Host-mm.otp_nonce",
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
  fetchBackendMe.mockReset();
  readOtpBinding.mockReset();
  clearOtpBinding.mockReset();
});

describe("AC-4 — a lost binding must never be reported as a wrong code", () => {
  it("reports a mismatch when this browser holds no binding at all", async () => {
    readOtpBinding.mockResolvedValue(undefined);

    const code = await codeOf(callSignIn({ provider: "backend-login" }, OTP_USER));

    expect(code).toBe(AUTH_ERROR_CODES.otpSessionMismatch);
    // Never reaches the backend: there is nothing to verify against.
    expect(verifyOtpCode).not.toHaveBeenCalled();
  });

  it("reports a mismatch when the binding belongs to a different address", async () => {
    // The only thing stopping a nonce issued for one address being spent on
    // another. Without it the binding binds nothing.
    readOtpBinding.mockResolvedValue({ nonce: "n-1", email: "someone-else@example.test" });

    const code = await codeOf(callSignIn({ provider: "backend-login" }, OTP_USER));

    expect(code).toBe(AUTH_ERROR_CODES.otpSessionMismatch);
    expect(verifyOtpCode).not.toHaveBeenCalled();
  });

  it("reports a mismatch when the BACKEND says the binding is stale", async () => {
    // The backend checks the nonce before the code, so it can reject a binding
    // this browser still holds. Mapping that to a wrong-code error is precisely
    // the defect RUK-288 exists to remove.
    readOtpBinding.mockResolvedValue({ nonce: "n-stale", email: "someone@example.test" });
    verifyOtpCode.mockRejectedValue(
      new BackendAuthError(401, JSON.stringify({ code: "otp_session_mismatch" })),
    );

    const code = await codeOf(callSignIn({ provider: "backend-login" }, OTP_USER));

    expect(code).toBe(AUTH_ERROR_CODES.otpSessionMismatch);
    expect(code).not.toBe(AUTH_ERROR_CODES.otpVerificationFailed);
  });

  it("reports a wrong code as a wrong code, and keeps the binding alive", async () => {
    readOtpBinding.mockResolvedValue({ nonce: "n-1", email: "someone@example.test" });
    verifyOtpCode.mockRejectedValue(new BackendAuthError(401, JSON.stringify({ code: "unauthorized" })));

    const code = await codeOf(callSignIn({ provider: "backend-login" }, OTP_USER));

    expect(code).toBe(AUTH_ERROR_CODES.otpVerificationFailed);
    // The user has five attempts per code; clearing the cookie here would spend
    // the rest of them for no reason.
    expect(clearOtpBinding).not.toHaveBeenCalled();
  });
});

describe("AC-4 — the binding is cleared exactly when the flow is over", () => {
  it("clears it when the binding is unusable, so the retry starts clean", async () => {
    readOtpBinding.mockResolvedValue(undefined);

    await codeOf(callSignIn({ provider: "backend-login" }, OTP_USER));

    expect(clearOtpBinding).toHaveBeenCalled();
  });

  it("clears it after a successful verify so a code cannot be replayed", async () => {
    readOtpBinding.mockResolvedValue({ nonce: "n-1", email: "someone@example.test" });
    verifyOtpCode.mockResolvedValue(TOKENS);
    fetchBackendMe.mockResolvedValue(ME);

    await callSignIn({ provider: "backend-login" }, OTP_USER);

    expect(clearOtpBinding).toHaveBeenCalledTimes(1);
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
