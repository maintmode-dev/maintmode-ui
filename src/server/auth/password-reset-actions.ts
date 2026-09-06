"use server";

import { signOut } from "@/server/auth/auth-config";
import { confirmPasswordReset, requestPasswordResetCode } from "@/server/auth/backend-token-exchange";
import { AUTH_ERROR_CODES } from "@/server/auth/contracts";
import {
  clearPasswordResetBinding,
  normalizeEmail,
  readPasswordResetBinding,
  setPasswordResetBinding,
} from "@/server/auth/otp-nonce-cookie";
import { clearActiveSession } from "@/server/auth/session-token";
import { isPasswordWithinPolicy } from "@/domain/auth/sign-in-method";

/**
 * Server actions behind the "forgot password" flow (RUK-289).
 *
 * Actions rather than BFF routes for the reason RUK-288 established: these
 * write a cookie, and `/login` sits under `(public)`, which mounts neither
 * React Query nor `sonner` — a `useMutation` there throws at runtime while
 * `tsc` and the unit tests stay green.
 */

export interface PasswordResetActionResult {
  /** An `AUTH_ERROR_CODES` value the client renders in place, or undefined. */
  error?: string;
  /** Set once the password is changed, so the sign-in form can confirm it. */
  done?: boolean;
}

/** A backend failure's HTTP status, when it carried one. */
function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

/** Whether the backend's body named a specific code, without parsing prose. */
function codeIs(error: unknown, code: string): boolean {
  const body = (error as { responseBody?: unknown } | null)?.responseBody;
  return typeof body === "string" && body.includes(`"code":"${code}"`);
}

/**
 * Step one: ask the backend to mail a reset code, and bind it to this browser.
 *
 * The backend answers 202 for every outcome — unknown address, blocked user,
 * even a malformed body — so this reports success identically in all of them.
 * Anything else would turn the screen into an account-existence oracle.
 *
 * What it cannot promise, and the copy must not either: if the user has a live
 * code with attempts left, the backend issues no new one and still answers 202.
 * "We sent a code if that address is registered" stays true; "check your inbox
 * for a new code" would not.
 */
export async function requestPasswordResetAction(email: string): Promise<PasswordResetActionResult> {
  const trimmed = email.trim();
  if (!trimmed) {
    return { error: "invalid_email" };
  }

  try {
    const { session_nonce: nonce } = await requestPasswordResetCode(trimmed);
    await setPasswordResetBinding({ nonce, email: trimmed });
    return {};
  } catch (error) {
    const status = statusOf(error);
    // Logged because the user is shown one uniform state by design, which
    // leaves an operator with nothing to diagnose from. Status only — never the
    // address, which is the thing the uniform answer exists to protect.
    console.error("[password-reset] request failed", { status });

    if (status === 429) {
      return { error: AUTH_ERROR_CODES.otpRateLimited };
    }
    // A dead or missing endpoint is a fact about the service, not about an
    // account, so saying so plainly leaks nothing — and folding it into the
    // anti-enumeration copy would tell every user their input was wrong during
    // an outage.
    return { error: AUTH_ERROR_CODES.passwordResetUnavailable };
  }
}

/**
 * Step two: redeem the code, install the new password, and end the session.
 *
 * The length check runs BEFORE the request and is not optional politeness: the
 * backend hides a policy violation inside the same 401 as a wrong code, so
 * without it a user with a short password is told the code they just typed is
 * wrong. It also spends no attempt, which is why its result must not clear the
 * binding.
 */
export async function confirmPasswordResetAction(args: {
  email: string;
  code: string;
  newPassword: string;
}): Promise<PasswordResetActionResult> {
  if (!isPasswordWithinPolicy(args.newPassword)) {
    return { error: AUTH_ERROR_CODES.passwordPolicyViolation };
  }

  const binding = await readPasswordResetBinding();
  if (!binding || binding.email !== normalizeEmail(args.email)) {
    // No binding means this browser cannot prove it asked for the code, so the
    // request would be refused anyway. Answered locally with the reset flow's
    // own mismatch code — not sign-in's, whose copy sends the user somewhere
    // they are not trying to go.
    await clearPasswordResetBinding();
    return { error: AUTH_ERROR_CODES.passwordResetSessionMismatch };
  }

  try {
    await confirmPasswordReset({
      email: binding.email,
      code: args.code,
      sessionNonce: binding.nonce,
      newPassword: args.newPassword,
    });
  } catch (error) {
    const status = statusOf(error);
    // `hadBinding` is a fact about this browser, not about the account, and it
    // is the one thing separating "the user lost their tab" from "the user
    // mistyped" — invisible in the response by design.
    console.error("[password-reset] confirm failed", { status, hadBinding: true });

    if (status === 429) {
      return { error: AUTH_ERROR_CODES.otpRateLimited };
    }
    if (status === undefined || status >= 500 || status === 404) {
      return { error: AUTH_ERROR_CODES.passwordResetUnavailable };
    }
    if (codeIs(error, "otp_session_mismatch")) {
      await clearPasswordResetBinding();
      return { error: AUTH_ERROR_CODES.passwordResetSessionMismatch };
    }
    // Everything else is the deliberate collapse: wrong code, expired,
    // attempts exhausted. The binding is KEPT — attempts may remain, and
    // discarding a still-usable code is worse than a retry.
    return { error: AUTH_ERROR_CODES.passwordResetFailed };
  }

  // Past this point the password IS changed and every session is revoked. The
  // teardown below can fail; the confirmation cannot be conditional on it.
  await clearPasswordResetBinding();

  try {
    // Without this the NextAuth cookie outlives the backend session: `proxy.ts`
    // still reads a session, `/login` bounces the user to `/`, and every
    // request 401s on a dead token.
    await signOut({ redirect: false });
    await clearActiveSession();
  } catch (error) {
    console.error("[password-reset] post-reset session teardown failed", error);
  }

  return { done: true };
}

/** Abandons the reset flow so the user can start again with another address. */
export async function abandonPasswordResetAction(): Promise<void> {
  await clearPasswordResetBinding();
}
