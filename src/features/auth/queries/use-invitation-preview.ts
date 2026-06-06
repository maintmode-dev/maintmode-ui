"use client";

import { useQuery } from "@tanstack/react-query";

import { bffFetch, BffError } from "@/features/_shared/api/bff-fetch";

/**
 * Privacy-safe preview status as reported by the auth backend
 * (`InvitationPreviewStatus`): a live pending invite is `valid`; an
 * unknown/empty/unverifiable token is `invalid`; the lifecycle states surface
 * as themselves. The backend never returns email, roles, or inviter here.
 *
 * `missing` is a FRONTEND-only sentinel for "no token in the URL at all" — the
 * backend would map an empty token to `invalid`, but we short-circuit before
 * the request so the page can show a distinct "incomplete link" message.
 */
export type InviteStatus = "valid" | "invalid" | "expired" | "accepted" | "revoked" | "missing";

/** Provider hint values the BE may suggest; `google` is the only one wired today. */
export type SuggestedProvider = "google" | "github";

export interface InvitationPreview {
  status: InviteStatus;
  /** Suggested sign-in provider; the only field we surface from a valid invite. */
  suggested_provider?: SuggestedProvider;
}

const KNOWN_STATUSES: ReadonlySet<string> = new Set(["valid", "invalid", "expired", "accepted", "revoked"]);

export function invitationPreviewKey(token: string | undefined) {
  return ["invitation-preview", token ?? ""] as const;
}

/**
 * Frozen tone: the response surfaces ONLY `status` and (when valid) the
 * suggested provider. The BFF route re-projects the backend payload to exactly
 * those two fields, so email/roles/inviter cannot leak to an unauthenticated
 * caller even if the backend shape changes.
 */
export function useInvitationPreview(token: string | undefined) {
  return useQuery({
    queryKey: invitationPreviewKey(token),
    enabled: token !== undefined,
    queryFn: async (): Promise<InvitationPreview> => {
      if (!token) {
        return { status: "missing" };
      }
      const data = await bffFetch<InvitationPreview>(
        `/api/invitations/preview?token=${encodeURIComponent(token)}`,
        { skipAuthRedirect: true },
      );
      // Defensive: treat any unrecognized status as `invalid` rather than
      // rendering a valid-looking state for an unknown value.
      const status = KNOWN_STATUSES.has(data.status) ? data.status : "invalid";
      return { status, suggested_provider: data.suggested_provider };
    },
    retry: (failureCount, error) => {
      // Don't retry 4xx — they're terminal classifications.
      if (error instanceof BffError && error.status >= 400 && error.status < 500) {
        return false;
      }
      return failureCount < 1;
    },
    staleTime: 30_000,
  });
}
