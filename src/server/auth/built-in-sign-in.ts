import "server-only";

import { fetchBackendMe, loginWithPassword, verifyOtpCode } from "@/server/auth/backend-token-exchange";
import { clearOtpBinding, readOtpBinding } from "@/server/auth/otp-nonce-cookie";
import {
  AUTH_ERROR_CODES,
  BackendAuthError,
  type AuthSessionUser,
  type BackendTokenPair,
} from "@/server/auth/contracts";

/**
 * Built-in sign-in exchange — email OTP and email+password (RUK-288).
 *
 * Counterpart of `runBackendExchange`, and split the same way: the credential
 * exchange and the profile load are caught separately so a failure is
 * attributed to the stage that actually failed rather than mislabeled.
 *
 * The OTP branch reads the browser binding from our own httpOnly cookie — the
 * backend sets none — and clears it on every terminal outcome EXCEPT a wrong
 * code, which must keep the user's remaining attempts alive.
 */
export async function runBuiltInSignIn(
  account: { maintmodeTokens?: BackendTokenPair; maintmodeUser?: AuthSessionUser },
  user: { signInKind?: "otp" | "password"; email?: string | null; otpCode?: string; password?: string },
): Promise<true> {
  const email = typeof user.email === "string" ? user.email : "";
  let tokens: BackendTokenPair;

  if (user.signInKind === "otp") {
    const binding = await readOtpBinding();

    // No binding, a corrupted one, or one issued for a different address: this
    // browser cannot check this code. Surfaced as its own error — NOT as a
    // wrong code — because the user may well be holding a perfectly good code
    // and would otherwise have no idea why it keeps failing. The cookie is
    // cleared so the next attempt starts from a clean step one.
    if (!binding || binding.email !== email) {
      await clearOtpBinding();
      throw new BuiltInSignInError(AUTH_ERROR_CODES.otpSessionMismatch);
    }

    try {
      tokens = await verifyOtpCode({ email, code: user.otpCode ?? "", sessionNonce: binding.nonce });
    } catch (error) {
      // The backend checks the nonce before the code, so it can also report a
      // mismatch we could not detect locally (a nonce this browser holds but the
      // backend has since retired).
      if (backendErrorCode(error) === "otp_session_mismatch") {
        await clearOtpBinding();
        throw new BuiltInSignInError(AUTH_ERROR_CODES.otpSessionMismatch);
      }
      // Wrong, expired, or attempts exhausted — one uniform answer, and the
      // binding survives so the remaining attempts stay usable.
      throw new BuiltInSignInError(AUTH_ERROR_CODES.otpVerificationFailed);
    }

    // Single-use: a verified code must not be replayable.
    await clearOtpBinding();
  } else {
    try {
      tokens = await loginWithPassword({ email, password: user.password ?? "" });
    } catch {
      // The backend answers every password failure with one uniform 401 —
      // wrong password, blocked, signup refused, seats exhausted — precisely so
      // the response cannot enumerate accounts. We keep that property.
      throw new BuiltInSignInError(AUTH_ERROR_CODES.invalidCredentials);
    }
  }

  try {
    const me = await fetchBackendMe(tokens.access_token);
    account.maintmodeTokens = tokens;
    account.maintmodeUser = {
      id: me.id,
      email: me.email,
      displayName: me.display_name,
      roles: me.roles,
    };
    return true;
  } catch {
    // Credentials were accepted but loading the profile did not: the one
    // genuine identity-lookup failure.
    throw new BuiltInSignInError(AUTH_ERROR_CODES.identityLookupFailed);
  }
}

/** Reads the backend's `code` out of a failed request, if it sent one. */
function backendErrorCode(error: unknown): string | undefined {
  if (!(error instanceof BackendAuthError)) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(error.responseBody);
    const code = (parsed as { code?: unknown } | null)?.code;
    return typeof code === "string" ? code : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Thrown to hand a stable code to `/login`. Mirrors `BackendExchangeError` in
 * `auth-config.ts`, which extends NextAuth's `CredentialsSignin`; this module
 * deliberately does not import NextAuth, so the callback rewraps what it gets.
 */
export class BuiltInSignInError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "BuiltInSignInError";
  }
}
