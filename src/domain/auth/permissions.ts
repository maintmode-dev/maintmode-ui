/** Wire values per the auth service swagger (guest | editor | reviewer | admin). */
export type Role = "guest" | "editor" | "reviewer" | "admin";

export function hasRole(roles: readonly string[] | undefined, role: Role): boolean {
  if (!roles || roles.length === 0) {
    return false;
  }
  return roles.includes(role);
}

export function isAdmin(roles: readonly string[] | undefined): boolean {
  return hasRole(roles, "admin");
}
