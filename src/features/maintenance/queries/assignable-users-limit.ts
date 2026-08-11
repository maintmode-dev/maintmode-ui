/**
 * Max rows to request from `GET /api/v1/users/assignable`, shared by the two
 * pickers that hit that endpoint (approver and mentions).
 *
 * It lives in its own module rather than in either hook on purpose. The approver
 * hook must not import from the mentions hook — that import is exactly the
 * coupling this fix removes (SPEC §2.1, AC-11) — and duplicating the number in
 * both files invites them to drift apart silently.
 *
 * ⚠️ Sending this explicitly is NOT optional. Omit `limit` and the backend
 * answers with its own default of 50, not "everything" (measured, SPEC §1.1
 * row 3). Both pickers filter client-side through cmdk and never re-query, so
 * whatever this number leaves out is simply unreachable in the UI.
 *
 * 200 is the endpoint maximum. It is currently well under the roster size
 * (total ≈ 10 742 unfiltered, ≈ 3 214 approvers), so both pickers show a
 * partial slice; the `total` check in each `queryFn` makes that audible in dev,
 * and server-side search is tracked as RUK-251.
 */
export const ASSIGNABLE_USERS_LIMIT = 200;

const warned = new Set<string>();

/**
 * Dev-only `console.warn`, at most once per key per session.
 *
 * Both picker warnings describe a standing condition, not an event: `total`
 * stays over the limit for as long as the roster does, and a missing `roles`
 * filter is wrong on every refetch. Warning each time turns a real signal into
 * background noise, and a warning people scroll past is the same
 * desensitisation that let the original bug hide behind an empty list
 * (SPEC §4.0). Say it once, loudly.
 *
 * No-op in production: these are developer diagnostics, and there is no client
 * telemetry to receive them (SPEC §9.5).
 */
export function warnOnce(key: string, message: string): void {
  if (process.env.NODE_ENV === "production" || warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

/** Test seam: clears the once-per-session state so each case starts fresh. */
export function resetWarnOnce(): void {
  warned.clear();
}
