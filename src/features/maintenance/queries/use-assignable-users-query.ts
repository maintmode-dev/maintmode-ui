"use client";

import { useQuery } from "@tanstack/react-query";

import { bffFetch } from "@/features/_shared/api/bff-fetch";
import { DATA_SOURCE } from "@/features/_shared/api/data-source";
import { MOCK_USERS } from "@/shared/mock/users";
import type { AssignableUser } from "@/domain/maintenance/maintenance";
import { mentionableUsersQueryOptions } from "./use-mentionable-users-query";

/**
 * Roles that hold the `maintenance.approve` permission — only these users may
 * be picked as approver, so the picker filters to them by default.
 */
export const APPROVER_ROLES = ["reviewer", "admin"] as const;

export interface AssignableUsersParams {
  /** Free-text filter on name/email; debounce at the call site. */
  search?: string;
  /** Keep only users having ANY of these roles. Defaults to approver roles. */
  roles?: readonly string[];
}

export function assignableUsersKey(params: AssignableUsersParams) {
  const roles = (params.roles ?? APPROVER_ROLES).join(",");
  return ["assignable-users", params.search ?? "", roles] as const;
}

/**
 * The one authoritative approver predicate. `useAssignableUsersQuery` applied
 * this client-side even when it sent `roles` to the backend ("belt-and-
 * suspenders": the backend `roles` filter isn't reliably applied, so a user
 * without an approver role could still come back — never offer them as an
 * approver). Because the client filter was already the deciding one, dropping
 * the server-side `roles` request narrows nothing.
 */
function hasApproverRole(user: { roles: readonly string[] }, roles: readonly string[]): boolean {
  return user.roles.some((r) => roles.includes(r));
}

/**
 * Fetch users eligible to be picked as approver
 * (`GET /api/v1/users/assignable`). Backs the approver combobox on the
 * maintenance create/edit form — defaults to the roles that can approve so
 * users without the permission never appear in the list.
 *
 * PERF: in the default shape (no `search`, no custom `roles` — the only shape
 * the edit form uses) this does NOT issue its own request. The mentions picker
 * mounts alongside it and already fetches the SAME endpoint unfiltered, so this
 * hook subscribes to that one cache entry and narrows it with `select`. Edit
 * mode therefore costs one request to `/api/users/assignable`, not two.
 *
 * That is strictly not a narrowing of the result: the shared fetch asks for
 * `limit=200` where this hook's own request carried no limit at all and so ran
 * at the backend default of 50 (`list_assignable.go:32`) — it scans MORE rows
 * than before, and the approver predicate is unchanged.
 *
 * The cache entry it reads holds the unfiltered list and is keyed as such
 * (`mentionableUsersKey`); `select` is a per-observer transform on read and is
 * never written back, so no approver-shaped key ever resolves to unfiltered
 * data. See the long note on `mentionableUsersKey` — that invariant is what
 * this optimization rests on, not something it relaxes.
 *
 * A `search` or a custom `roles` argument is a genuinely different question and
 * still gets its own request under its own key.
 */
export function useAssignableUsersQuery(params: AssignableUsersParams = {}) {
  const roles = params.roles ?? APPROVER_ROLES;
  const isDefaultShape = !params.search && !params.roles;

  // Own request, own key. Only reached for a `search`/custom-`roles` call — the
  // default shape is served by the shared fetch below and never runs this.
  const ownQueryFn = async (): Promise<AssignableUser[]> => {
    if (DATA_SOURCE.assignableUsers === "mock") {
      const q = params.search?.trim().toLowerCase();
      return MOCK_USERS.filter(
        (u) =>
          (!q || u.display_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) &&
          hasApproverRole(u, roles),
      ).map((u) => ({ id: u.id, display_name: u.display_name, email: u.email, roles: u.roles }));
    }
    const qs = new URLSearchParams();
    if (params.search) qs.set("search", params.search);
    for (const role of roles) qs.append("roles", role);
    const data = await bffFetch<{ users: AssignableUser[] }>(`/api/users/assignable?${qs.toString()}`);
    return data.users.filter((u) => hasApproverRole(u, roles));
  };

  const shared = mentionableUsersQueryOptions();
  // Widened to `readonly unknown[]` deliberately: the two branches produce key
  // tuples of different lengths, and a union of the two option shapes matches
  // no single `useQuery` overload. The widening is only about the TYPE — the
  // runtime key is still exactly one of the two key functions' output.
  const queryKey: readonly unknown[] = isDefaultShape ? shared.queryKey : assignableUsersKey(params);

  return useQuery({
    queryKey,
    queryFn: isDefaultShape ? shared.queryFn : ownQueryFn,
    select: isDefaultShape
      ? (users: AssignableUser[]) => users.filter((u) => hasApproverRole(u, roles))
      : undefined,
    staleTime: 60_000,
  });
}
