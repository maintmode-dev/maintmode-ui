"use client";

import { useQuery } from "@tanstack/react-query";

import type { Role } from "@/domain/admin/models/role";
import { bffFetch } from "@/features/_shared/api/bff-fetch";
import { adminRolesKeys } from "@/features/admin-roles/queries/query-keys";

export type UserRolesResponse = { roles: Role[] };

export function useUserRolesQuery(userId: string) {
  return useQuery({
    queryKey: adminRolesKeys.userRoles(userId),
    queryFn: async ({ signal }) =>
      bffFetch<UserRolesResponse>(`/api/admin/users/${encodeURIComponent(userId)}/roles`, {
        method: "GET",
        signal,
      }),
    enabled: Boolean(userId),
    staleTime: 30 * 1000,
  });
}
