"use client";

import { useQuery } from "@tanstack/react-query";

import { bffFetch } from "@/features/_shared/api/bff-fetch";
import { DATA_SOURCE } from "@/features/_shared/api/data-source";
import { MOCK_USERS } from "@/shared/mock/users";
import type { AssignableUser } from "@/domain/maintenance/maintenance";

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
 * Fetch users eligible to be picked as approver
 * (`GET /api/v1/users/assignable`). Backs the approver combobox on the
 * maintenance create/edit form — defaults to the roles that can approve so
 * users without the permission never appear in the list.
 */
export function useAssignableUsersQuery(params: AssignableUsersParams = {}) {
  const roles = params.roles ?? APPROVER_ROLES;
  return useQuery({
    queryKey: assignableUsersKey(params),
    queryFn: async (): Promise<AssignableUser[]> => {
      if (DATA_SOURCE.assignableUsers === "mock") {
        const q = params.search?.trim().toLowerCase();
        return MOCK_USERS.filter(
          (u) =>
            (!q || u.display_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) &&
            u.roles.some((r) => roles.includes(r)),
        ).map((u) => ({ id: u.id, display_name: u.display_name, email: u.email, roles: u.roles }));
      }
      const qs = new URLSearchParams();
      if (params.search) qs.set("search", params.search);
      for (const role of roles) qs.append("roles", role);
      const data = await bffFetch<{ users: AssignableUser[] }>(`/api/users/assignable?${qs.toString()}`);
      // Belt-and-suspenders: also filter client-side. The backend `roles` filter
      // isn't reliably applied, so a user without an approver role could still
      // come back — never offer them as an approver.
      return data.users.filter((u) => u.roles.some((r) => roles.includes(r)));
    },
    staleTime: 60_000,
  });
}
