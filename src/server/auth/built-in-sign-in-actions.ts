"use server";

import { redirect } from "next/navigation";

import { isPasswordWithinPolicy } from "@/domain/auth/sign-in-method";
import { requestOtpCode } from "@/server/auth/backend-token-exchange";
import { bindWithinReissueCooldown, putBindingToSleep, setOtpBinding } from "@/server/auth/otp-nonce-cookie";
import { AUTH_ERROR_CODES } from "@/server/auth/contracts";
import { safeNext } from "@/server/auth/safe-next";
import { signInWithBackendLogin } from "@/server/auth/sign-in";
import { readActiveSession } from "@/server/auth/session-token";

/**
 * Server actions behind the built-in sign-in methods (RUK-288).
 *
 * These are actions rather than BFF routes: the session cookie is written with
 * `cookies()`, which is the established pattern, and Next checks an action's
 * Origin itself, so a cross-site form cannot sign anyone in.
 */

export interface SignInActionResult {
  /** An `AUTH_ERROR_CODES` value the client renders in place, or undefined on success. */
  error?: string;
  /**
   * On a code request: the bound code's deadline (epoch ms), so the countdown
   * shows what is actually left — which is less than a full TTL when the
   * binding was kept rather than replaced.
   */
  expiresAt?: number;
  /** On a kept code: attempts it has already lost (see `ReissueDecision`). */
  refused?: number;
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

  // A code for this address was issued less than the backend's reissue
  // cooldown ago — by this flow or by password reset, which shares the code:
  // the backend would answer 202, send nothing, and hand back a nonce that
  // matches nothing. Stay bound to the code the user has, and do not spend a
  // request on a guaranteed no-op. See `bindWithinReissueCooldown`.
  const decision = await bindWithinReissueCooldown("sign-in", trimmed);
  if (decision?.spent) {
    // Burnt, and holding the backend's slot until it expires: a request now
    // would send nothing. Said plainly, with the time it clears.
    return { error: "otp_attempts_spent", expiresAt: decision.expiresAt };
  }
  if (decision) {
    return decision.refused
      ? { expiresAt: decision.expiresAt, refused: decision.refused }
      : { expiresAt: decision.expiresAt };
  }

  try {
    const { session_nonce: nonce } = await requestOtpCode(trimmed);
    // The binding lives in an httpOnly cookie on our origin. The backend sets
    // none: it is called server-to-server, so its own Set-Cookie would never
    // reach the user's browser.
    const expiresAt = await setOtpBinding({ nonce, email: trimmed });
    return { expiresAt };
  } catch (error) {
    // A 429 and a dead network need different copy: telling someone to "wait a
    // moment" when the service is unreachable sends them into a pointless
    // retry loop. Neither may imply anything about the address.
    const status = (error as { status?: number } | null)?.status;
    return { error: status === 429 ? "otp_requests_rate_limited" : "otp_request_failed" };
  }
}

/**
 * Step two, and the password form: establish the session.
 *
 * Both failure kinds arrive here as one thrown `SignInError`, so the split
 * between them is made here:
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
    await signInWithBackendLogin({
      kind: input.kind,
      email: input.email,
      code: input.kind === "otp" ? input.code : "",
      password: input.kind === "password" ? input.password : "",
    });
  } catch (error) {
    // Read structurally: the code `SignInError` carries, or nothing for an
    // unexpected failure, which maps to the flow's uniform answer below.
    const code =
      typeof (error as { code?: unknown } | null)?.code === "string" ? (error as { code: string }).code : "";

    if (code === AUTH_ERROR_CODES.identityLookupFailed) {
      return { error: AUTH_ERROR_CODES.identityLookupFailed };
    }
    // A 429 is not a verdict on the code, and the flow has copy for it ("wait
    // a moment"). Collapsed into the uniform failure it told a throttled user
    // their code was wrong and spent their local attempt budget.
    // The same holds for a password: retyping a correct one into the limiter
    // only keeps it refusing. Each flow keeps its own name for it.
    if (code === AUTH_ERROR_CODES.otpRateLimited || code === AUTH_ERROR_CODES.rateLimited) {
      return { error: code };
    }
    if (input.kind === "password") {
      return { error: AUTH_ERROR_CODES.invalidCredentials };
    }
    return { error: AUTH_ERROR_CODES.otpVerificationFailed };
  }
  redirect(redirectTo);
}

/**
 * Leaves the code step so the user can use another address. The binding is
 * put to sleep, not deleted: coming back to the same address inside the
 * reissue cooldown must find the one live code (see `putBindingToSleep`).
 */
