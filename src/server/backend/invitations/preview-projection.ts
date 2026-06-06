import "server-only";

/**
 * Privacy-safe projection of the auth backend's invitation preview payload.
 *
 * The public `/accept-invite` flow must never expose email, roles, or inviter
 * to an unauthenticated caller. The backend already returns only
 * `{ status, suggested_provider }`, but we re-project here so a future backend
 * change cannot accidentally widen the public surface. Any unrecognized or
 * missing status collapses to `invalid` rather than rendering a valid-looking
 * state.
 */
export interface PublicInvitationPreview {
  status: string;
  suggested_provider?: string;
}

const KNOWN_STATUSES: ReadonlySet<string> = new Set(["valid", "invalid", "expired", "accepted", "revoked"]);

export function projectInvitationPreview(raw: unknown): PublicInvitationPreview {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const rawStatus = record.status;
  const status = typeof rawStatus === "string" && KNOWN_STATUSES.has(rawStatus) ? rawStatus : "invalid";

  const rawProvider = record.suggested_provider;
  const suggestedProvider = typeof rawProvider === "string" ? rawProvider : undefined;

  return { status, suggested_provider: suggestedProvider };
}
