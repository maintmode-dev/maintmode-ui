"use server";

import { signIn } from "@/server/auth/auth-config";
import { requestOtpCode } from "@/server/auth/backend-token-exchange";
import { clearOtpBinding, setOtpBinding } from "@/server/auth/otp-nonce-cookie";
import { AUTH_ERROR_CODES } from "@/server/auth/contracts";
import { safeNext } from "@/server/auth/safe-next";

/**
 * Server actions behind the built-in sign-in methods (RUK-288).
 *
 * These are actions rather than BFF routes for two reasons. No route in this
 * app writes a cookie — the public `accept-invite` page sets its own via
 * `cookies()`, which is the established pattern — and NextAuth's `signIn` must
 * be called from the server so it attaches the CSRF token itself; a bare POST
 * to the callback endpoint fails with `MissingCSRF`.
 */

/** A `redirect()` in flight, which Next signals by throwing. */
function isNextRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export interface SignInActionResult {
  /** An `AUTH_ERROR_CODES` value the client renders in place, or undefined on success. */
  error?: string;
}

/**
 * Step one: ask the backend to mail a code, and bind it to this browser.
 *
 * The backend answers 202 for every outcome — including an address with no
 * account — so this reports success identically in all of them. Anything else
 * would tell a stranger which addresses are registered.
 */
export async function requestOtpAction(email: string): Promise<SignInActionResult> {
  const trimmed = email.trim();
  if (!trimmed) {
    return { error: "invalid_email" };
  }

  try {
    const { session_nonce: nonce } = await requestOtpCode(trimmed);
    // The binding lives in an httpOnly cookie on our origin. The backend sets
    // none: it is called server-to-server, so its own Set-Cookie would never
    // reach the user's browser.
    await setOtpBinding({ nonce, email: trimmed });
    return {};
  } catch (error) {
    // A 429 and a dead network need different copy: telling someone to "wait a
    // moment" when the service is unreachable sends them into a pointless
    // retry loop. Neither may imply anything about the address.
    const status = (error as { status?: number } | null)?.status;
    return { error: status === 429 ? "otp_rate_limited" : "otp_request_failed" };
  }
}

/**
 * Step two, and the password form: establish the session.
 *
 * Both failure kinds arrive here as one thrown `CredentialsSignin` — NextAuth's
 * server-action path rethrows rather than building a `?code=` redirect — so the
 * split between them is made here, not by NextAuth:
 *
 * - a lost binding leaves step two entirely, because the flow is genuinely over
 *   and re-rendering the code input would invite the user to retype a code that
 *   can no longer be checked;
 * - everything else renders in place, preserving the countdown and the
 *   remaining attempts, which a redirect would discard.
 */
export async function credentialsSignInAction(
  input:
    | { kind: "otp"; email: string; code: string; next?: string }
    | { kind: "password"; email: string; password: string; next?: string },
): Promise<SignInActionResult> {
  // `safeNext`, not an ad-hoc `startsWith("/")`: this is an exported server
  // action, so it is invocable by action id with an attacker-chosen `next`, and
  // a bare slash check accepts protocol-relative `//evil.test`. Defense in depth
  // on an auth boundary must not depend on every caller having sanitized first.
  const redirectTo = input.next ? safeNext(input.next) : "/";

  try {
    await signIn("backend-login", {
      kind: input.kind,
      email: input.email,
      code: input.kind === "otp" ? input.code : "",
      password: input.kind === "password" ? input.password : "",
      redirectTo,
    });
    return {};
  } catch (error) {
    // A successful sign-in redirects by THROWING (NEXT_REDIRECT), so the happy
    // path arrives in this catch too and must be rethrown. Detected by digest
    // rather than by importing `next/dist/**`: that internal path is unstable
    // across Next releases and nothing else in this repo depends on it.
    if (isNextRedirect(error)) {
      throw error;
    }

    // Read structurally rather than via `instanceof AuthError`: importing
    // `next-auth` here would pull its runtime into every consumer of this
    // module, and the only thing needed is the code the callback attached.
    const code =
      typeof (error as { code?: unknown } | null)?.code === "string" ? (error as { code: string }).code : "";

    if (code === AUTH_ERROR_CODES.otpSessionMismatch) {
      await clearOtpBinding();
      return { error: AUTH_ERROR_CODES.otpSessionMismatch };
    }
    if (code === AUTH_ERROR_CODES.identityLookupFailed) {
      return { error: AUTH_ERROR_CODES.identityLookupFailed };
    }
    if (input.kind === "password") {
      return { error: AUTH_ERROR_CODES.invalidCredentials };
    }
    return { error: AUTH_ERROR_CODES.otpVerificationFailed };
  }
}

/** Abandons the current OTP flow so the user can start over with another address. */
export async function changeEmailAction(): Promise<void> {
  await clearOtpBinding();
}
