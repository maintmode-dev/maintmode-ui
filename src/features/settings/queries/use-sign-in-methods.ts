"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { bffFetch } from "@/features/_shared/api/bff-fetch";
import { meKey } from "@/features/_shared/queries/use-me-query";
import { toSignInMethod, type SignInMethod } from "@/domain/auth/sign-in-method";

export function signInMethodsKey() {
  return ["sign-in-methods"] as const;
}

/**
 * The instance's sign-in methods (GAP-2), for the profile's linking card.
 *
 * THROWS when the body carries no `methods` array rather than unwrapping with
 * `?? []`: an empty list here reads as "this instance offers nothing to link",
 * which is a statement about the instance the backend never made.
 */
export function useSignInMethodsQuery() {
  return useQuery({
    queryKey: signInMethodsKey(),
    queryFn: async (): Promise<SignInMethod[]> => {
      const data = await bffFetch<{ methods?: unknown }>("/api/sign-in-methods");
      if (!Array.isArray(data?.methods)) {
        throw new Error("The sign-in methods response carried no list");
      }
      // Through the same parser /login uses, so a malformed entry is dropped
      // and an unknown type is `unsupported` here too.
      return data.methods.map(toSignInMethod).filter((m): m is SignInMethod => m !== null);
    },
    staleTime: 60_000,
  });
}

/**
 * Starts linking a provider: asks the BFF for the backend's link URL, then
 * LEAVES the page for it.
 *
 * A top-level navigation, never a `fetch` — the dance cookies are SameSite=Lax,
 * and the provider's consent screen is a page the person has to see. `assign`
 * rather than `replace`, so the back button returns here if they change their
 * mind at the provider. Nothing is invalidated: the outcome comes back as a new
 * page load (`/settings/profile?linked=1`), which refetches everything.
 */
export function useConnectProvider() {
  return useMutation({
    mutationFn: (providerId: string) =>
      bffFetch<{ url: string }>(`/api/me/providers/${encodeURIComponent(providerId)}/connect`, {
        method: "POST",
      }),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
  });
}

/** Unlinks a provider; the list of connected ones lives on `/me`. */
export function useDisconnectProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (providerId: string): Promise<void> => {
      await bffFetch<void>(`/api/me/providers/${encodeURIComponent(providerId)}`, { method: "DELETE" });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: meKey() });
    },
  });
}
