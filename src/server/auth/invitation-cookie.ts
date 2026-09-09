import "server-only";

import { cookies } from "next/headers";

/**
 * Short-lived, httpOnly cookie that carried the raw invitation token across the
 * OAuth round-trip on the public `/accept-invite` flow.
 *
 * NO PRODUCTION CALLER, and this design is now SUPERSEDED rather than pending.
 *
 * RUK-292 removed the last caller. The backend has since grown its own path
 * (`/login/oauth/{provider}/start?invitation=…`), and it does not work like
 * this: the raw token goes to the backend as a query parameter and the backend
 * keeps an opaque single-use handle on its side, so the seven-day credential
 * never sits in a browser cookie at all. A restored flow would not want what is
 * described below.
 *
 * Kept only because deleting it belongs with `acceptInvitation` — same dead
 * code, same owner, one pass. The description below is history.
 *
 * Why a cookie: the accept endpoint needs BOTH the invitation token AND a fresh
 * provider `id_token`. The `id_token` only materializes after NextAuth finishes
 * the OAuth dance, by which point the original `?token=` query is long gone. We
 * stash the token in an httpOnly cookie when the user starts sign-in from
 * `/accept-invite`, then read it back in the `signIn` callback to complete the
 * accept exchange. httpOnly keeps it out of `document.cookie`; SameSite=Lax
 * lets it survive the top-level OAuth redirect back to us.
 *
 * The token is single-use: the `signIn` callback calls `clearInvitationToken`
 * the moment it reads the cookie, so a stale token can't bind a later sign-in.
 * Edge case: if a user starts accept (cookie set) then abandons and does a
 * normal Google login within the cookie's lifetime, that login is treated as
 * an accept. The backend's email-match guard rejects it (the OAuth email won't
 * match an invited email), the cookie is consumed, and a retry logs in
 * normally — so the worst case is one bounced sign-in, not a wrong session.
 */
export const INVITATION_TOKEN_COOKIE = "mm.invite_token";

const MAX_AGE_SECONDS = 10 * 60; // 10 min — long enough for one OAuth round-trip.

export async function setInvitationToken(token: string): Promise<void> {
  const store = await cookies();
  store.set(INVITATION_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function readInvitationToken(): Promise<string | undefined> {
  const store = await cookies();
  const value = store.get(INVITATION_TOKEN_COOKIE)?.value;
  return value && value.length > 0 ? value : undefined;
}

export async function clearInvitationToken(): Promise<void> {
  const store = await cookies();
  store.delete(INVITATION_TOKEN_COOKIE);
}
