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
 *  - If `Origin` is present, it MUST equal one of the expected origins.
 *  - If `Origin` is missing but `Referer` is present (some older browsers
 *    and same-origin POSTs from form-action="..."), parse its origin and
 *    compare.
 *  - If BOTH are missing, reject. This is conservative — most legitimate
 *    same-origin POSTs include at least one of the two. Test runners /
 *    CI smoke clients SHOULD set `Origin: <expected>` explicitly when
 *    they hit this route (otherwise they'll see a 403 with code
 *    `FORBIDDEN`, not a 401).
 *
 * Behind the reverse proxy (Caddy `reverse_proxy ui:3000`), `request.url`
 * is the *internal* upstream origin (`http://ui:3000`), NOT the public
 * origin the browser used (`https://dev.maintmode.dev`). The browser sends
 * the public origin in `Origin`, so a naive `Origin === request.url.origin`
 * check 403s every same-origin mutation in production. We therefore also
 * accept the public origin reconstructed from the `X-Forwarded-Host` /
 * `X-Forwarded-Proto` headers Caddy sets. This is safe in our single-ingress
 * topology: Caddy is the only path to the container and sets those headers,
 * and a spoofed forwarded host can only match an `Origin` the attacker
 * already controls — it can't make a victim's cross-site `Origin` pass.
 */
function expectedOrigins(request: Request): string[] {
  const origins = [new URL(request.url).origin];

  const fwdHost = request.headers.get("x-forwarded-host");
  if (fwdHost) {
    // X-Forwarded-Host may be a comma-separated list (proxy chain); the first
    // entry is the original client-facing host.
    const host = fwdHost.split(",")[0].trim();
    const proto = (request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || "https").replace(
      /[^a-z]/gi,
      "",
    );
    if (host) origins.push(`${proto}://${host}`);
  }

  return origins;
}

export function isSameOriginRequest(request: Request): boolean {
  const allowed = expectedOrigins(request);

  const headerOrigin = request.headers.get("origin");
  if (headerOrigin) {
    return allowed.includes(headerOrigin);
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return allowed.includes(new URL(referer).origin);
    } catch {
      return false;
    }
  }

  return false;
}
