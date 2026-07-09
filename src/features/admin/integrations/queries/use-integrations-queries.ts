"use client";

import { useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { bffFetch, BffError } from "@/features/_shared/api/bff-fetch";
import type {
  CreateIntegrationInput,
  Integration,
  IntegrationKind,
  UpdateIntegrationInput,
} from "@/domain/admin/integration";

export function integrationsKey() {
  return ["integrations"] as const;
}

/**
 * The whole registry in one query — three kinds max, so no paging. Kinds
 * missing from the response are simply not configured yet.
 */
export function useIntegrationsQuery() {
  return useQuery({
    queryKey: integrationsKey(),
    queryFn: async (): Promise<Integration[]> => {
      const data = await bffFetch<{ integrations: Integration[] }>("/api/admin/integrations");
      return data.integrations ?? [];
    },
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: integrationsKey() });
}

/**
 * Create an integration. 409 = the kind already exists (someone configured it
 * concurrently) — surfaced as a specific toast; the list refetch flips the
 * row to Configured so the next open lands in edit mode.
 */
export function useCreateIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateIntegrationInput): Promise<Integration> =>
      bffFetch<Integration>("/api/admin/integrations", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      toast.success(`${data.kind} integration connected`);
      invalidate(queryClient);
    },
    onError: (error: unknown, { kind }) => {
      if (error instanceof BffError && error.status === 409) {
        toast.error(`${kind} is already set up. Edit the existing connection instead.`);
        invalidate(queryClient);
        return;
      }
      if (error instanceof BffError && error.status === 400) {
        toast.error(`Couldn't connect ${kind}: ${error.message}`);
        return;
      }
      toast.error(`Couldn't connect ${kind}. Try again.`);
    },
  });
}

/** Update config/enabled/secrets. Untouched secrets never leave the client. */
export function useUpdateIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      kind,
      body,
    }: {
      kind: IntegrationKind;
      body: UpdateIntegrationInput;
    }): Promise<Integration> =>
      bffFetch<Integration>(`/api/admin/integrations/${kind}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      toast.success(`${data.kind} integration updated`);
      invalidate(queryClient);
    },
    onError: (error: unknown, { kind }) => {
      if (error instanceof BffError && error.status === 400) {
        toast.error(`Couldn't save ${kind}: ${error.message}`);
        return;
      }
      toast.error(`Couldn't save ${kind}. Try again.`);
    },
  });
}

const TOGGLE_MUTATION_KEY = ["integrations-toggle"] as const;

/**
 * Flip enabled from the list row. Optimistic: the switch moves immediately
 * and rolls back if the backend rejects the toggle.
 *
 * Concurrency: rollback is per-kind (restoring a whole-list snapshot would
 * clobber another kind's in-flight optimistic flip), and the settle-time
 * refetch is skipped while other toggles are still pending — the last one to
 * finish reconciles with server truth.
 */
export function useToggleIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: TOGGLE_MUTATION_KEY,
    mutationFn: ({ kind, enabled }: { kind: IntegrationKind; enabled: boolean }): Promise<Integration> =>
      bffFetch<Integration>(`/api/admin/integrations/${kind}/toggle`, {
        method: "POST",
        body: JSON.stringify({ enabled }),
      }),
    onMutate: async ({ kind, enabled }) => {
      await queryClient.cancelQueries({ queryKey: integrationsKey() });
      const previousEnabled = queryClient
        .getQueryData<Integration[]>(integrationsKey())
        ?.find((i) => i.kind === kind)?.enabled;
      queryClient.setQueryData<Integration[]>(integrationsKey(), (list) =>
        (list ?? []).map((i) => (i.kind === kind ? { ...i, enabled } : i)),
      );
      return { previousEnabled };
    },
    onError: (_error, { kind }, context) => {
      if (context?.previousEnabled !== undefined) {
        const previousEnabled = context.previousEnabled;
        queryClient.setQueryData<Integration[]>(integrationsKey(), (list) =>
          (list ?? []).map((i) => (i.kind === kind ? { ...i, enabled: previousEnabled } : i)),
        );
      }
      toast.error(`Couldn't toggle ${kind}. Try again.`);
    },
    onSettled: () => {
      // The settling mutation is still counted, hence > 1 for "others pending".
      if (queryClient.isMutating({ mutationKey: TOGGLE_MUTATION_KEY }) > 1) {
        return;
      }
      invalidate(queryClient);
    },
  });
}

/**
 * Kinds with a toggle currently in flight — drives per-row switch disabling.
 * A single mutation instance's `variables` only reflects its latest call, so
 * concurrent toggles need the mutation cache as the source of truth.
 */
export function usePendingToggleKinds(): Set<IntegrationKind> {
  const pending = useMutationState({
    filters: { mutationKey: TOGGLE_MUTATION_KEY, status: "pending" },
    select: (mutation) => (mutation.state.variables as { kind: IntegrationKind }).kind,
  });
  return new Set(pending);
}
