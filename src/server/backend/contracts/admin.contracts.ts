import type { Role } from "@/domain/admin/models/role";

export type BackendRolesResponseDto = {
  roles: Role[];
};

export type BackendUserRolesResponseDto = {
  roles: Role[];
};

export type BackendRoleMutationRequestDto = {
  user_id: string;
  role: Role;
};
