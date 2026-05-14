"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Role } from "@/domain/admin/models/role";
import { bffFetch } from "@/features/_shared/api/bff-fetch";
import { adminRolesKeys } from "@/features/admin-roles/queries/query-keys";

export type RevokeRoleInput = { user_id: string; role: Role };

export function useRevokeRoleMutation() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, RevokeRoleInput>({
    mutationFn: async (input) => {
      await bffFetch<void>("/api/admin/roles/revoke", { method: "POST", body: input });
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: adminRolesKeys.userRoles(variables.user_id) });
    },
  });
}
