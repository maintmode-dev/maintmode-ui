"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { bffFetch, BffError } from "@/features/_shared/api/bff-fetch";
import type { User } from "@/domain/admin/user";

/**
 * Hydrate the current user from the BFF `/api/me` route. This query is the
 * only authoritative source of identity in the browser — there is NO
 * client-side fallback to a mock user. Consequences:
 *
 *  - 401 with `code: "AUTH_REQUIRED"` triggers the redirect-to-login flow
 *    inside `bffFetch`, which returns a NEVER-RESOLVING promise so the
 *    in-flight render does not flash an error component before the browser
 *    navigates away. The hook stays in `isPending` until the navigation
 *    completes.
 *  - Other failures (4xx other than 401, 5xx, network) propagate as
 *    `BffError` to the consumer, which should render an anonymous chrome
 *    (no admin links, no user identity) rather than guess a role.
 *
 * Consumers MUST NOT use `data ?? mockUser`. Either show a skeleton, render
 * anonymous chrome, or redirect.
 */
export function meKey() {
  return ["me"] as const;
}

export function useMeQuery() {
  return useQuery({
    queryKey: meKey(),
    queryFn: () => bffFetch<User>("/api/me"),
    staleTime: 60_000,
    retry: (failureCount, error) => {
      if (error instanceof BffError && (error.status === 401 || error.status === 403)) {
        return false;
      }
      return failureCount < 1;
    },
  });
}

/**
 * Update the current user's timezone preference (RUK-201) via `PATCH /api/me`.
 * Pass an IANA id (e.g. "Asia/Nicosia") or `null` to reset to browser
 * autodetect. On success the backend returns the updated user; we seed the
 * `["me"]` cache with it so `useTimezone` (and the profile) reflect the change
 * immediately without a refetch round-trip.
 */
export function useUpdateTimezone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (timezone: string | null): Promise<User> =>
      bffFetch<User>("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ timezone }),
      }),
    onSuccess: (user) => {
      queryClient.setQueryData(meKey(), user);
    },
  });
}
