import type { Role } from "@/domain/admin/models/role";

export function hasRole(roles: readonly string[] | undefined, role: Role): boolean {
  if (!roles || roles.length === 0) {
    return false;
  }
  return roles.includes(role);
}

export function isAdmin(roles: readonly string[] | undefined): boolean {
  return hasRole(roles, "admin");
}
