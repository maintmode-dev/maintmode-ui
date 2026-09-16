"use client";

import { useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { bffFetch, BffError } from "@/features/_shared/api/bff-fetch";
import type {
  CreateIntegrationInput,
  Integration,
  IntegrationCategory,
  TestIntegrationInput,
  UpdateIntegrationInput,
} from "@/domain/admin/integration";

export function integrationsKey() {
  return ["integrations"] as const;
}

/**
 * A row is addressed by the PAIR, so every mutation carries both halves.
 *
 * `UpdateIntegrationInput` deliberately holds no identifier — the path carries
 * it — which is why the pair travels beside the body rather than inside it.
 */
type IntegrationRef = { kind: IntegrationCategory; name: string };

/** The one place a row's URL is built, so the two halves cannot drift apart. */
function integrationPath({ kind, name }: IntegrationRef, suffix = ""): string {
  return `/api/admin/integrations/${kind}/${name}${suffix}`;
}

/** Identity is the pair; matching on `kind` alone now matches every transport. */
function isSameRow(row: Integration, ref: IntegrationRef): boolean {
  return row.kind === ref.kind && row.name === ref.name;
}

/**
 * The whole registry in one query — a handful of rows, so no paging. A system
 * missing from the response is simply not configured yet.
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
 * Create an integration. 409 = the pair already exists (someone configured it
 * concurrently) — surfaced as a specific toast; the list refetch flips the
 * row to Configured so the next open lands in edit mode.
 *
 * Note where the label comes from in each branch: success reads the RESPONSE,
 * every failure reads the VARIABLES, because a 409 has no body to read. Fixing
 * only one leaves the other announcing the category ("notify is already set
 * up").
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
      toast.success(`${data.name} integration connected`);
      invalidate(queryClient);
    },
    onError: (error: unknown, { name }) => {
      if (error instanceof BffError && error.status === 409) {
        toast.error(`${name} is already set up. Edit the existing connection instead.`);
        invalidate(queryClient);
        return;
      }
      if (error instanceof BffError && error.status === 400) {
        toast.error(`Couldn't connect ${name}: ${error.message}`);
        return;
      }
      toast.error(`Couldn't connect ${name}. Try again.`);
    },
  });
}

/** Update config/enabled/secrets. Untouched secrets never leave the client. */
export function useUpdateIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      ref,
      body,
    }: {
      ref: IntegrationRef;
      body: UpdateIntegrationInput;
    }): Promise<Integration> =>
      bffFetch<Integration>(integrationPath(ref), {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      toast.success(`${data.name} integration updated`);
      invalidate(queryClient);
    },
    onError: (error: unknown, { ref }) => {
      if (error instanceof BffError && error.status === 400) {
        toast.error(`Couldn't save ${ref.name}: ${error.message}`);
        return;
      }
      toast.error(`Couldn't save ${ref.name}. Try again.`);
    },
  });
}

const TOGGLE_MUTATION_KEY = ["integrations-toggle"] as const;

/**
 * Flip enabled from the list row. Optimistic: the switch moves immediately
 * and rolls back if the backend rejects the toggle.
 *
 * Concurrency: rollback is per-row (restoring a whole-list snapshot would
 * clobber another row's in-flight optimistic flip), and the settle-time
 * refetch is skipped while other toggles are still pending — the last one to
 * finish reconciles with server truth.
 *
 * Every predicate here matches the PAIR. Matching `kind` alone once identified
 * a row; it now identifies a whole category, so one Slack toggle would flip
 * Telegram and email with it.
 */
export function useToggleIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: TOGGLE_MUTATION_KEY,
    mutationFn: ({ ref, enabled }: { ref: IntegrationRef; enabled: boolean }): Promise<Integration> =>
      bffFetch<Integration>(integrationPath(ref, "/toggle"), {
        method: "POST",
        body: JSON.stringify({ enabled }),
      }),
    onMutate: async ({ ref, enabled }) => {
      await queryClient.cancelQueries({ queryKey: integrationsKey() });
      const previousEnabled = queryClient
        .getQueryData<Integration[]>(integrationsKey())
        ?.find((i) => isSameRow(i, ref))?.enabled;
      queryClient.setQueryData<Integration[]>(integrationsKey(), (list) =>
        (list ?? []).map((i) => (isSameRow(i, ref) ? { ...i, enabled } : i)),
      );
      return { previousEnabled };
    },
    onError: (_error, { ref }, context) => {
      if (context?.previousEnabled !== undefined) {
        const previousEnabled = context.previousEnabled;
        queryClient.setQueryData<Integration[]>(integrationsKey(), (list) =>
          (list ?? []).map((i) => (isSameRow(i, ref) ? { ...i, enabled: previousEnabled } : i)),
        );
      }
      toast.error(`Couldn't toggle ${ref.name}. Try again.`);
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
 * Systems with a toggle currently in flight — drives per-row switch disabling.
 * A single mutation instance's `variables` only reflects its latest call, so
 * concurrent toggles need the mutation cache as the source of truth.
 *
 * Keyed by `name`, not `kind`: keying by category would disable every
 * transport's switch while any one of them was in flight. Callers hold one
 * category, so the name alone is unambiguous here.
 */
export function usePendingToggleNames(): Set<string> {
  const pending = useMutationState({
    filters: { mutationKey: TOGGLE_MUTATION_KEY, status: "pending" },
    select: (mutation) => (mutation.state.variables as { ref: IntegrationRef }).ref.name,
  });
  return new Set(pending);
}

/**
 * Live SMTP probe (RUK-290 §4). Sends a real message with the settings in the
 * body and reports whether the server took it.
 *
 * **Invalidates nothing, and shows no toast.** The probe saves nothing, so
 * refreshing the integrations cache afterwards would suggest something changed
 * when nothing did. The result belongs inside the dialog next to the fields it
 * describes — a toast outlives the form and would still be claiming "sent" over
 * a host the operator has since edited.
 *
 * Errors are deliberately not swallowed here: the dialog renders the backend's
 * own text, which for this endpoint is the entire point.
 */
export function useTestIntegration() {
  return useMutation({
    mutationFn: ({ ref, body }: { ref: IntegrationRef; body: TestIntegrationInput }): Promise<void> =>
      bffFetch<void>(integrationPath(ref, "/test"), {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}
