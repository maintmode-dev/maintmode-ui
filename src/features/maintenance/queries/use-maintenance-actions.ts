"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { bffFetch, BffError } from "@/features/_shared/api/bff-fetch";
import { DATA_SOURCE } from "@/features/_shared/api/data-source";
import type { CancelReason } from "@/domain/maintenance/maintenance";

import { maintenanceDetailKey } from "./use-maintenance-detail-query";

export type MaintenanceAction = "approve" | "start" | "complete";

interface ActionArgs {
  id: string;
  action: MaintenanceAction;
  /** Snapshot fingerprint for optimistic-concurrency on approve. */
  snapshotId?: string;
}

/**
 * Trigger a maintenance state transition. Toasts on 409 (snapshot
 * diverged) and 400 (validation), per the integration spec from Linear.
 */
export function useMaintenanceAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action, snapshotId }: ActionArgs) => {
      if (DATA_SOURCE.maintenanceWrites === "mock") {
        await new Promise((r) => setTimeout(r, 400));
        return { id, action };
      }
      return bffFetch(`/api/maintenance/${encodeURIComponent(id)}/actions/${action}`, {
        method: "POST",
        body: snapshotId ? JSON.stringify({ snapshot_id: snapshotId }) : undefined,
      });
    },
    onSuccess: (_, { id, action }) => {
      toast.success(`Maintenance ${action} succeeded`);
      queryClient.invalidateQueries({ queryKey: maintenanceDetailKey(id) });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
    },
    onError: (error: unknown, { action }) => {
      if (error instanceof BffError) {
        if (error.status === 409) {
          toast.error(`Couldn't ${action}: the maintenance changed elsewhere. Refresh and try again.`);
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
    },
    onError: (error) => {
      const msg =
        error instanceof BffError && error.status === 400 ? error.message : "Couldn't cancel. Try again.";
      toast.error(msg);
    },
  });
}
