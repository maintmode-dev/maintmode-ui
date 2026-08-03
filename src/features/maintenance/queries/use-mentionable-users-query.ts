"use client";

import { useQuery } from "@tanstack/react-query";

import { bffFetch } from "@/features/_shared/api/bff-fetch";
import { DATA_SOURCE } from "@/features/_shared/api/data-source";
import { MOCK_USERS } from "@/shared/mock/users";
import type { AssignableUser } from "@/domain/maintenance/maintenance";

/**
 * Max rows the endpoint will return (SPEC §1.6); its default is only 50, which
 * would leave user #51 alphabetically unreachable because `MultiSelect` filters
 * client-side through cmdk and never re-queries. Ask for the maximum instead.
 * Precedent: `useResourcesQuery({ limit: 200 })`. Server-side `search` is
 * deliberately not forwarded in RUK-218 (SPEC §13.1) — client filtering over
 * 200 loaded rows is enough, and the dangerous half of the problem (an
 * unreachable id silently dropping a chip) is closed by `mergeMentionChips`.
 */
const MENTIONABLE_USERS_LIMIT = 200;

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
 * The approver picker now READS this same cache entry (see
 * `useAssignableUsersQuery`) to avoid a second request to the one endpoint both
 * pickers hit. That does NOT weaken the reasoning above — it depends on it.
 * What is cached here stays the unfiltered list; the approver picker narrows it
 * through react-query `select`, which is a per-observer transform on read and
 * is never written back into the cache. So this entry has exactly one meaning
 * ("everyone"), and no code path can make an approver-shaped key resolve to it.
 * Unifying the two KEY FUNCTIONS would still reintroduce the collision, because
 * the hazard is a key that CLAIMS "reviewer,admin" while holding everyone.
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
 * hook re-filters the response by approver roles client-side ("belt-and-
 * suspenders", because the backend `roles` filter is unreliable). That is
 * approver policy, and it must not run for mentions under any arguments —
 * mentions answer "who should be warned", not "who holds a permission", so
 * guests belong in this list (SPEC §2.2.1). Hence: no `roles` sent, no client
 * re-filter, and its own cache key (see `mentionableUsersKey`).
 */
/**
 * Shared query options for the one unfiltered `/api/users/assignable` fetch.
 *
 * Exported so `useAssignableUsersQuery` can mount an observer on the SAME cache
 * entry instead of firing a second request to the same endpoint. Both hooks
 * must pass identical `queryKey`/`queryFn`/`staleTime`, or react-query would
 * open a second entry and the dedup would silently stop working.
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
      const qs = new URLSearchParams({ limit: String(MENTIONABLE_USERS_LIMIT) });
      const data = await bffFetch<{ users: AssignableUser[] }>(`/api/users/assignable?${qs.toString()}`);
      return data.users;
    },
    staleTime: 60_000,
  };
}

export function useMentionableUsersQuery(search?: string) {
  return useQuery(mentionableUsersQueryOptions(search));
}