export async function changeEmailAction(): Promise<void> {
  await putBindingToSleep("sign-in");
}

/**
 * The codes the accept-with-password form knows how to word. Anything else
 * reaching the catch below — a code this path never produces — reads as
 * the generic failure rather than leaking an unworded string to the client.
 */
const INVITE_ACCEPT_ERRORS: ReadonlySet<string> = new Set([
  AUTH_ERROR_CODES.invitationInvalid,
  AUTH_ERROR_CODES.passwordPolicyViolation,
  AUTH_ERROR_CODES.signInMethodDisabled,
  AUTH_ERROR_CODES.seatsLimitExceeded,
  AUTH_ERROR_CODES.accountExists,
  AUTH_ERROR_CODES.inviteRateLimited,
  AUTH_ERROR_CODES.identityLookupFailed,
]);

/**
 * Accepts an invitation by setting a password, and signs the new user in.
 *
 * Refuses outright while a session is live, like `startOAuthDanceAction`:
 * accepting means BECOMING the invited person, and the backend claims the
 * invitation in the same transaction that creates the account — so a click from
 * someone already signed in (an admin checking the link) would spend it on the
 * wrong browser. `readActiveSession()` because an action may write the cookie
 * its refresh rotates; the page uses `readSessionUser()` for the same reason it does there.
 *
 * Exported, so callable by action id with any token — which grants nothing the
 * public backend endpoint does not: the token is the credential either way. The
 * page closes its own token over a wrapper so its form cannot send another.
 *
 * The policy check is a UX guard ahead of the backend's, which re-checks.
 */
export async function acceptInvitationWithPasswordAction(input: {
  invitationToken: string;
  password: string;
}): Promise<SignInActionResult> {
  if (await readActiveSession()) {
    redirect("/");
  }
  if (!input.invitationToken) {
    return { error: AUTH_ERROR_CODES.invitationInvalid };
  }
  if (!isPasswordWithinPolicy(input.password)) {
    return { error: AUTH_ERROR_CODES.passwordPolicyViolation };
  }

  try {
    await signInWithBackendLogin({
      kind: "invite",
      invitation: input.invitationToken,
      password: input.password,
    });
  } catch (error) {
    const code =
      typeof (error as { code?: unknown } | null)?.code === "string" ? (error as { code: string }).code : "";
    return { error: INVITE_ACCEPT_ERRORS.has(code) ? code : AUTH_ERROR_CODES.inviteAcceptFailed };
  }
  redirect("/");
}

/**
 * Break-glass sign-in from `/login/recovery`: the password alone.
 *
 * Its own action rather than another `credentialsSignInAction` kind because it
 * takes neither an email nor a destination — the emergency account is a fixed
 * service identity, and the page is reached by typing its address, never by a
 * redirect with somewhere to return to. Lands on `/`.
 *
 * Every failure is the uniform `invalid_credentials`, matching the backend's
 * single 401: telling "wrong password" from "no break-glass on this instance"
 * would answer, from outside, whether an emergency entrance exists.
 */
export async function breakGlassSignInAction(password: string): Promise<SignInActionResult> {
  if (!password) {
    return { error: AUTH_ERROR_CODES.invalidCredentials };
  }
  try {
    await signInWithBackendLogin({ kind: "break-glass", password });
  } catch (error) {
    // The password WAS accepted when only the profile failed to load — saying
    // it was wrong would send the administrator after the wrong problem.
    const code =
      typeof (error as { code?: unknown } | null)?.code === "string" ? (error as { code: string }).code : "";
    if (code === AUTH_ERROR_CODES.identityLookupFailed) {
      return { error: code };
    }
    return { error: AUTH_ERROR_CODES.invalidCredentials };
  }
  redirect("/");
}
