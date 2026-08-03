/**
 * Browser-side types for the `/accept-invite` invitation preview.
 *
 * These deliberately live in the feature layer rather than being imported from
 * `src/server/backend/invitations/*`: `scripts/check-boundaries.mjs` forbids
 * `src/features/**` from importing `@/server/**`, and the page component is a
 * client component. The server resolver produces values that satisfy these
 * types; the page narrows what it receives.
 */

/**
 * Privacy-safe preview status as reported by the auth backend
 * (`InvitationPreviewStatus`): a live pending invite is `valid`; an
 * unknown/empty/unverifiable token is `invalid`; the lifecycle states surface
 * as themselves. The backend never returns email, roles, or inviter here.
 *
 * `missing` is a FRONTEND-only sentinel for "no token in the URL at all" — the
 * backend would map an empty token to `invalid`, but the server resolver
 * short-circuits before the request so the page can show a distinct
 * "incomplete link" message.
 */
export type InviteStatus = "valid" | "invalid" | "expired" | "accepted" | "revoked" | "missing";

/** Provider hint values the BE may suggest; `google` is the only one wired today. */
export type SuggestedProvider = "google" | "github";
