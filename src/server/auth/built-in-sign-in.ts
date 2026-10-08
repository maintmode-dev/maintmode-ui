import "server-only";

import {
  acceptInvitationWithPassword,
  fetchBackendMe,
  loginWithBreakGlass,
  loginWithPassword,
  verifyOtpCode,
} from "@/server/auth/backend-token-exchange";
import {
  clearAllBindings,
  clearOtpBinding,
  normalizeEmail,
  readOtpBinding,
  recordRefusedCode,
} from "@/server/auth/otp-nonce-cookie";
import {
  AUTH_ERROR_CODES,
  BackendAuthError,
  type AuthErrorCode,
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
  user: {
    signInKind?: "otp" | "password" | "invite" | "break-glass";
    email?: string | null;
    otpCode?: string;
    password?: string;
    invitationToken?: string;
  },
): Promise<true> {
  const email = normalizeEmail(typeof user.email === "string" ? user.email : "");
  let tokens: BackendTokenPair;

  if (user.signInKind === "otp") {
    const binding = await readOtpBinding();

    // No binding, a corrupted one, or one issued for a different address: this
    // browser cannot check this code, and nothing is sent. Reported as the SAME
    // uniform failure as the backend's 401, not as its own error: the backend
    // dropped its distinct `otp_session_mismatch` because telling a lost binding
    // apart from a wrong code revealed whether an account exists (BUG-2), and a
    // distinct answer here would be a second copy of that signal. The copy for
    // the uniform failure already says "or request a new one", and the client's
    // attempt budget returns the user to step one.
    if (!binding || binding.email !== email) {
      await clearOtpBinding();
      throw new BuiltInSignInError(AUTH_ERROR_CODES.otpVerificationFailed);
    }

    try {
      // The BOUND address, not the one just submitted. The two are equal by the
      // check above, and sending the bound one makes "step two cannot be
      // pointed at a different address" true by construction rather than by a
      // comparison someone could later weaken.
      tokens = await verifyOtpCode({
        email: binding.email,
        code: user.otpCode ?? "",
        sessionNonce: binding.nonce,
      });
    } catch (error) {
      // A 429 is not a verdict on the code. Telling someone to re-check a
      // correct code drives more requests into the limiter already refusing
      // them — the same misattributed-failure loop this ticket exists to end.
      if ((error as { status?: number } | null)?.status === 429) {
        throw new BuiltInSignInError(AUTH_ERROR_CODES.otpRateLimited);
      }
      // Wrong, expired, attempts exhausted, or a nonce the backend does not
      // recognise — one uniform 401 by contract, and the binding survives so
      // any remaining attempts stay usable. Counted in the binding, so a burnt
      // code stays recognisable after a reload (`bindWithinReissueCooldown`).
      await recordRefusedCode("sign-in");
      throw new BuiltInSignInError(AUTH_ERROR_CODES.otpVerificationFailed);
    }

    // Single-use: a verified code must not be replayable — and the backend's
    // one code may be bound by the reset flow too.
    await clearAllBindings();
  } else if (user.signInKind === "invite") {
    try {
      tokens = await acceptInvitationWithPassword({
        invitationToken: user.invitationToken ?? "",
        password: user.password ?? "",
      });
    } catch (error) {
      throw new BuiltInSignInError(inviteAcceptFailureCode(error));
    }
  } else if (user.signInKind === "break-glass") {
    try {
      tokens = await loginWithBreakGlass(user.password ?? "");
    } catch {
      // One uniform 401 by contract, and one answer here: whether this instance
      // has an emergency entrance at all must stay unknowable from outside.
      throw new BuiltInSignInError(AUTH_ERROR_CODES.invalidCredentials);
    }
  } else {
    try {
      tokens = await loginWithPassword({ email, password: user.password ?? "" });
    } catch (error) {
      // A 429 is the limiter, not a verdict on the password: told "wrong
      // password", a throttled user retypes a correct one into the limiter that
      // is refusing them. Safe to say: the backend counts the per-address
      // budget before any account lookup, for an address with no account
      // exactly as for one with an account, so the 429 enumerates nothing. The
      // budget is shared with OTP sign-in for that address, hence the shared code.
      if ((error as { status?: number } | null)?.status === 429) {
        throw new BuiltInSignInError(AUTH_ERROR_CODES.otpRateLimited);
      }
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

/**
 * What a refused invitation-with-password means to the person holding it.
 *
 * Read from the status AND the backend's `code`, because two statuses carry
 * more than one answer: a 400 is either the invitation (`invalid`) or the
 * password/body (`invalid request`), and a 403 is either the method being off or
 * the seats being gone. Anything unrecognised — including a status the contract
 * does not list — is the generic failure, never a guess at a specific one.
 */
function inviteAcceptFailureCode(error: unknown): AuthErrorCode {
  if (!(error instanceof BackendAuthError)) return AUTH_ERROR_CODES.inviteAcceptFailed;
  const code = backendErrorCode(error.responseBody);
  switch (error.status) {
    case 400:
      return code === "invalid"
        ? AUTH_ERROR_CODES.invitationInvalid
        : AUTH_ERROR_CODES.passwordPolicyViolation;
    case 403:
      if (code === "method_disabled") return AUTH_ERROR_CODES.signInMethodDisabled;
      if (code === "seats_limit_exceeded") return AUTH_ERROR_CODES.seatsLimitExceeded;
      return AUTH_ERROR_CODES.inviteAcceptFailed;
    case 409:
      return AUTH_ERROR_CODES.accountExists;
    case 429:
      return AUTH_ERROR_CODES.inviteRateLimited;
    default:
      return AUTH_ERROR_CODES.inviteAcceptFailed;
  }
}

/** The `code` field of a backend error envelope, or "" when there is none. */
function backendErrorCode(body: string): string {
  try {
    const parsed = JSON.parse(body) as { code?: unknown };
    return typeof parsed.code === "string" ? parsed.code : "";
  } catch {
    return "";
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
