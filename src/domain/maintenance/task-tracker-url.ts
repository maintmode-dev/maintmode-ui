/**
 * The maintenance's link to its task in an external tracker (backend
 * `task_tracker_url`). One plain URL, any tracker — the backend stores and
 * broadcasts it, it never fetches it.
 *
 * The rules mirror the backend's `xvalidation.HTTPLinkURL`, which guards a link
 * a PERSON clicks from a chat message or this UI. Plain `http` and internal
 * hosts are legitimate there (a self-hosted tracker); the threat is a link that
 * reads as one place and leads to another. The backend stays the authority —
 * this copy exists so the form can say which rule failed before a round trip.
 * It must never be LOOSER than the backend: the http(s) allowlist is the only
 * thing standing between a stored value and `javascript:` in an `href`.
 */

export const MAX_TASK_TRACKER_URL_LENGTH = 2048;

/**
 * `scheme://authority`, read off the raw string rather than the parsed URL.
 *
 * The WHATWG parser is more forgiving than Go's `url.Parse`, and every place it
 * forgives is a value the backend rejects: `https:\\host` (backslashes become
 * slashes), `https://%D0%B0.com` (the percent-decoded host is converted to
 * punycode and comes out ASCII), and `https://@host` (empty userinfo leaves
 * `username` blank). Checking the authority as typed closes all three.
 */
const AUTHORITY = /^https?:\/\/([^/?#]*)/i;

/**
 * The reason `raw` would be rejected, or `null` when it is acceptable. Empty is
 * acceptable: whether a link is required is the caller's decision, and the
 * backend reads `""` as "no link".
 *
 * Expects an already-trimmed value. The backend does NOT trim — a stray space
 * is a 400 there — so callers trim before validating and before sending.
 */
export function taskTrackerUrlError(raw: string): string | null {
  if (raw === "") return null;
  if (raw.length > MAX_TASK_TRACKER_URL_LENGTH) {
    return `Must be at most ${MAX_TASK_TRACKER_URL_LENGTH} characters.`;
  }
  // Refuses whitespace, control characters, bidi overrides and zero-width
  // characters (which reorder or hide what the reader sees), and raw IDN hosts.
  if (!isPrintableAscii(raw)) {
    return "Use only printable ASCII characters, without spaces (punycode for international domains).";
  }
  // Slack reads `<url|text>` as a link whose visible text the author chooses.
  if (/[<>|"]/.test(raw)) return 'Must not contain <, >, | or ".';

  const authority = AUTHORITY.exec(raw)?.[1];
  if (authority === undefined) return "Must be an absolute http:// or https:// link.";
  if (authority.includes("@")) return "Must not carry credentials in the link.";
  // A percent-encoded host passes the byte check yet names a non-ASCII host.
  if (authority.includes("%")) return "Name the host in ASCII (punycode for international domains).";

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return "Must be a valid link.";
  }
  if (parsed.hostname === "") return "Must be an absolute http:// or https:// link.";
  return null;
}

/**
 * What to render for a stored link: the `href` and the host shown on its own,
 * or `null` when it should not be rendered as a link at all.
 *
 * The protocol is re-checked on READ even though the backend validated on
 * write: a row written before the rule existed, or by a future endpoint that
 * forgets it, must not turn into a clickable `javascript:`.
 *
 * The host is split out so the page can show it apart from the rest. A
 * disguised link such as `https://evil.com#@jira.example.com` then reads as
 * `evil.com`, not as the tracker it imitates.
 */
export function taskTrackerLink(
  raw: string | undefined,
): { href: string; host: string; rest: string } | null {
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  const rest = `${parsed.pathname === "/" ? "" : parsed.pathname}${parsed.search}${parsed.hash}`;
  return { href: parsed.href, host: parsed.host, rest };
}

function isPrintableAscii(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x21 || c > 0x7e) return false;
  }
  return true;
}
