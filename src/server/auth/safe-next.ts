/**
 * Sanitize the `next` query param destination so an open-redirect is
 * impossible. Used by the auth proxy to populate `/login?next=…` after
 * a redirect from a protected route.
 *
 * We require:
 *  - present and non-empty
 *  - starts with `/`
 *  - does NOT start with `//` (protocol-relative URL)
 *  - does NOT start with `/\` (browser-normalized to `//`)
 *  - does NOT contain ASCII control chars (CR, LF, NUL) or backslash
 *    (which some browsers historically normalize to `/`)
 *
 * If any check fails the function returns the safe fallback `/`.
 */
export function safeNext(pathnameAndSearch: string): string {
  if (!pathnameAndSearch) return "/";
  if (!pathnameAndSearch.startsWith("/")) return "/";
  if (pathnameAndSearch.startsWith("//")) return "/";
  if (pathnameAndSearch.length >= 2 && pathnameAndSearch.charCodeAt(1) === 92) {
    // `/\` — browser normalisation of `/\foo` → `//foo` would allow the
    // protocol-relative attack vector.
    return "/";
  }
  for (let i = 0; i < pathnameAndSearch.length; i += 1) {
    const c = pathnameAndSearch.charCodeAt(i);
    // 0 = NUL, 10 = LF, 13 = CR, 92 = backslash
    if (c === 0 || c === 10 || c === 13 || c === 92) {
      return "/";
    }
  }
  return pathnameAndSearch;
}
