/**
 * Sanitize the `next` query param destination so an open-redirect is
 * impossible. Used by the auth proxy to populate `/login?next=…` after
 * a redirect from a protected route, and by the OAuth dance to carry the
 * post-login destination across the round-trip.
 *
 * Two layers, because the first one has been wrong before.
 *
 *  1. A character check rejecting EVERY C0 control and space (<= 0x20), DEL,
 *     and backslash — a range, not a list of the ones we thought of. The list
 *     version named NUL, LF and CR and missed TAB, which URL parsers strip
 *     exactly like the other three: `/<TAB>//evil.test` parses as
 *     `//evil.test`, so the `startsWith("//")` guard below never sees it and
 *     the browser lands on `https://evil.test/`. Any enumeration is a guess
 *     about what parsers elide; a range is not.
 *
 *  2. Resolution against a throwaway origin, so whatever survives step 1 must
 *     still be same-origin once a real URL parser has had it. This layer would
 *     have caught the TAB case on its own, which is why both are kept rather
 *     than one replacing the other.
 *
 * Anything failing either layer returns the safe fallback `/`.
 */
const PROBE_ORIGIN = "https://safe-next.invalid";

export function safeNext(pathnameAndSearch: string): string {
  if (!pathnameAndSearch) return "/";
  if (!pathnameAndSearch.startsWith("/")) return "/";
  if (pathnameAndSearch.startsWith("//")) return "/";

  for (let i = 0; i < pathnameAndSearch.length; i += 1) {
    const c = pathnameAndSearch.charCodeAt(i);
    // <= 0x20 covers NUL, TAB, LF, VT, FF, CR and space; 0x7f is DEL; 92 is the
    // backslash some browsers normalize to `/`, which would re-open the
    // protocol-relative vector through `/\evil.test`.
    if (c <= 0x20 || c === 0x7f || c === 92) {
      return "/";
    }
  }

  try {
    const resolved = new URL(pathnameAndSearch, PROBE_ORIGIN);
    if (resolved.origin !== PROBE_ORIGIN) {
      return "/";
    }
    // Rebuilt from the parsed parts rather than returned as received, so the
    // caller redirects to what a parser actually saw.
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return "/";
  }
}
