"use server";

import { redirect } from "next/navigation";

import { parseMaintmodeAuthConfig } from "@/shared/config/auth-config";
import { readActiveSession } from "@/server/auth/session-token";
import { AUTH_ERROR_CODES, type AuthErrorCode } from "@/server/auth/contracts";
import {
  clearOAuthBinding,
  mintOAuthBinding,
  readOAuthBindingProof,
} from "@/server/auth/oauth-binding-cookie";
import { clearOAuthNext, readOAuthNext, setOAuthNext } from "@/server/auth/oauth-next-cookie";
import { completeProviderLink } from "@/server/auth/provider-link";
import { safeNext } from "@/server/auth/safe-next";
import { signInWithDanceCode } from "@/server/auth/sign-in";
import type { LinkFailure } from "@/domain/auth/link-outcome";

/**
 * Server actions for the backend-driven OAuth dance (RUK-292).
 *
 * Actions rather than route handlers for the reason the built-in sign-in states:
 * no route in this app writes a cookie, and Next.js refuses `cookies().set()`
 * during a page render — so the destination cookie and the sign-in call both
 * have to live here.
 */

/**
 * Prepares the browser to begin the dance and answers the backend URL to leave for.
 *
 * Everything OAuth now happens on the backend: it mints the state and the PKCE
 * verifier, holds the client secret, and talks to the provider. This app's whole
 * part is one navigation.
 *
 * RETURNS the `/start` URL rather than calling `redirect()`, and the button
 * (`ProviderButton`) leaves with `window.location.assign`. In self-host and dev
 * the public auth base is this app's own origin plus `/auth`, routed to the
 * backend by the gateway — and Next's router treats a SAME-ORIGIN action
 * redirect as an internal route: a client-side soft navigation that changes the
 * address bar and never sends a request, so the gateway never sees `/start` and
 * the button looks dead. Only a cross-origin target gets Next's hard navigation,
 * and which one this is depends on deployment config. The cookies are still
 * written here, on this action's response, so they are in place before the
 * browser navigates.
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
 *
 * `invitation` carries an invitation token into the dance: the backend resolves
 * it before creating the user, which is the only ordering under which an invited
 * but uncreated person can be created at all. It is appended ONLY when non-empty,
 * so the ordinary sign-in URL is unchanged — `?invitation=` with no value is a
 * different request from no parameter.
 */
export async function startOAuthDanceAction(
  providerId: string,
  next?: string,
  invitation?: string,
): Promise<string> {
  // Refuse before anything else, and unconditionally — not gated on `invitation`.
  //
  // This action is exported, so it is invocable by action id with
  // attacker-chosen arguments; a check living only in a page's render would be
  // exactly the "every caller sanitized first" dependency this module rejects
  // for `next`. Two things are at stake and only this placement covers both: a
  // signed-in browser completing a dance has its identity swapped, and — because
  // the backend claims the invitation in phase 2, INSIDE the dance — the
  // invitation is spent before our receiver ever sees the code.
  //
  // `readActiveSession()`, matching `completeOAuthDanceAction` below: a Server
  // Action may write cookies, so its refresh-and-persist is legitimate here. A
  // page render may not, which is why the page uses `readSessionUser()` instead.
  //
  // `/login`'s caller never reaches this in practice — `proxy.ts` bounces a
  // signed-in user off that path — so this fires for a direct invocation, which
  // is the case it exists for.
  //
  // Still a `redirect()`, unlike the success path: `/` is this app's own route,
  // so the router's soft navigation is exactly right, and the throw means the
  // button never reaches its `assign`.
  if (await readActiveSession()) {
    redirect("/");
  }

  await setOAuthNext(next ? safeNext(next) : "/");
  // The browser binding (M-1 / backend L1): the backend refuses a /start
  // without one, and the code it yields redeems only with this cookie's nonce.
  const binding = await mintOAuthBinding();

  const { authPublicBaseUrl } = parseMaintmodeAuthConfig(process.env);

  // `authPublicBaseUrl`, never `authApiBaseUrl`: this is a BROWSER navigation.
  // The API base is server-to-server and resolves to a container name in two of
  // the three shipped deployments, where it would produce a dead button.
  const base = `${authPublicBaseUrl}/api/v1/login/oauth/${encodeURIComponent(providerId)}/start`;
  const query = new URLSearchParams({ binding });
  const token = invitation?.trim();
  if (token) {
    query.set("invitation", token);
  }

  return `${base}?${query.toString()}`;
}

