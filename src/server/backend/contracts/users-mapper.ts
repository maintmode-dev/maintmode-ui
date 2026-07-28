/**
 * Centralized auth-service → domain mappers for the admin users + roles paths
 * (D-2: all BE↔UI mapping lives in `src/server/backend/**`). Pure, server-only
 * functions invoked from the admin BFF routes; the browser never sees the wire
 * shapes in `./users-dto.ts`.
 *
 * Reconciliation handled here:
 *  - roles    : whitelisted against `guest | editor | reviewer | admin`.
 *  - providers: whitelisted against the `SignInProvider` union; unknown dropped.
 *  - blocking : `blocked_at` carried through nullable (no status enum).
 *  - tags     : `telegram_tag`/`slack_tag` normalized to `string | null`, which
 *               erases the wire's three shapes for "unset" (SPEC §1.1).
 */

import type { Role } from "@/domain/auth/permissions";
import type { ListUsersPage, SignInProvider, User } from "@/domain/admin/user";

import type { AuthUserDto, ListRolesResponseDto, ListUsersResponseDto } from "./users-dto";

const ROLES = new Set<Role>(["guest", "editor", "reviewer", "admin"]);
const PROVIDERS = new Set<SignInProvider>(["google", "github", "microsoft", "okta"]);

/** Keep only wire role strings that are valid domain roles. */
export function mapRoles(roles: readonly string[] | undefined): Role[] {
  if (!roles) {
    return [];
  }
  return roles.filter((r): r is Role => ROLES.has(r as Role));
}

/** Keep only wire provider strings that are valid domain providers. */
function mapProviders(providers: readonly string[] | undefined): SignInProvider[] {
  if (!providers) {
    return [];
  }
  return providers.filter((p): p is SignInProvider => PROVIDERS.has(p as SignInProvider));
}

/** Auth `User` → domain `User`. */
export function mapUser(dto: AuthUserDto): User {
  return {
    id: dto.id,
    email: dto.email ?? "",
    display_name: dto.display_name ?? dto.email ?? "Unknown user",
    roles: mapRoles(dto.roles),
    oauth_provider: dto.oauth_provider,
    connected_providers: mapProviders(dto.connected_providers),
    is_last_admin: dto.is_last_admin,
    created_at: dto.created_at ?? "",
    last_seen_at: dto.last_seen_at,
    // Normalize an empty string to null so `isUserBlocked` reads cleanly.
    blocked_at: dto.blocked_at || null,
    // Messenger tags: `/me` sends `null`, the admin list omits the key entirely
    // (`omitempty`). Collapse absent/null/"" into a single `null` so the domain
    // has one representation of "not set" (SPEC §1.1). Non-empty values pass
    // through verbatim — a leading `@` is part of the value, never stripped.
    telegram_tag: dto.telegram_tag || null,
    slack_tag: dto.slack_tag || null,
  };
}

/** Auth `ListUsersResponse` → domain paginated page. */
export function mapUsersPage(dto: ListUsersResponseDto): ListUsersPage {
  const users = (dto.users ?? []).map(mapUser);
  return {
    users,
    limit: dto.limit ?? users.length,
    offset: dto.offset ?? 0,
    total: dto.total ?? users.length,
  };
}

/** Auth `ListRolesResponse` → domain role list (whitelisted). */
export function mapRolesList(dto: ListRolesResponseDto): Role[] {
  return mapRoles(dto.roles);
}
