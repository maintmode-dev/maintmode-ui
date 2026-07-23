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

/**
 * Can this role set perform write actions (create maintenance / resource /
 * channel)? Positive check: true iff one of the write-capable roles is present.
 *
 * Authoritative matrix: `deployment/maintmode/authz/policy.csv` — `editor`,
 * `reviewer`, and `admin` hold `*.create` rights; `guest` holds none. Because
 * the backend expresses the guest→editor→reviewer→admin hierarchy as Casbin
 * inheritance (not injected into `/me`'s roles array), never gate on `guest`
 * presence or `roles.length` — check only for the roles that actually grant
 * write access.
 */
export function canWrite(roles: readonly string[] | undefined): boolean {
  return hasRole(roles, "editor") || hasRole(roles, "reviewer") || hasRole(roles, "admin");
}
