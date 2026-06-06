import type { Role } from "@/domain/auth/permissions";

export type SignInProvider = "google" | "github" | "microsoft" | "okta";

/**
 * Admin-facing user, reconciled to the auth-service contract. Blocking status
 * is carried by `blocked_at` (nullable) — there is no status enum on the wire.
 * Use `isUserBlocked` to derive the UI status.
 */
export interface User {
  id: string;
  email: string;
  display_name: string;
  roles: Role[];
  /** Provider used to sign in (e.g. "google"). */
  oauth_provider?: string;
  connected_providers: SignInProvider[];
  is_last_admin?: boolean;
  created_at: string;
  last_seen_at?: string;
  /** Non-null ISO timestamp means the account is blocked. */
  blocked_at?: string | null;
}

/** Derive UI block status from the nullable `blocked_at` timestamp. */
export function isUserBlocked(user: Pick<User, "blocked_at">): boolean {
  return Boolean(user.blocked_at);
}

/** One page of users, reconciled from auth `ListUsersResponse`. */
export interface ListUsersPage {
  users: User[];
  limit: number;
  offset: number;
  total: number;
}

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface Invitation {
  id: string;
  email: string;
  roles: Role[];
  status: InvitationStatus;
  suggested_provider?: SignInProvider;
  invited_by: string;
  invited_at: string;
  expires_at: string;
}
