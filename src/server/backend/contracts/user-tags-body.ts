import "server-only";

/**
 * Request body for the admin messenger-tag edit
 * (`PATCH /api/v1/users/{id}`, SPEC §1.3).
 *
 * Three-valued per key, mirroring `PATCH /me`:
 *   key absent  → leave the stored tag untouched
 *   `null`      → clear the tag
 *   string      → store verbatim (a leading `@` is part of the value)
 */
export interface UpdateUserTagsBody {
  telegram_tag?: string | null;
  slack_tag?: string | null;
}

/**
 * The only keys this endpoint accepts. Anything else — most importantly
 * `timezone` — is structurally unreachable: the builder never reads a key
 * outside this list, so no input can put one in the outgoing body.
 */
const ALLOWED_KEYS = ["telegram_tag", "slack_tag"] as const;

/**
 * Build the admin tag-update body from an untrusted parsed JSON value.
 *
 * The body is rebuilt **from scratch** rather than filtered in place, and each
 * allowed key is emitted only when it is present in the input (`"key" in
 * record`) — presence, not truthiness, is what distinguishes "clear this tag"
 * from "don't touch it".
 *
 * **AC11 — why `timezone` can never leak.** Building from scratch off a fixed
 * key list makes the guarantee structural rather than conventional: `timezone`
 * is never read, so there is no code path that forwards it. This matters
 * because the backend cannot catch it for us — swagger claims the endpoint
 * rejects `timezone` as unknown input, but the project has no
 * `DisallowUnknownFields` (SPEC §1.3), so Echo silently accepts-and-ignores a
 * stray key: the caller would get a `200` and no timezone change. The BFF is
 * the only layer where this is enforceable at all.
 *
 * Value semantics per allowed key:
 *  - `null`, `""`, whitespace-only  → `null` (clear), matching the backend's
 *    `TrimSpace` → empty → reset rule.
 *  - non-empty string               → trimmed; the leading `@` is NEVER
 *    stripped (`@username` and `username` are different values, SPEC §1.2).
 *  - any non-string, non-null value (`42`, `{}`, `[]`) → `null`, i.e. treated
 *    as a clear. Rationale: the key was explicitly present, so "don't touch"
 *    would misrepresent the caller's intent; and forwarding the junk verbatim
 *    would just earn a `400` from the backend's tag validator. Clearing is the
 *    only in-contract reading of "this key was set to something that is not a
 *    tag". The UI never produces this — it is a non-UI-client path only.
 *
 * Non-object input (`null`, `42`, `"str"`, `[]`) yields `{}` without throwing:
 * an empty body is the backend's documented "change nothing" case.
 */
export function buildUserTagsBody(parsed: unknown): UpdateUserTagsBody {
  const body: UpdateUserTagsBody = {};

  // Arrays are objects in JS but never a valid body shape here; excluding them
  // keeps `"telegram_tag" in record` from ever matching an array's own keys.
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return body;
  }

  const record = parsed as Record<string, unknown>;
  for (const key of ALLOWED_KEYS) {
    if (key in record) {
      body[key] = normalizeTag(record[key]);
    }
  }
  return body;
}

/** `""`/whitespace/non-string → `null` (clear); otherwise the trimmed value. */
function normalizeTag(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
