/**
 * The address the backend gives its break-glass administrator.
 *
 * A fixed service identity, not a mailbox: `.invalid` is reserved and resolves
 * nowhere, so nothing can ever be sent to it. The account signs in by password
 * alone at `/login/recovery`, and that password lives in the server's secrets —
 * the backend refuses to set a personal one on it (`POST /me/password` → 403).
 */
export const BREAK_GLASS_EMAIL = "break-glass@maintmode.invalid";

export function isBreakGlassAccount(email: string | undefined | null): boolean {
  return email === BREAK_GLASS_EMAIL;
}
