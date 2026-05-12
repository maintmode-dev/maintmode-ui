"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { MaintenanceSummary } from "@/domain/maintenance/models/maintenance";
import { bffFetch } from "@/features/_shared/api/bff-fetch";
import { calendarQueryKeys } from "@/features/calendar/queries/query-keys";

export type CreateMaintenanceInput = {
  title: string;
  description: string;
  planned_start_at: string;
  impact: "none" | "partial_outage" | "full_outage";
  scope: "global" | "resource";
  resource_ids?: string[];
  steps?: Array<{
    order: number;
    description: string;
    rollback_description: string;
    duration_minutes: number;
  }>;
};

export function useCreateMaintenanceMutation() {
  const queryClient = useQueryClient();

  return useMutation<MaintenanceSummary, Error, CreateMaintenanceInput>({
    mutationFn: async (input) =>
      bffFetch<MaintenanceSummary>("/api/maintenance", {
        method: "POST",
        body: input,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: calendarQueryKeys.all });
    },
  });
}
