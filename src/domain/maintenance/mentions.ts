/**
 * Mentions — tagging people in a maintenance notification (RUK-218).
 *
 * Split out of `maintenance.ts` (which stays types-only) for the same reason as
 * `reminders.ts`: both the mapper and the form need this, and neither should
 * import the other.
 */

import type { AssignableUser, MaintenanceMention } from "@/domain/maintenance/maintenance";

/**
 * Backend cap on how many people one maintenance may tag. **Inclusive** — exactly
 * 10 is legal, 11 is a 400.
 *
 * Mirrored by hand, and it has to be: the backend keeps two *unexported*
 * `maxMentions = 10` constants, one per layer (`internal/services/maint/create_draft.go`
 * for the service gate, `internal/app/api/public/maint/update_draft_maint.go` for the
 * fail-fast API check). Nothing is exported to import or generate from, so a backend
 * change to either lands here silently. The mismatch is not dangerous in the strict
 * direction — a smaller value here just blocks earlier — but a larger one would send
 * a body the backend rejects with a 400 whose message the form cannot attribute to
 * this field (every mention error shares `code: "invalid request"`).
 */
export const MAX_MENTIONS = 10;

/** One selected person as the form renders them — the form owns the chip styling. */
export interface MentionChip {
  id: string;
  /** Display name when we could resolve one, otherwise the raw id. */
  name: string;
  /**
   * Tri-state, mirroring {@link AssignableUser.has_messenger_tag}: `true`/`false`
   * only when the picker told us, `undefined` when nobody did. See SPEC §5.7.
   */
  hasTag?: boolean;
}

/**
 * Selected ids → chips, merging every source instead of filtering the picker's
 * options.
 *
 * **Why merge and not `filter`** (SPEC §5.6, the task's most dangerous logic):
 * a selected person can legitimately be missing from `options` — an admin blocked
 * them (`/users/assignable` always excludes blocked users), or they simply sit
 * beyond the picker's `limit`. A `filter` over options would drop them from the
 * chips while they stay in form state, and the operator then either saves a
 * mention they cannot see, or clears a list whose full contents were never shown
 * to them — and on edit a cleared list is sent as `[]`, which hard-deletes.
 * Neither failure produces any signal. So an unresolvable id degrades to a chip
 * showing the id: visible, removable, never silently lost.
 *
 * Source order — picker options first (freshest, and the only source carrying the
 * messenger-tag flag), then `detail.mentions` (carries `display_name`, which is
 * why the read path is load-bearing rather than decoration), then the id itself.
 * Exactly the fallback chain `selectedResources` already uses in
 * `maintenance-edit-mode.tsx`.
 *
 * Result order follows `ids`, not `options`: it is the operator's selection order.
 */
export function mergeMentionChips(
  ids: string[],
  options: AssignableUser[],
  fromDetail: MaintenanceMention[] | undefined,
): MentionChip[] {
  return ids.map((id) => {
    const opt = options.find((u) => u.id === id);
    if (opt) return { id, name: opt.display_name, hasTag: opt.has_messenger_tag };

    const det = fromDetail?.find((m) => m.user_id === id);
    // hasTag stays `undefined` — "we don't know", NOT `false`. `false` would make
    // the chip claim the backend checked and found no handle, and the UI would
    // warn on data it never had (SPEC §4.2, §5.7).
    return { id, name: det?.display_name ?? id, hasTag: undefined };
  });
}
