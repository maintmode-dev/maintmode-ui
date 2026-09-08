"use server";

import { redirect } from "next/navigation";

import { parseMaintmodeAuthConfig } from "@/shared/config/auth-config";
import { signIn } from "@/server/auth/auth-config";
import { AUTH_ERROR_CODES, type AuthErrorCode } from "@/server/auth/contracts";
import { clearOAuthNext, readOAuthNext, setOAuthNext } from "@/server/auth/oauth-next-cookie";
import { safeNext } from "@/server/auth/safe-next";

/**
 * Server actions for the backend-driven OAuth dance (RUK-292).
 *
 * Actions rather than route handlers for the reason the built-in sign-in states:
 * no route in this app writes a cookie, and Next.js refuses `cookies().set()`
 * during a page render — so the destination cookie and the sign-in call both
 * have to live here.
 */

/**
 * Sends the browser to the backend to begin the dance.
 *
 * Everything OAuth now happens on the backend: it mints the state and the PKCE
 * verifier, holds the client secret, and talks to the provider. This app's whole
 * part is one redirect.
 *
 * The destination is stashed first, because it cannot survive the round trip any
 * other way (see `oauth-next-cookie.ts`). It is sanitized here as well as inside
 * the cookie module: this is an exported server action, so it is invocable by
 * action id with an attacker-chosen argument, and defense on an auth boundary
 * must not depend on every caller having sanitized first.
 *
 * No branch on `providerId`. The login page renders a submitting form only for
 * providers it has enabled, and the backend checks the segment against its own
 * registry before minting anything, so a second gate here would be a third
 * opinion about the same question.
 */
export async function startOAuthDanceAction(providerId: string, next?: string): Promise<void> {
  await setOAuthNext(next ? safeNext(next) : "/");

  const { authPublicBaseUrl } = parseMaintmodeAuthConfig(process.env);

  // `authPublicBaseUrl`, never `authApiBaseUrl`: this is a BROWSER navigation.
  // The API base is server-to-server and resolves to a container name in two of
  // the three shipped deployments, where it would produce a dead button.
  redirect(`${authPublicBaseUrl}/api/v1/login/oauth/${encodeURIComponent(providerId)}/start`);
}

/** A `redirect()` in flight, which Next signals by throwing. */
function isNextRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

/**
 * Maps the backend's redirect error code to one this app already renders.
 *
 * The backend's set is closed and owned by it: `access_denied`, `state_invalid`,
 * `provider_error`, `internal_error`. Three of them collapse onto one message
 * because the user's action is identical in all three — try again — and the
 * detail that distinguishes them lives in the backend's audit trail, where it
 * was put deliberately.
 *
 * `access_denied` is the one that earns a different message, because it is the
 * one where retrying does not help. It covers three backend causes: signup
 * closed, a blocked user, and a consent screen the user cancelled. Telling all
 * three to ask for an invitation is wrong for the last two and right for the
 * first — and the first is the only one where the user cannot act without being
 * told. A blocked user being sent to an admin is a tolerable second-best; the
 * message must not say more than that, since whether an account is blocked is
 * not a fact to volunteer to whoever holds the browser.
 *
 * An unknown code from a newer backend maps to the generic failure rather than
 * rendering blank.
 */
function mapDanceError(code: string): AuthErrorCode {
  return code === "access_denied" ? AUTH_ERROR_CODES.signupDisabled : AUTH_ERROR_CODES.oauthHandoffFailed;
}

/**
 * Completes the dance: trades the one-time code for a session.
 *
 * The cookie is cleared FIRST, its value captured into a local, so that "cleared
 * on every exit" is true by construction rather than in five branches that each
 * had to remember. The backend applies the same ordering to its own dance
 * cookies for the same reason.
 *
 * `signIn` does not build the `?code=` redirect itself — NextAuth's server-action
 * path rethrows instead, and the SUCCESS path also arrives as a throw
 * (`NEXT_REDIRECT`). So the happy path is rethrown untouched and everything else
 * is read structurally and redirected here. Reading `.code` structurally rather
 * than via `instanceof AuthError` keeps the `next-auth` runtime out of every
 * consumer of this module, matching `built-in-sign-in-actions.ts`.
 */
export async function completeOAuthDanceAction(formData: FormData): Promise<void> {
  const destination = await readOAuthNext();
  await clearOAuthNext();

  const providerError = String(formData.get("error") ?? "").trim();
  if (providerError) {
    redirect(`/login?code=${encodeURIComponent(mapDanceError(providerError))}`);
  }

  const code = String(formData.get("code") ?? "").trim();
  if (!code) {
    // Someone opened the receiver directly, or the backend redirected with
    // neither parameter. Nothing to redeem.
    redirect(`/login?code=${encodeURIComponent(AUTH_ERROR_CODES.oauthHandoffFailed)}`);
  }

  try {
    await signIn("oauth-dance", { code, redirectTo: destination });
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }
    redirect(`/login?code=${encodeURIComponent(failureCode(error))}`);
  }

  // `signIn` normally leaves by throwing — a redirect on success, a
  // `CredentialsSignin` on failure — but it has a path that simply returns:
  // NextAuth builds its redirect from a `Location` header its own source calls
  // possibly-unset ("if for some unexpected reason the responseUrl is not set").
  //
  // Falling off the end there would leave the browser on this document forever,
  // showing "Signing you in…" under a disabled button, with the one-time code
  // already spent so a reload cannot recover. Never end without leaving: the
  // destination is already sanitized, and if no session was established the auth
  // gate sends the user to /login rather than nowhere.
  redirect(destination);
}

/**
 * The failure code to show, taken from the thrown error only when it is one this
 * app defines.
 *
 * An unknown error's `.code` is not ours to forward: a dead backend throws
 * `ECONNREFUSED`, an aborted fetch throws `ABORT_ERR`, and either would land in
 * the user's address bar, in their bug report and in the access log while
 * rendering the same generic message as the honest code. `built-in-sign-in-actions`
 * matches against known constants for the same reason.
 */
function failureCode(error: unknown): AuthErrorCode {
  const raw =
    typeof (error as { code?: unknown } | null)?.code === "string" ? (error as { code: string }).code : "";
  return (Object.values(AUTH_ERROR_CODES) as string[]).includes(raw)
    ? (raw as AuthErrorCode)
    : AUTH_ERROR_CODES.oauthHandoffFailed;
}
