import "server-only";

/**
 * Defense-in-depth CSRF check for state-mutating BFF route handlers.
 *
 * NextAuth's JWT cookie is `SameSite=Lax`, which blocks the simplest
 * cross-site POSTs. Verifying the `Origin` header (or `Referer` as a
 * fallback) closes the residual gap: cross-site forms, programmatic
 * `fetch` from a malicious page, and CDN-proxied origins.
 *
 * Rules:
 *  - If `Origin` is present, it MUST equal the request URL's origin.
 *  - If `Origin` is missing but `Referer` is present (some older browsers
 *    and same-origin POSTs from form-action="..."), parse its origin and
 *    compare.
 *  - If BOTH are missing, reject. This is conservative — most legitimate
 *    same-origin POSTs include at least one of the two. Test runners /
 *    CI smoke clients SHOULD set `Origin: <expected>` explicitly when
 *    they hit this route (otherwise they'll see a 403 with code
 *    `FORBIDDEN`, not a 401).
 */
export function isSameOriginRequest(request: Request): boolean {
  const expectedOrigin = new URL(request.url).origin;

  const headerOrigin = request.headers.get("origin");
  if (headerOrigin) {
    return headerOrigin === expectedOrigin;
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === expectedOrigin;
    } catch {
      return false;
    }
  }

  return false;
}
