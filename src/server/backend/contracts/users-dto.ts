/**
 * Backend wire contracts for the auth-service admin endpoints (users + roles),
 * transcribed from the `auth` swagger. Base URL = `MAINTMODE_AUTH_API_BASE_URL`.
 *
 * SERVER-ONLY: these live under `src/server/backend/**` and are consumed only by
 * `./users-mapper.ts` and the admin BFF routes. Browser code never imports them —
 * it sees the domain shapes in `src/domain/**` (enforced by check-boundaries).
 *
 * Blocking status is carried by `blocked_at` (nullable), NOT a status enum.
 */

/** Auth `User`. */
export interface AuthUserDto {
  id: string;
  display_name?: string;
  email?: string;
  oauth_provider?: string;
  roles?: string[];
  connected_providers?: string[];
  created_at?: string;
  last_seen_at?: string;
  /** Nullable: non-null ISO timestamp means the account is blocked. */
  blocked_at?: string | null;
  is_last_admin?: boolean;
}

/** Auth `ListUsersResponse`. */
export interface ListUsersResponseDto {
  users?: AuthUserDto[];
  limit?: number;
  offset?: number;
  total?: number;
}

/**
 * Auth `ListRolesResponse`. `Role` is a plain string enum on the wire
 * (`guest | editor | reviewer | admin`), so `roles` is `string[]`, NOT an
 * array of objects.
 */
export interface ListRolesResponseDto {
  roles?: string[];
}
