"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { bffFetch, BffError } from "@/features/_shared/api/bff-fetch";
import { DATA_SOURCE } from "@/features/_shared/api/data-source";
import type { CancelReason, Conflict } from "@/domain/maintenance/maintenance";

import { APPROVALS_KEY_PREFIX } from "@/features/approvals/queries/use-approvals-query";

import { maintenanceDetailKey } from "./use-maintenance-detail-query";

export type MaintenanceAction = "approve" | "start" | "complete";

interface ActionArgs {
  id: string;
  action: MaintenanceAction;
  /**
   * Observed integer revision, sent as `observed_maint_revision` on approve
   * for optimistic-concurrency. A stale value yields a 409.
   */
  revision?: number;
  /** The conflicts the operator saw, echoed back as `conflicts_snapshot`. */
  conflicts?: Conflict[];
}

/**
 * Drop every page of the "awaiting my approval" queue (RUK-215).
 *
 * Bare `["approvals"]` prefix on purpose: the query key is
 * `["approvals", offset]`, and a mutation has no idea which page the reviewer
 * is looking at — invalidating one offset would leave the rest stale.
 *
 * Not optional. The quick-sheet's Approve button is reachable straight from
 * `/approvals`, so approving never navigates away; with `staleTime: 30_000` and
 * `refetchOnWindowFocus: false` the approved row would keep sitting in the list
 * it was just removed from. And because a draft can legitimately linger in the
 * queue (there is no "return for rework" transition yet), the reviewer has no
 * way to tell a stale list from a true one.
 */
function invalidateApprovals(queryClient: ReturnType<typeof useQueryClient>): void {
  queryClient.invalidateQueries({ queryKey: APPROVALS_KEY_PREFIX });
}

/**
 * Build the `apimodels.ApproveDraftMaintRequest` body the backend expects for
 * approve. The browser sends the backend-shaped payload directly; the BFF
 * route forwards it unchanged.
 */
function approveBody(revision: number | undefined, conflicts: Conflict[] | undefined): string {
  return JSON.stringify({
    observed_maint_revision: revision ?? 0,
    conflicts_snapshot: (conflicts ?? []).map((c) => ({
      maintenance_id: c.maintenance_id,
      overlap_start: c.overlap_start,
      overlap_end: c.overlap_end,
    })),
  });
}

/**
 * Trigger a maintenance state transition. Toasts on 409 (revision diverged
 * → refetch) and 400 (validation), per the integration spec from Linear.
 */
export function useMaintenanceAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action, revision, conflicts }: ActionArgs) => {
      if (DATA_SOURCE.maintenanceWrites === "mock") {
        await new Promise((r) => setTimeout(r, 400));
        return { id, action };
      }
      const body = action === "approve" ? approveBody(revision, conflicts) : undefined;
      return bffFetch(`/api/maintenance/${encodeURIComponent(id)}/actions/${action}`, {
        method: "POST",
        body,
      });
    },
    onSuccess: (_, { id, action }) => {
      toast.success(`Maintenance ${action} succeeded`);
      queryClient.invalidateQueries({ queryKey: maintenanceDetailKey(id) });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      invalidateApprovals(queryClient);
    },
    onError: (error: unknown, { id, action }) => {
      if (error instanceof BffError) {
        if (error.status === 409) {
          // Stale revision: surface the conflict and refetch so the operator
          // sees the current state (and a fresh revision) before retrying.
          toast.error(`Couldn't ${action}: the maintenance changed elsewhere. Refresh and try again.`);
          queryClient.invalidateQueries({ queryKey: maintenanceDetailKey(id) });
          queryClient.invalidateQueries({ queryKey: ["calendar"] });
          invalidateApprovals(queryClient);
          return;
        }
        if (error.status === 400) {
          toast.error(`Couldn't ${action}: ${error.message}`);
          return;
        }
      }
      toast.error(`Couldn't ${action}. Try again.`);
    },
  });
}

interface CancelArgs {
  id: string;
  reason: CancelReason;
  comment?: string;
}

export function useCancelMaintenance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason, comment }: CancelArgs) => {
      if (DATA_SOURCE.maintenanceWrites === "mock") {
        await new Promise((r) => setTimeout(r, 400));
        return { id };
      }
      return bffFetch(`/api/maintenance/${encodeURIComponent(id)}/actions/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason, comment }),
      });
    },
    onSuccess: (_, { id }) => {
      toast.success("Maintenance canceled");
      queryClient.invalidateQueries({ queryKey: maintenanceDetailKey(id) });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      // Cancel is the other way a draft leaves the queue — approve and cancel
      // are its only two exits today — so the list is just as stale after it.
      invalidateApprovals(queryClient);
    },
    onError: (error) => {
      const msg =
        error instanceof BffError && error.status === 400 ? error.message : "Couldn't cancel. Try again.";
      toast.error(msg);
    },
  });
}
