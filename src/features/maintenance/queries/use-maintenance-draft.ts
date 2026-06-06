"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { bffFetch, BffError } from "@/features/_shared/api/bff-fetch";
import { DATA_SOURCE } from "@/features/_shared/api/data-source";
import type { MaintenanceDraftInput } from "@/domain/maintenance/maintenance";

import { maintenanceDetailKey } from "./use-maintenance-detail-query";

/** Backend `CreateDraftMaintResponse` — only `id` is read by the UI. */
interface CreateDraftResponse {
  id: string;
}

/**
 * Create a draft maintenance (`POST /api/maintenance` →
 * `POST /api/v1/maintenances/create`). Invalidates the calendar on success so
 * the new draft appears; returns the new id for the caller to navigate to.
 */
export function useCreateMaintenance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: MaintenanceDraftInput): Promise<CreateDraftResponse> => {
      if (DATA_SOURCE.maintenanceWrites === "mock") {
        await new Promise((r) => setTimeout(r, 400));
        return { id: "mock-new" };
      }
      return bffFetch<CreateDraftResponse>("/api/maintenance", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      toast.success("Draft created");
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
    },
    onError: (error: unknown) => {
      const msg =
        error instanceof BffError && error.status === 400
          ? `Couldn't create: ${error.message}`
          : "Couldn't create the draft. Try again.";
      toast.error(msg);
    },
  });
}

interface UpdateArgs {
  id: string;
  input: MaintenanceDraftInput;
}

/**
 * Update a draft maintenance (`POST /api/maintenance/{id}/edit` →
 * `POST /api/v1/maintenances/{id}/edit`, 204). Invalidates both the detail
 * (so the edited fields refetch) and the calendar (title/time/scope may have
 * changed) on success.
 */
export function useUpdateMaintenance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: UpdateArgs) => {
      if (DATA_SOURCE.maintenanceWrites === "mock") {
        await new Promise((r) => setTimeout(r, 400));
        return { id };
      }
      return bffFetch(`/api/maintenance/${encodeURIComponent(id)}/edit`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    onSuccess: (_, { id }) => {
      toast.success("Changes saved");
      queryClient.invalidateQueries({ queryKey: maintenanceDetailKey(id) });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
    },
    onError: (error: unknown, { id }) => {
      if (error instanceof BffError) {
        if (error.status === 409) {
          toast.error("Couldn't save: the maintenance changed elsewhere. Refresh and try again.");
          queryClient.invalidateQueries({ queryKey: maintenanceDetailKey(id) });
          return;
        }
        if (error.status === 400) {
          toast.error(`Couldn't save: ${error.message}`);
          return;
        }
      }
      toast.error("Couldn't save changes. Try again.");
    },
  });
}
