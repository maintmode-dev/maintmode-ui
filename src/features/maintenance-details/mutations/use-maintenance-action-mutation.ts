"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { MaintenanceSummary } from "@/domain/maintenance/models/maintenance";
import { bffFetch } from "@/features/_shared/api/bff-fetch";
import { calendarQueryKeys } from "@/features/calendar/queries/query-keys";
import { maintenanceDetailsQueryKeys } from "@/features/maintenance-details/queries/query-keys";

export type MaintenanceAction = "approve" | "start" | "finish" | "cancel";

export type MaintenanceApprovePayload = {
  observed_maint_revision: number;
  conflicts_snapshot?: unknown[];
};

export type MaintenanceCancelPayload = {
  reason: "conflict" | "incident" | "business_decision" | "rescheduled" | "mistake";
  comment?: string;
};

export type MaintenanceActionInput =
  | { maintenanceId: string; action: "approve"; payload: MaintenanceApprovePayload }
  | { maintenanceId: string; action: "cancel"; payload: MaintenanceCancelPayload }
  | { maintenanceId: string; action: "start" | "finish"; payload?: undefined };

export function useMaintenanceActionMutation() {
  const queryClient = useQueryClient();

  return useMutation<MaintenanceSummary, Error, MaintenanceActionInput>({
    mutationFn: async (input) => {
      const body = "payload" in input && input.payload ? input.payload : {};
      return bffFetch<MaintenanceSummary>(
        `/api/maintenance/${encodeURIComponent(input.maintenanceId)}/actions/${input.action}`,
        {
          method: "POST",
          body,
        },
      );
    },
    onSuccess: async (_summary, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: calendarQueryKeys.all }),
        queryClient.invalidateQueries({
          queryKey: maintenanceDetailsQueryKeys.detail(variables.maintenanceId),
        }),
      ]);
    },
  });
}