/**
 * Leaves the receiver for `/login` with a code it renders. Never returns — the
 * `never` return type is what lets the callers below read as terminal exits.
 */
function redirectToLoginError(code: AuthErrorCode): never {
  redirect(`/login?code=${encodeURIComponent(code)}`);
}

/**
 * Maps a failed LINK's backend code to the closed set the profile renders.
 *
 * Closed, and never the raw value: the parameter lands in the address bar, and
 * an arbitrary string there would be text an attacker controls on our page.
 *
 * `link_conflict` keeps its own entry — it has its own advice. The backend
 * folds three cases into it on purpose (linked here already, linked to someone
 * else, another account of this provider already linked), so the profile's
 * copy must not pick one. `access_denied` covers a declined consent screen.
 * Everything else is "did not complete, try again".
 */
function mapLinkError(code: string): LinkFailure {
  if (code === "link_conflict") return "link_conflict";
  if (code === "access_denied" || code === "consent_cancelled") return "denied";
  return "failed";
}

/**
 * Maps the backend's redirect error code to one this app already renders.
 *
 * The backend's set is closed and owned by it: `access_denied`,
 * `consent_cancelled`, `email_mismatch`, `state_invalid`, `link_conflict`,
 * `provider_error`, `internal_error` (`link_conflict` only ever returns to a
 * signed-in browser and is handled by `mapLinkError`). Three of them collapse
 * onto one message
 * because the user's action is identical in all three — try again — and the
 * detail that distinguishes them lives in the backend's audit trail, where it
 * was put deliberately.
 *
 * `consent_cancelled` gets its own message: the person clicked Cancel at the
 * provider, and the backend now says so separately (UX-10) because that
 * reveals nothing about an account.
 *
 * `access_denied` is the one that earns a different message, because it is the
 * one where retrying does not help. It still covers two causes: signup closed
 * and a blocked user (and, on a backend older than `consent_cancelled`, a
 * cancelled consent screen). Telling them to ask for an invitation is right for
 * the first, and the first is the only one where the user cannot act without
 * being told. A blocked user being sent to an admin is a tolerable second-best; the
 * message must not say more than that, since whether an account is blocked is
 * not a fact to volunteer to whoever holds the browser.
 *
 * An unknown code from a newer backend maps to the generic failure rather than
 * rendering blank.
 */
function mapDanceError(code: string): AuthErrorCode {
  if (code === "consent_cancelled") {
    return AUTH_ERROR_CODES.consentCancelled;
  }
  if (code === "access_denied") {
    return AUTH_ERROR_CODES.signupDisabled;
  }
  // The invitation path's one recoverable failure: the person signed in with an
  // account that is not the invited one, and they can fix it themselves by
  // using the right account. The constant and its copy predate this — they are
  // what the old accept path used, and the backend added this code at our
  // request precisely because we still had them.
  if (code === "email_mismatch") {
    return AUTH_ERROR_CODES.emailMismatch;
  }
  return AUTH_ERROR_CODES.oauthHandoffFailed;
}

/**
 * Completes the dance: trades the one-time code for a session.
 *
 * The cookie is cleared FIRST, its value captured into a local, so that "cleared
 * on every exit" is true by construction rather than in five branches that each
 * had to remember. The backend applies the same ordering to its own dance
 * cookies for the same reason.
 *
 * `signInWithDanceCode` writes the session and returns; this action decides
 * where the browser goes — the destination on success, `/login?code=` with the
 * failure's code otherwise, read structurally as in `built-in-sign-in-actions.ts`.
 */
