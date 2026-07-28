/**
 * Client-side mirror of the backend's private `canonicalMessengerTag`
 * (maintmode repo, `internal/entity/messenger_tag.go`). The backend exposes two
 * entry points — `CanonicalTelegramTag` and `CanonicalSlackTag` — that today
 * delegate to the same rules, so this module has a single validator.
 */
const TAG_PATTERN = /^@?[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/;

/**
 * Words that name a whole channel rather than a person. Refused on BOTH
 * transports (backend `cbcac96c`). The match is exact: `@channels` is valid.
 */
const RESERVED = new Set(["here", "channel", "everyone"]);

export type TagError = "invalid_format" | "reserved";

/**
 * Characters Go's `strings.TrimSpace` strips, i.e. exactly `unicode.IsSpace`.
 * This is NOT the same set as JS `String.prototype.trim`, and the two differ in
 * BOTH directions:
 *
 *   - U+FEFF (BOM) — `trim()` strips it, `TrimSpace` does not.
 *   - U+0085 (NEL) — `TrimSpace` strips it, `trim()` does not.
 *
 * The BOM case is the one that bites in practice: a handle pasted out of a
 * BOM-prefixed CSV or a Windows-authored file would pass client validation and
 * then be refused by the backend with a `400` the UI cannot attribute to a
 * field (tag and timezone share one error code — SPEC §1.5), so the operator
 * sees a rejected save with no visible cause on a string that looks fine.
 * Verified by running both implementations over the same inputs.
 */
const GO_SPACE = "\\t\\n\\v\\f\\r \\u0085\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000";
const GO_TRIM = new RegExp(`^[${GO_SPACE}]+|[${GO_SPACE}]+$`, "g");

/** `strings.TrimSpace` semantics, so the mirror trims what the backend trims. */
function trimLikeGo(raw: string): string {
  return raw.replace(GO_TRIM, "");
}

/**
 * `null` = valid. Empty/whitespace means "clear the field", not an error. A
 * leading `@` is never stripped — `@username` and `username` are distinct stored
 * values; the reserved-word comparison strips it for comparison only.
 *
 * Deliberately has no `transport` parameter: the rules coincide, and a
 * fictitious parameter would imply a difference that does not exist. If the
 * transports diverge again, the backend keeps two entry points for exactly that
 * case, and the parameter returns together with the real difference.
 */
export function validateTag(raw: string): TagError | null {
  const t = trimLikeGo(raw);
  if (!t) return null;
  // Belt to the pattern's suspenders. JS `$` matches BEFORE a trailing \n where
  // Go's does not, so the anchors are not equivalent \u2014 but `trim()` (like Go's
  // TrimSpace) already removes a trailing newline, so the divergence is not
  // reachable here and "username\n" is accepted by both sides. What this does
  // catch is an *interior* line break, which the backend treats as a
  // notification-injection vector: a newline inside a handle would inject
  // arbitrary lines into a plain-text message. Keep it \u2014 it survives any future
  // change to the pattern or to the trimming order.
  if (/[\r\n\u2028\u2029]/.test(t)) return "invalid_format";
  if (!TAG_PATTERN.test(t)) return "invalid_format";
  if (RESERVED.has(t.replace(/^@/, "").toLowerCase())) return "reserved";
  return null;
}

/**
 * Dirty check BY VALUE, not by touched-ness (SPEC §5.4). Typing `@rus` and
 * deleting it again must not count as a pending change, and the restored field
 * must not appear in the request body. `saved` accepts `undefined` as well as
 * `null` because the two screens read it from differently-shaped sources.
 *
 * Shared by the profile card and the admin user sheet because a divergence here
 * is silent: one screen would start sending a key the other considers untouched
 * — and on a true-patch endpoint that overwrites a handle nobody edited.
 *
 * This is the PREDICATE only. The two screens deliberately keep their own body
 * builders: a shared builder that spreads a draft is how every key ends up on
 * the wire and wipes the tags this check exists to protect (SPEC §1.1, §7).
 */
export function tagChanged(draft: string, saved: string | null | undefined): boolean {
  return draft.trim() !== (saved ?? "").trim();
}
