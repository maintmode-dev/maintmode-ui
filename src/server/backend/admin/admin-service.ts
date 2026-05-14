import "server-only";

import type { Role } from "@/domain/admin/models/role";
import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import type {
  BackendRoleMutationRequestDto,
  BackendRolesResponseDto,
  BackendUserRolesResponseDto,
} from "@/server/backend/contracts/admin.contracts";

export async function loadRolesCatalog(): Promise<Role[]> {
  const response = await authenticatedBackendRequest<BackendRolesResponseDto>({
    method: "GET",
    path: "/api/v1/roles",
    useAuthBase: true,
  });
  return response.roles ?? [];
}

export async function loadUserRoles(userId: string): Promise<Role[]> {
  const response = await authenticatedBackendRequest<BackendUserRolesResponseDto>({
    method: "GET",
    path: `/api/v1/user/${encodeURIComponent(userId)}/roles`,
    useAuthBase: true,
  });
  return response.roles ?? [];
}

export async function assignRole(payload: BackendRoleMutationRequestDto): Promise<void> {
  await authenticatedBackendRequest<void>({
    method: "POST",
    path: "/api/v1/roles/assign",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    useAuthBase: true,
  });
}

export async function revokeRole(payload: BackendRoleMutationRequestDto): Promise<void> {
  await authenticatedBackendRequest<void>({
    method: "POST",
    path: "/api/v1/roles/revoke",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    useAuthBase: true,
  });
}
