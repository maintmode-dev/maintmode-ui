"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { bffFetch, BffError } from "@/features/_shared/api/bff-fetch";
import { DATA_SOURCE } from "@/features/_shared/api/data-source";

import { maintenanceDetailKey } from "./use-maintenance-detail-query";

export type StepAction = "start" | "complete" | "cancel";

interface StepActionArgs {
  /** Parent maintenance id — used for the BFF path and cache invalidation. */
  maintenanceId: string;
  stepId: string;
  action: StepAction;
}

const VERB: Record<StepAction, string> = {
  start: "start",
  complete: "complete",
  cancel: "cancel",
};

/**
 * Trigger a step state transition (`start | complete | cancel`) on an
 * in_progress maintenance. The backend enforces the step state machine
 * (`planned → started → completed|canceled`) and start ordering; an invalid
 * transition or out-of-order start comes back as 409. On success the
 * maintenance detail refetches so the step row — and, once every step is
 * terminal, the maintenance-level `can_complete` flag — reflect the new state.
 *
 * Mirrors `useMaintenanceAction`: step endpoints take no body and return 204
 * (handled by `bffFetch`). 409 (forbidden transition / order) and 400/404 map
 * to operator-readable toasts.
 */
export function useStepAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ maintenanceId, stepId, action }: StepActionArgs) => {
      if (DATA_SOURCE.maintenanceWrites === "mock") {
        await new Promise((r) => setTimeout(r, 300));
        return { stepId, action };
      }
      return bffFetch(
        `/api/maintenance/${encodeURIComponent(maintenanceId)}/steps/${encodeURIComponent(stepId)}/actions/${action}`,
        { method: "POST" },
      );
    },
    onSuccess: (_, { maintenanceId, action }) => {
      toast.success(`Step ${VERB[action]} succeeded`);
      queryClient.invalidateQueries({ queryKey: maintenanceDetailKey(maintenanceId) });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
    },
    onError: (error: unknown, { maintenanceId, action }) => {
      if (error instanceof BffError) {
        // Step state-machine / ordering violations: the maintmode backend
        // returns these as 400 `invalid request` (verified 2026-06-08 — NOT
        // the 409 the swagger advertises) and 409. Both mean "this transition
        // isn't valid right now"; the raw Go message ("forbidden step maint
        // status: …") is not operator-readable, so we substitute a clear
        // sentence and refetch so the UI re-syncs to the real step state.
        if (error.status === 400 || error.status === 409) {
          toast.error(
            `Couldn't ${VERB[action]} step: steps run in order and only from a valid state. Refresh and try again.`,
          );
          queryClient.invalidateQueries({ queryKey: maintenanceDetailKey(maintenanceId) });
          return;
        }
        if (error.status === 404) {
          toast.error(
            `Couldn't ${VERB[action]} step: the step or maintenance no longer exists. Refresh and try again.`,
          );
          queryClient.invalidateQueries({ queryKey: maintenanceDetailKey(maintenanceId) });
          return;
        }
      }
      toast.error(`Couldn't ${VERB[action]} step. Try again.`);
    },
  });
}
