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
 * Expected origins, in order of trust:
 *  1. `request.url`'s origin — the direct/local case (dev server on `:3000`,
 *     or the internal upstream `http://ui:3000` behind the proxy).
 *  2. The public origin, resolved from EITHER:
 *     a. `MAINTMODE_APP_BASE_URL` — the configured public origin
 *        (`https://dev.maintmode.dev`). Authoritative: it comes from server
 *        config, not request headers, so an attacker cannot influence it. When
 *        set, the forwarded-header path below is NOT consulted at all.
 *     b. (fallback, only when 2a is unset) the `X-Forwarded-Host` /
 *        `X-Forwarded-Proto` reconstruction. Behind Caddy (`reverse_proxy
 *        ui:3000`) `request.url` is the internal `http://ui:3000`, not the
 *        public origin the browser sent, so without this a same-origin
 *        mutation 403s.
 *
 * Preferring the configured origin and dropping the forwarded fallback once it
 * is set removes the dependency on edge header hygiene: a spoofed
 * `X-Forwarded-Host` can never widen the allow-list in a configured
 * deployment. The fallback remains safe in our single-ingress topology anyway —
 * Caddy is the only path to the container and overwrites client-supplied
 * `X-Forwarded-*` (no `trusted_proxies`) — but configuring 2a is the belt to
 * that suspenders.
 */
function configuredPublicOrigin(): string | undefined {
  const raw = process.env.MAINTMODE_APP_BASE_URL;
  if (!raw) return undefined;
  try {
    return new URL(raw).origin;
  } catch {
    return undefined;
  }
}

/** `https`/`http` only — reject anything else (don't silently coerce garbage). */
function normalizeForwardedProto(value: string | null): "http" | "https" {
  const proto = value?.split(",")[0].trim().toLowerCase();
  return proto === "http" ? "http" : "https";
}

/** Public origin from `X-Forwarded-Host`/`X-Forwarded-Proto`, or undefined. */
function forwardedOrigin(request: Request): string | undefined {
  const fwdHost = request.headers.get("x-forwarded-host");
  if (!fwdHost) return undefined;
  // X-Forwarded-Host may be a comma-separated list (proxy chain); the first
  // entry is the original client-facing host.
  const host = fwdHost.split(",")[0].trim();
  if (!host) return undefined;
  return `${normalizeForwardedProto(request.headers.get("x-forwarded-proto"))}://${host}`;
}

function expectedOrigins(request: Request): string[] {
  const origins = [new URL(request.url).origin];

  // The configured origin is authoritative; only fall back to the (header-
  // derived, therefore lower-trust) forwarded origin when it is absent.
  const publicOrigin = configuredPublicOrigin() ?? forwardedOrigin(request);
  if (publicOrigin) origins.push(publicOrigin);

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
