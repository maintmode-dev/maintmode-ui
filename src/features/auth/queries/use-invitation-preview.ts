"use client";

import { useQuery } from "@tanstack/react-query";

import { bffFetch, BffError } from "@/features/_shared/api/bff-fetch";
import { DATA_SOURCE } from "@/features/_shared/api/data-source";

export type InviteStatus = "valid" | "expired" | "revoked" | "already_used" | "missing" | "unknown_error";

export interface InvitationPreview {
  status: InviteStatus;
  /** Suggested sign-in provider; the only field we surface from a valid invite. */
  suggested_provider?: "google" | "github" | "microsoft" | "okta";
}

/**
 * Frozen tone: the response surfaces ONLY `status` and (when valid) the
 * suggested provider. The BFF must NOT leak email, roles, or the inviter
 * name to an unauthenticated caller.
 *
 * Today the data source is mocked (RUK-94). The mock matches the literal
 * token strings `expired` / `revoked` / `used` / `missing` so local
 * `/accept-invite?token=expired` UX works end-to-end. Any other non-empty
 * token resolves to `valid`. When RUK-94 lands flip the flag in
 * `data-source.ts` and the hook switches to a real GET.
 */
export function invitationPreviewKey(token: string | undefined) {
  return ["invitation-preview", token ?? ""] as const;
}

export function useInvitationPreview(token: string | undefined) {
  return useQuery({
    queryKey: invitationPreviewKey(token),
    enabled: token !== undefined,
    queryFn: async (): Promise<InvitationPreview> => {
      if (!token) {
        return { status: "missing" };
      }
      if (DATA_SOURCE.invitations === "mock") {
        if (token === "expired") return { status: "expired" };
        if (token === "revoked") return { status: "revoked" };
        if (token === "used") return { status: "already_used" };
        return { status: "valid", suggested_provider: "google" };
      }
      return bffFetch<InvitationPreview>(`/api/invitations/preview/${encodeURIComponent(token)}`, {
        skipAuthRedirect: true,
      });
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
