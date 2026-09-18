"use client";

import { useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";

import { bffFetch } from "@/features/_shared/api/bff-fetch";
import type { AuthMethod } from "@/domain/auth/auth-method-settings";

export function authMethodsKey() {
  return ["auth-methods"] as const;
}

/**
 * The built-in sign-in methods and their flags.
 *
 * ## Why an empty list throws instead of rendering as empty
 *
 * The backend's migration seeds a row per built-in method, so the list always
 * holds them; zero rows means the table is not in the state it should be.
 * `useIntegrationsQuery` unwraps its envelope with `data.integrations ?? []`,
 * and copying that idiom here would convert this fault into a perfectly
 * ordinary empty screen — telling an operator that no sign-in method exists,
 * on the one screen whose job is to report that truthfully.
 */
export function useAuthMethodsQuery() {
  return useQuery({
    queryKey: authMethodsKey(),
    /**
     * No retry, deliberately.
     *
     * Every way this read fails is a standing condition, not a blip: the
     * endpoint is missing because the backend has not shipped yet (404), the
     * caller is not an admin (403), or the table is not seeded (the throw
     * below). Retrying buys nothing and costs the operator the error state —
     * a paused or retrying query renders as "loading", so the screen sits on a
     * skeleton instead of saying what is wrong. Observed in the browser against
     * a backend without the endpoint: `fetchStatus: "paused"`, forever.
     */
    retry: false,
    queryFn: async (): Promise<AuthMethod[]> => {
      const data = await bffFetch<{ methods?: AuthMethod[] }>("/api/admin/auth-methods");
      const methods = data?.methods;
      if (!Array.isArray(methods) || methods.length === 0) {
        throw new Error(
          "The backend returned no sign-in methods. They are seeded by migration, so this means the auth_settings table is not in the state it should be.",
        );
      }
      return methods;
    },
  });
}

const TOGGLE_MUTATION_KEY = ["auth-methods-toggle"] as const;

type SetEnabledVars = { method: string; enabled: boolean };

/**
 * Set one method's flag. Optimistic, with the switch rolling back on refusal.
 *
 * ## Deliberately not a copy of `useToggleIntegration`
 *
 * That hook stores the prior value as a scalar and gates its rollback on
 * `previousEnabled !== undefined`. A row missing from the cache produces
 * `undefined`, the guard skips the restore, and the switch stays where the
 * optimistic write left it — telling the operator a method is off that the
 * backend just refused to turn off. There every row comes from the list, so it
 * never fires. Here the screen deliberately renders methods it does not know,
 * and a `404` on one of those is the expected outcome — the exact path that
 * hook gets wrong.
 *
 * So the snapshot is the ROWS, restored wholesale for this method: a row that
 * was absent stays absent, a row that was present comes back as it was, and
 * neither depends on a sentinel value being distinguishable from a real one.
 *
 * Rollback stays per-row rather than restoring the whole list, which would
 * clobber another method's in-flight optimistic flip.
 */
export function useSetAuthMethodEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: TOGGLE_MUTATION_KEY,
    mutationFn: ({ method, enabled }: SetEnabledVars): Promise<AuthMethod> =>
      bffFetch<AuthMethod>(`/api/admin/auth-methods/${encodeURIComponent(method)}`, {
        method: "PATCH",
        // The TARGET state, not a flip: a retried or double-submitted request
        // converges instead of re-opening a method just closed.
        body: JSON.stringify({ enabled }),
      }),
    onMutate: async ({ method, enabled }) => {
      await queryClient.cancelQueries({ queryKey: authMethodsKey() });
      const rows = queryClient.getQueryData<AuthMethod[]>(authMethodsKey());
      const previous = rows?.find((m) => m.method === method);
      queryClient.setQueryData<AuthMethod[]>(authMethodsKey(), (list) =>
        (list ?? []).map((m) => (m.method === method ? { ...m, enabled } : m)),
      );
      // `null` means "there was no such row", which is a different fact from
      // "there was a row and its value was undefined". Conflating the two is
      // what makes the integrations rollback skip.
      return { previous: previous ?? null };
    },
    // Present so a failure counts as HANDLED. Without an `onError` on the
    // mutation itself, React Query still rejects the promise `mutate` drives
    // and the failure surfaces as unhandled — even though the screen is
    // displaying it. The operator-facing copy stays in the component; this hook
    // only restores state.
    onError: (_error, { method }, context) => {
      const previous = context?.previous;
      if (!previous) {
        // There was no such row to begin with; there is nothing to put back,
        // and the optimistic write could not have touched anything either.
        return;
      }
      // REPLACE the row with its snapshot rather than spreading over it. A
      // spread only overwrites the keys the snapshot happens to carry, so a row
      // whose `enabled` was absent would keep the optimistic value — the very
      // failure this rollback exists to prevent, wearing a different hat.
      queryClient.setQueryData<AuthMethod[]>(authMethodsKey(), (list) =>
        (list ?? []).map((m) => (m.method === method ? previous : m)),
      );
    },
    onSettled: () => {
      // The settling mutation is still counted, hence > 1 for "others pending".
      if (queryClient.isMutating({ mutationKey: TOGGLE_MUTATION_KEY }) > 1) {
        return;
      }
      queryClient.invalidateQueries({ queryKey: authMethodsKey() });
    },
  });
}

/**
 * Methods with a toggle in flight — drives per-row switch disabling.
 *
 * Read from the mutation cache rather than a single mutation's `variables`,
 * which only reflects its latest call and would report one row while another
 * is still travelling.
 */
export function usePendingAuthMethods(): Set<string> {
  const pending = useMutationState({
    filters: { mutationKey: TOGGLE_MUTATION_KEY, status: "pending" },
    // `variables` is undefined before a mutation's first execution on some
    // React Query paths, and `.method` on that would throw inside a selector —
    // taking the whole screen down to disable a switch.
    select: (mutation) => (mutation.state.variables as SetEnabledVars | undefined)?.method,
  });
  return new Set(pending.filter((method): method is string => method !== undefined));
}
