/** Wire values per the auth service swagger (guest | editor | reviewer | admin). */
export type Role = "guest" | "editor" | "reviewer" | "admin";

/**
 * Every assignable role, in the order the dev "Login as" selector lists them.
 * These are exactly the values the backend accepts in the dev-only
 * `X-Test-Roles` header (`admin`/`editor`/`reviewer`/`guest`); anything else is
 * rejected with HTTP 400, so the selector must never offer another value.
 */
export const DEV_LOGIN_ROLES = ["admin", "reviewer", "editor", "guest"] as const satisfies readonly Role[];

/** Type guard: is `value` one of the four assignable roles? */
export function isRole(value: string): value is Role {
  return (DEV_LOGIN_ROLES as readonly string[]).includes(value);
}

export function hasRole(roles: readonly string[] | undefined, role: Role): boolean {
  if (!roles || roles.length === 0) {
    return false;
  }
  return roles.includes(role);
}

export function isAdmin(roles: readonly string[] | undefined): boolean {
  return hasRole(roles, "admin");
}
