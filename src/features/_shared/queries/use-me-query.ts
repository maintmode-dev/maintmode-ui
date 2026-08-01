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

/**
 * `enabled: false` keeps the request from being made at all — for callers that
 * mount where there is no session to fetch. Needed because a 401 here is not
 * inert: `bffFetch` answers `AUTH_REQUIRED` by navigating to
 * `/login?next=<path>`, so asking from a public page like `/login` is an infinite
 * refresh loop, not a failed query. Callers that only mount behind the auth gate
 * should leave it alone.
 */
export function useMeQuery({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: meKey(),
    queryFn: () => bffFetch<User>("/api/me"),
    enabled,
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
 *
 * Deliberately single-field: the body is built from the scalar argument alone,
 * so it can only ever contain `timezone`. Do NOT generalise this and
 * `useUpdateMyTags` into one partial-`/me` mutation over a draft object — the
 * moment a shared builder spreads a draft, every timezone change would also
 * send `telegram_tag`/`slack_tag` and wipe both tags (SPEC §7, §8).
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

/** Keys the caller actually changed. Absent key = "don't touch that tag". */
export type UpdateMyTagsArgs = {
  telegram_tag?: string | null;
  slack_tag?: string | null;
};

/**
 * Update the current user's messenger tags (RUK-217) via `PATCH /api/me`.
 *
 * **The caller decides which keys to send; this hook forwards the object
 * verbatim** — it never adds, defaults, or drops a key. That is the whole
 * contract (SPEC §1.1):
 *
 *  - key ABSENT → the backend leaves that tag alone;
 *  - key present as `null` (or `""`) → the backend CLEARS that tag;
 *  - key present with a stale value → it OVERWRITES whatever the tag holds
 *    now, silently clobbering a concurrent edit.
 *
 * So a card that only edited Telegram must send `{ telegram_tag }` alone, not
 * a spread of its whole draft. See the sibling `useUpdateTimezone` comment for
 * why the two hooks stay separate.
 *
 * No toast here — the calling card owns messaging. On success the backend
 * returns the updated user, so we seed the `["me"]` cache with it directly.
 */
export function useUpdateMyTags() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: UpdateMyTagsArgs): Promise<User> =>
      bffFetch<User>("/api/me", {
        method: "PATCH",
        body: JSON.stringify(args),
      }),
    onSuccess: (user) => {
      queryClient.setQueryData(meKey(), user);
    },
  });
}
