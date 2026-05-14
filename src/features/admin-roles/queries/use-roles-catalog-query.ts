"use client";

import { useQuery } from "@tanstack/react-query";

import type { Role } from "@/domain/admin/models/role";
import { bffFetch } from "@/features/_shared/api/bff-fetch";
import { adminRolesKeys } from "@/features/admin-roles/queries/query-keys";

type RolesCatalogResponse = { roles: Role[] };

export function useRolesCatalogQuery() {
  return useQuery({
    queryKey: adminRolesKeys.catalog(),
    queryFn: async ({ signal }) =>
      bffFetch<RolesCatalogResponse>("/api/admin/roles", { method: "GET", signal }),
    staleTime: 30 * 60 * 1000,
  });
}
