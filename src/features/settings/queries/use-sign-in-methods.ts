"use client";

import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { bffFetch } from "@/features/_shared/api/bff-fetch";
import { meKey } from "@/features/_shared/queries/use-me-query";
import { toSignInMethod, type SignInMethod } from "@/domain/auth/sign-in-method";

export function signInMethodsKey() {
  return ["sign-in-methods"] as const;
}

/**
 * How long after a sign-in PROVIDER change to read `/login`'s list once more.
 *
 * The two halves of that list are refreshed differently on the backend:
 *
 * - Built-in methods are read from the database on every request
 *   (`providers_list.go` → `offeredBuiltIns` → `authSettings.List`), so the
 *   list is current as soon as the PATCH has answered. No delay needed.
 * - Providers come from an in-memory snapshot that a background loop rebuilds.
 *   A committed registry write only SIGNALS that loop
 *   (`authmethod/reloader.go`, `OnIntegrationChanged` → `signal()`), and the
 *   rebuild runs in its own goroutine after the write's response has gone out.
 *   A refetch fired on success usually beats it and reads the old list.
 *
 * The rebuild reads the registry and touches no network, so it normally
 * finishes in milliseconds; this margin covers a slow one. If it is missed
 * anyway, the backend's own 30-second tick converges, and the next read shows it.
 */
export const PROVIDER_RELOAD_FOLLOW_UP_MS = 1500;

/**
 * Marks `/login`'s list stale after a write that changes what it offers, so the
 * admin preview strip (and the profile's linking card) re-read it.
 *
 * Called by the write hooks themselves — the built-in method toggle and the
 * login-provider writes — rather than by a page, so every screen that performs
 * such a write keeps the list honest without knowing it exists.
 *
 * `providerChanged` adds ONE delayed re-read for the asynchronous provider
 * snapshot (see `PROVIDER_RELOAD_FOLLOW_UP_MS`). The immediate one stays: it is
 * what makes a built-in change show at once, and for a provider it is right
 * whenever the rebuild was quick.
 */
export function refreshSignInMethods(
  queryClient: QueryClient,
  { providerChanged = false }: { providerChanged?: boolean } = {},
): void {
  void queryClient.invalidateQueries({ queryKey: signInMethodsKey() });
  if (providerChanged) {
    setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: signInMethodsKey() });
    }, PROVIDER_RELOAD_FOLLOW_UP_MS);
  }
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