export async function completeOAuthDanceAction(formData: FormData): Promise<void> {
  const stored = await readOAuthNext();
  const destination = stored ?? "/";
  await clearOAuthNext();
  // Read and cleared up front for the same reason: the nonce proves one dance,
  // and must not outlive it on any exit.
  const proof = await readOAuthBindingProof();
  await clearOAuthBinding();

  // Refuse to redeem into a browser that already holds a session.
  //
  // Without this, an attacker who starts a dance on their own account and gets
  // a signed-in victim to open the receiver with that code — a link is enough,
  // since our own page submits the form — silently swaps the victim's identity
  // for theirs. Everything the victim then writes lands in the attacker's
  // account. The 60-second TTL and the POST-only redemption narrow the window;
  // they do not close it.
  //
  // Refusing rather than signing out first: a signed-in user reaching the
  // receiver is either a stale tab or an attack, and neither wants a silent
  // identity swap. The unspent code simply expires.
  //
  // It is also, legitimately, how a LINK comes back (GAP-2): the profile starts
  // a dance for an account that is already signed in, and the backend returns
  // the browser here with `linked=1` or an `error`, never a code. Those go to
  // the profile's sign-in methods, which is where the person started and where
  // the outcome can be read. A `code` alongside a session still redeems
  // nothing, exactly as before.
  //
  // Accepted imprecision: an `error` with a session is ASSUMED to be a link.
  // A sign-in dance failing in a tab after the user signed in elsewhere, or a
  // crafted `?error=link_conflict`, lands on the profile's fixed "couldn't
  // link" copy. Misleading at worst — the copy is a closed set, nothing from
  // the URL is rendered — and telling the two apart would take a "link
  // pending" cookie for a stale-tab edge case.
  if (await readActiveSession()) {
    // A pending link (backend M1): the callback no longer links, it hands back
    // a one-time `link_code` that only this session, with this browser's
    // nonce, can complete. No nonce means this browser did not start it.
    const linkCode = String(formData.get("link_code") ?? "").trim();
    if (linkCode) {
      const outcome = proof ? await completeProviderLink(linkCode, proof) : "failed";
      redirect(
        outcome === "linked"
          ? "/settings/profile?linked=1"
          : `/settings/profile?link_error=${encodeURIComponent(outcome)}`,
      );
    }
    // `linked=1` is what a backend before the link_code change answered. Kept
    // so a frontend deployed ahead of its backend still lands somewhere sane.
    if (String(formData.get("linked") ?? "").trim() === "1") {
      redirect("/settings/profile?linked=1");
    }
    const linkError = String(formData.get("error") ?? "").trim();
    if (linkError) {
      redirect(`/settings/profile?link_error=${encodeURIComponent(mapLinkError(linkError))}`);
    }
    redirect(destination);
  }

  const providerError = String(formData.get("error") ?? "").trim();
  if (providerError) {
    redirectToLoginError(mapDanceError(providerError));
  }

  const code = String(formData.get("code") ?? "").trim();
  if (!code) {
    // Someone opened the receiver directly, or the backend redirected with
    // neither parameter. Nothing to redeem.
    redirectToLoginError(AUTH_ERROR_CODES.oauthHandoffFailed);
  }

  // Refuse a code this browser did not ask for (login CSRF, security review
  // 2026-10-07 M-1). The session check above protects a signed-in victim; this
  // one protects a signed-out one, who would otherwise be signed into whatever
  // account minted the code in the link they were sent — and everything they
  // typed next would land there. `startOAuthDanceAction` always writes the
  // destination cookie, so its absence means the dance began somewhere else.
  //
  // One cookie per browser, so two dances started in parallel tabs collide: the
  // first to finish clears it and the second is refused. Accepted — rare, and
  // the person simply signs in again.
  //
  // The destination cookie alone narrowed this to "victim started a dance in
  // the last fifteen minutes"; the binding nonce closes it — the backend
  // redeems the code only with the nonce of the browser that started it. A
  // missing nonce is refused here, before the code is spent on a request the
  // backend must refuse anyway.
  if (stored === null || !proof) {
    redirectToLoginError(AUTH_ERROR_CODES.oauthHandoffFailed);
  }

  try {
    await signInWithDanceCode(code, proof);
  } catch (error) {
    redirectToLoginError(failureCode(error));
  }

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
