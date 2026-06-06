"use client";

import { useQuery } from "@tanstack/react-query";

import { bffFetch } from "@/features/_shared/api/bff-fetch";
import { DATA_SOURCE } from "@/features/_shared/api/data-source";
import { MOCK_USERS } from "@/shared/mock/users";
import type { AssignableUser } from "@/domain/maintenance/maintenance";

export interface AssignableUsersParams {
  /** Free-text filter on name/email; debounce at the call site. */
  search?: string;
}

export function assignableUsersKey(params: AssignableUsersParams) {
  return ["assignable-users", params.search ?? ""] as const;
}

/**
 * Fetch users eligible to be picked as approver
 * (`GET /api/v1/users/assignable`). Backs the approver combobox on the
 * maintenance create/edit form.
 */
export function useAssignableUsersQuery(params: AssignableUsersParams = {}) {
  return useQuery({
    queryKey: assignableUsersKey(params),
    queryFn: async (): Promise<AssignableUser[]> => {
      if (DATA_SOURCE.assignableUsers === "mock") {
        const q = params.search?.trim().toLowerCase();
        return MOCK_USERS.filter(
          (u) => !q || u.display_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
        ).map((u) => ({ id: u.id, display_name: u.display_name, email: u.email, roles: u.roles }));
      }
      const qs = params.search ? `?search=${encodeURIComponent(params.search)}` : "";
      const data = await bffFetch<{ users: AssignableUser[] }>(`/api/users/assignable${qs}`);
      return data.users;
    },
    staleTime: 60_000,
  });
}
