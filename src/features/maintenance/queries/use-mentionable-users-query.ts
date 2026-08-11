"use client";

import { useQuery } from "@tanstack/react-query";

import { bffFetch } from "@/features/_shared/api/bff-fetch";
import { DATA_SOURCE } from "@/features/_shared/api/data-source";
import { MOCK_USERS } from "@/shared/mock/users";
import type { AssignableUser } from "@/domain/maintenance/maintenance";
import { ASSIGNABLE_USERS_LIMIT, warnOnce } from "./assignable-users-limit";

/**
 * Cache key for the UNFILTERED user list — a DIFFERENT first segment from
 * `assignableUsersKey`, on purpose. Do not "unify" the two into one shared
 * function (SPEC §5.4).
 *
 * `assignableUsersKey` resolves its roles segment as
 * `(params.roles ?? APPROVER_ROLES).join(",")`. Calling that function without
 * `roles` therefore yields `["assignable-users", "", "reviewer,admin"]` — byte
 * for byte the approver picker's key — while the data cached under it would be
 * the UNFILTERED list, guests included. The approver combobox would then start
 * offering people who cannot approve. Passing `roles: []` is not a fix either:
 * `[].join(",") === ""` diverges only by accident, and the request would go out
 * with no roles at all.
 *
 * A distinct literal prefix makes the collision structurally impossible.
 *
 * This entry has exactly one meaning — "everyone" — and the approver picker
 * keeps well away from it: it issues its own role-filtered request under its own
 * key. Deriving approvers from this entry was tried and reverted; it filters
 * after the row limit instead of before it, which empties the picker (SPEC §0.1).
 * Unifying the two KEY FUNCTIONS would reintroduce the collision, because the
 * hazard is a key that CLAIMS "reviewer,admin" while holding everyone.
 */
export function mentionableUsersKey(search: string) {
  return ["mentionable-users", search] as const;
}

/**
 * Fetch users who can be mentioned on a maintenance
 * (`GET /api/v1/users/assignable`), backing the Mentions picker on the
 * create/edit form.
 *
 * A separate hook rather than a parameter on `useAssignableUsersQuery`: that
 * hook restricts the request to approver roles. That is approver policy, and it
 * must not run for mentions under any arguments — mentions answer "who should be
 * warned", not "who holds a permission", so guests belong in this list
 * (SPEC §2.2.1). Hence: no `roles` sent, no client re-filter, and its own cache
 * key (see `mentionableUsersKey`).
 *
 * Server-side `search` is deliberately not forwarded (RUK-218 SPEC §13.1):
 * client filtering over the loaded rows is enough HERE, because the dangerous
 * half of the problem — an unreachable id silently dropping a chip — is closed
 * by `mergeMentionChips`. The approver picker has no such merge, so the same
 * argument does NOT transfer to it (SPEC §9.1, tracked as RUK-251).
 */
export function mentionableUsersQueryOptions(search?: string) {
  return {
    queryKey: mentionableUsersKey(search ?? ""),
    queryFn: async (): Promise<AssignableUser[]> => {
      if (DATA_SOURCE.assignableUsers === "mock") {
        const q = search?.trim().toLowerCase();
        return MOCK_USERS.filter(
          (u) => !q || u.display_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
        ).map((u) => ({
          id: u.id,
          display_name: u.display_name,
          email: u.email,
          roles: u.roles,
          // Derived, never hardcoded: this mirrors the backend aggregate
          // (`userpicker.go`) exactly, so the mock cannot drift into a false
          // "nobody has a handle" signal. The projection below lists fields
          // explicitly — a field omitted here silently becomes `undefined`.
          has_messenger_tag: Boolean(u.telegram_tag ?? u.slack_tag),
        }));
      }
      const qs = new URLSearchParams({ limit: String(ASSIGNABLE_USERS_LIMIT) });
      const data = await bffFetch<{ users: AssignableUser[]; total?: number }>(
        `/api/users/assignable?${qs.toString()}`,
      );
      if ((data.total ?? 0) > ASSIGNABLE_USERS_LIMIT) {
        warnOnce(
          "mentions-partial-slice",
          `[mentions-picker] total=${data.total} > limit=${ASSIGNABLE_USERS_LIMIT} — ` +
            `picker shows a partial slice; server-side search needed (RUK-251)`,
        );
      }
      // `?? []` so a malformed response degrades to an empty picker with an
      // error state rather than throwing out of the queryFn.
      return data.users ?? [];
    },
    staleTime: 60_000,
  };
}

export function useMentionableUsersQuery(search?: string) {
  return useQuery(mentionableUsersQueryOptions(search));
}
