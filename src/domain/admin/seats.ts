/**
 * Licensed-seat state, mirrored from the auth backend's
 * `GET /api/v1/license/seats` (RUK-219). Admin-only.
 *
 * Shape is the wire shape (snake_case, no mapper), like the rest of
 * `domain/admin/**`: the admin surface consumes the backend contract directly.
 *
 * **`seats_occupied` is never derived on the client.** It arrives ready-made
 * because it is the exact number the backend's seat guard rejects an invite on;
 * a client-side `seats_used + seats_pending` "happens to be equal today" and
 * would drift the moment the rule about what holds a seat changes
 * (backend `internal/app/api/public/users/models/seats.go`). The three counters
 * are independent readings, not two readings and a sum.
 *
 * Counter semantics, all guest-free (a guest never holds a seat):
 *  - `seats_used` — active users on a seat role (admin/reviewer/editor).
 *    Blocked users drop out entirely, so blocking frees a seat.
 *  - `seats_pending` — live invitations to a seat role. They hold a seat from
 *    the moment they are sent; revoking or expiring one releases it.
 *  - `seats_occupied` — what the cap is checked against.
 *
 * Accepting an invite is net-zero on `seats_occupied`: the seat the invite held
 * is the seat the new user now holds.
 */
export interface SeatsUsage {
  /**
   * The licensed ceiling. `null` **exactly** when `unlimited` is true — the
   * backend guarantees the invariant in both directions.
   *
   * Required and nullable rather than optional: the key is always present on
   * the wire (no `omitempty`), and a `null` ceiling is a different statement
   * from an absent one. Note the generated swagger loses both the nullability
   * and the required-ness, which is why this type is hand-written.
   */
  seats_purchased: number | null;
  seats_used: number;
  seats_pending: number;
  seats_occupied: number;
  /**
   * True on a self-hosted instance, and also whenever no ceiling is known —
   * before Console has reported one, or while the license row is unreadable.
   * Only the self-hosted case zeroes the counters; in the others they are real.
   */
  unlimited: boolean;
}
