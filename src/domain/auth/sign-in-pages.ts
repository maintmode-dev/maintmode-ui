/**
 * The sign-in pages: `/login` and the break-glass `/login/recovery`.
 */
export const SIGN_IN_PAGES = ["/login", "/login/", "/login/recovery"] as const;

/**
 * Whether the auth gate should send a signed-in visitor of `pathname` home.
 *
 * Only for a NAVIGATION (GET/HEAD) to a sign-in page. A form on that page posts
 * its Server Action to the same address, and a request still in flight when the
 * session appeared — the user signed in from another tab, or the form was left
 * open — must reach the page. Redirected instead, the 307 keeps the method, the
 * browser re-POSTs to `/`, gets the calendar's HTML where it expected an action
 * result, and Next throws "An unexpected response was received from the
 * server" with the form stuck on "Signing in…". Let through, the action signs
 * in and redirects on its own.
 */
export function bouncesSignedInVisitor(pathname: string, method: string): boolean {
  return (SIGN_IN_PAGES as readonly string[]).includes(pathname) && (method === "GET" || method === "HEAD");
}
