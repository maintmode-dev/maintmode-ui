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
  /**
   * IANA timezone the user chose for rendering event windows (e.g.
   * "Asia/Nicosia"). `null`/absent means "not chosen" → the UI falls back to the
   * browser's autodetected zone. Populated by RUK-202 (`GET /me`); the field is
   * optional so the FE tolerates the pre-RUK-202 wire that omits it entirely.
   */
  timezone?: string | null;
  /**
   * Telegram handle used to name this person in notification text (RUK-217).
   * Stored **verbatim**, including any leading `@` — `@username` and `username` are
   * distinct values and are never normalized into each other.
   *
   * Required and nullable on purpose (SPEC §1.1): the wire has three shapes for
   * "no tag" — `null` from `GET/PATCH /me`, an absent key from the `omitempty`
   * admin list, and an absent key again from the admin `PATCH` response. The
   * mapper collapses all three into `null`; declaring the field `?:` *and*
   * `| null` would reintroduce exactly the asymmetry the mapper exists to erase.
   */
  telegram_tag: string | null;
  /**
   * Slack handle used to name this person in notification text (RUK-217).
   * Same contract as {@link User.telegram_tag}: stored verbatim (leading `@`
   * kept), required and nullable — see SPEC §1.1.
   */
  slack_tag: string | null;
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

export type InvitationStatus = "pending" | "expired" | "accepted" | "revoked";

/**
 * Mirrors the auth-service `Invitation` (swagger `auth`,
 * `GET /api/v1/users/invitations`). `inviter` is a `UserSummary`
 * `{ id, email?, display_name? }` — the field was `invited_by: { id, handle }`
 * before the auth swagger update; `sent_at` is when the invite was issued and
 * `accepted_at` is present only once a recipient claims it.
 */
export interface Invitation {
  id: string;
  email: string;
  roles: Role[];
  status: InvitationStatus;
  sent_at: string;
  accepted_at?: string;
  expires_at: string;
  inviter: InvitationActor;
}

/** Inviter `UserSummary` from the auth service; fields may be empty/absent. */
export interface InvitationActor {
  id: string;
  email?: string;
  display_name?: string;
}

/**
 * Display handle for an inviter, degrading like the backend's `InviterHandle`:
 * `display_name` → email local-part → `Unknown user`. Never renders blank, and
 * tolerates a missing `inviter` (defensive against backend shape drift).
 */
export function inviterHandle(inviter: InvitationActor | undefined | null): string {
  const name = inviter?.display_name?.trim();
  if (name) return name;
  const local = inviter?.email?.split("@")[0]?.trim();
  if (local) return local;
  return "Unknown user";
}

/** Body for `POST /api/v1/users/invite` (`CreateInvitationRequest`). */
export interface CreateInvitationRequest {
  email: string;
  roles: Role[];
}

/** `201 CreateInvitationResponse` from `POST /api/v1/users/invite`. */
export interface CreateInvitationResponse {
  invitation_id: string;
  email: string;
  roles: Role[];
  status: InvitationStatus;
  expires_at: string;
}
