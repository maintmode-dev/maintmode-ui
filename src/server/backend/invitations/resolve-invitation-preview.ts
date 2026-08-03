import "server-only";

import { backendRequest } from "@/server/backend/client/backend-client";
import { projectInvitationPreview } from "@/server/backend/invitations/preview-projection";

/**
 * Server-side resolution of the invitation preview for `/accept-invite`.
 *
 * Shares `projectInvitationPreview` with the public BFF route
 * (`src/app/api/invitations/preview/route.ts`) rather than calling that route
 * over HTTP: the route is a thin `backendRequest` + projection wrapper, and
 * having the server fetch its own origin would reintroduce exactly the
 * round-trip this page was moved server-side to remove.
 *
 * Anti-enumeration (frozen, mirrors the route): an unknown/empty/expired token
 * is NOT distinguishable from a well-formed-but-unknown one. Every failure —
 * transport, 4xx, 5xx, malformed body — collapses into a preview status, never
 * a thrown 404. The caller renders a state; it never branches on HTTP status.
 */

/** Preview status as surfaced to the page. Mirrors `InviteStatus` minus `missing`. */
export type ResolvedInviteStatus = "valid" | "invalid" | "expired" | "accepted" | "revoked";

export interface ResolvedInvitationPreview {
  status: ResolvedInviteStatus | "missing" | "unknown_error";
  suggested_provider?: string;
}

const KNOWN_STATUSES: ReadonlySet<string> = new Set(["valid", "invalid", "expired", "accepted", "revoked"]);

function isKnownStatus(value: string): value is ResolvedInviteStatus {
  return KNOWN_STATUSES.has(value);
}

export async function resolveInvitationPreview(
  token: string | undefined,
): Promise<ResolvedInvitationPreview> {
  // A missing token can never resolve to a valid invite. Short-circuit before
  // the request so the page can show its distinct "incomplete link" copy — the
  // backend would map an empty token to `invalid`, which reads as a different
  // (and less actionable) problem to the invited user.
  if (!token || token.trim() === "") {
    return { status: "missing" };
  }

  let raw: unknown;
  try {
    raw = await backendRequest<unknown>({
      path: `/api/v1/users/invitations/preview?token=${encodeURIComponent(token)}`,
      method: "GET",
      useAuthBase: true,
      // Public route: never send credentials and never let a cached response
      // serve one invitee's preview to another.
      cache: "no-store",
    });
  } catch {
    // The equivalent of the client's `skipAuthRedirect: true`: a failed preview
    // must NOT bounce the invited user to /login — they have no session yet and
    // being redirected off an invite-acceptance page is the wrong outcome. We
    // render the retryable "couldn't verify" state on this page instead.
    //
    // This deliberately swallows the status code: surfacing 401/404/500
    // differently would hand an enumerator a signal the BFF route is careful
    // not to give.
    return { status: "unknown_error" };
  }

  const projected = projectInvitationPreview(raw);

  // Defensive: treat any unrecognized status as `invalid` rather than rendering
  // a valid-looking state for an unknown value. This is the same guarantee the
  // removed client hook made at its line 54.
  //
  // `projectInvitationPreview` already collapses unknown values, so today this
  // narrowing never actually changes a value — it is a type-level bridge from
  // the projection's `string` to our closed union, and a second line of defence
  // if that projection is ever widened. It is deliberately NOT the only place
  // the guarantee is enforced: `preview-projection.test.ts` owns the behavioural
  // coverage of unknown-status collapsing.
  const status = isKnownStatus(projected.status) ? projected.status : "invalid";

  return { status, suggested_provider: projected.suggested_provider };
}
