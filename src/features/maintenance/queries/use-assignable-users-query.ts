"use client";

import { useQuery } from "@tanstack/react-query";

import { bffFetch } from "@/features/_shared/api/bff-fetch";
import { DATA_SOURCE } from "@/features/_shared/api/data-source";
import { MOCK_USERS } from "@/shared/mock/users";
import type { AssignableUser } from "@/domain/maintenance/maintenance";
import { ASSIGNABLE_USERS_LIMIT, warnOnce } from "./assignable-users-limit";

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
  // Must resolve `roles` exactly as the hook does — empty falls back too, not
  // just absent. Were this a bare `??`, `roles: []` would key as
  // `["assignable-users","",""]` while the request sent the approver roles: one
  // cache entry claiming "no role filter" holding role-filtered data, which is
  // the collision `mentionableUsersKey` is built to make impossible.
  const roles = (params.roles?.length ? params.roles : APPROVER_ROLES).join(",");
  return ["assignable-users", params.search ?? "", roles] as const;
}

/**
 * The approver predicate — the SECOND line of defence, not the first.
 *
 * The deciding filter is the one the backend applies, because it runs BEFORE
 * the row limit while this one runs AFTER it. Sorting is `display_name ASC`
 * with role playing no part (measured, SPEC §1.2), so filtering a truncated
 * page client-side yields an arbitrary subset of approvers whose size depends
 * on nothing but how the names happened to fall alphabetically.
 *
 * Keeping it is deliberate but it is a MUFFLER, not a belt-and-braces bonus:
 * without it a query that lost its `roles` param would offer 200 guests as
 * approvers — obviously wrong, loud, fixed in an hour. With it, that same
 * failure renders an empty picker that reads as "there are no approvers". That
 * is precisely how this bug survived. Hence the dev warning at the call site:
 * if the server filter applied, this one cannot possibly drop a row.
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
 * `roles` MUST go to the server, and an explicit `limit` MUST go with it — an
 * invariant this hook enforces rather than merely assumes (see the empty-array
 * guard below). The server applies `roles` before truncating to `limit`;
 * anything filtered on the client is filtered after truncation, over whatever
 * arbitrary slice came back.
 * On a roster of ~10 742 users with ~3 214 approvers that difference is the
 * whole feature: server-side, the picker sees 200 approvers; client-side, it
 * saw ~60 in production and exactly zero on the local seed (SPEC §0.1, §1.1).
 *
 * Omitting `limit` is the quiet version of the same mistake — the backend then
 * answers with its default of 50 (SPEC §1.1 row 3), which no smoke test and no
 * "is the list non-empty" assertion can tell from a correct 200.
 *
 * This hook owns its own cache key and its own request. It deliberately does
 * NOT share the mentions picker's fetch: that entry holds the UNFILTERED list,
 * and deriving approvers from it means filtering after truncation — the bug
 * above. The extra request is the price, and it is the right trade (SPEC §2.5).
 */
export function useAssignableUsersQuery(params: AssignableUsersParams = {}) {
  // `?? ` is NOT enough here: it only defaults on nullish, so `roles: []` would
  // survive, append nothing to the query string, and send `?limit=200` with no
  // `roles` at all — reproducing the exact bug this hook exists to prevent
  // (verified: wire `/api/users/assignable?limit=200`, data `[]`). The client
  // filter then rejects every row, so the picker is empty. Fall back on empty,
  // not just on absent. Same hazard the `mentionableUsersKey` docblock names:
  // `[].join(",") === ""` diverges from the approver key only by accident.
  const roles = params.roles?.length ? params.roles : APPROVER_ROLES;

  const queryFn = async (): Promise<AssignableUser[]> => {
    if (DATA_SOURCE.assignableUsers === "mock") {
      const q = params.search?.trim().toLowerCase();
      return MOCK_USERS.filter(
        (u) =>
          (!q || u.display_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) &&
          hasApproverRole(u, roles),
      ).map((u) => ({
        id: u.id,
        display_name: u.display_name,
        email: u.email,
        roles: u.roles,
        // Mirrors the mentions branch and the backend aggregate exactly. The
        // projection lists fields explicitly, so a field omitted here silently
        // becomes `undefined` — and this branch is reachable again now that the
        // default shape runs its own `queryFn`.
        has_messenger_tag: Boolean(u.telegram_tag ?? u.slack_tag),
      }));
    }

    const qs = new URLSearchParams({ limit: String(ASSIGNABLE_USERS_LIMIT) });
    if (params.search) qs.set("search", params.search);
    for (const role of roles) qs.append("roles", role);

    const data = await bffFetch<{ users: AssignableUser[]; total?: number }>(
      `/api/users/assignable?${qs.toString()}`,
    );

    // A response without a `users` ARRAY is a broken response, not an empty
    // roster (RUK-270). Throwing makes `isError` true so the combobox renders
    // "Couldn't load people." rather than "No people found." — the distinction
    // RUK-253 built the error branch for. Mirrors the mentions hook; see its
    // comment for the 204 / non-JSON-body reasoning and the `warnOnce` ordering.
    if (!Array.isArray(data?.users)) {
      throw new Error("Malformed roster response: `users` is not an array");
    }

    // `total` counts what the FILTER matched, so on a `search` query a value
    // over the limit is expected and says nothing about the picker being
    // truncated. Only warn for the unsearched roster, which is the shape the
    // form actually uses.
    if (!params.search && (data.total ?? 0) > ASSIGNABLE_USERS_LIMIT) {
      warnOnce(
        "partial-slice",
        `[approver-picker] total=${data.total} > limit=${ASSIGNABLE_USERS_LIMIT} — ` +
          `picker shows a partial slice; server-side search needed (RUK-251)`,
      );
    }

    const returned = data.users;
    const users = returned.filter((u) => hasApproverRole(u, roles));
    // If the server filter applied, this one is a no-op by construction. Any
    // row it drops means `roles` did not reach the backend — the exact silent
    // failure that produced an empty picker (SPEC §2.4).
    if (users.length !== returned.length) {
      warnOnce(
        "filter-did-not-apply",
        "[approver-picker] server roles filter did not apply — check the query string",
      );
    }
    return users;
  };

  return useQuery({
    queryKey: assignableUsersKey(params),
    queryFn,
    staleTime: 60_000,
  });
}
