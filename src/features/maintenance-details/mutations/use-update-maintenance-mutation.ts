"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { MaintenanceSummary } from "@/domain/maintenance/models/maintenance";
import { bffFetch } from "@/features/_shared/api/bff-fetch";
import { calendarQueryKeys } from "@/features/calendar/queries/query-keys";
import { maintenanceDetailsQueryKeys } from "@/features/maintenance-details/queries/query-keys";
import type { CreateMaintenanceInput } from "@/features/maintenance-details/mutations/use-create-maintenance-mutation";

export type UpdateMaintenanceInput = CreateMaintenanceInput & {
  id: string;
};

export function useUpdateMaintenanceMutation() {
  const queryClient = useQueryClient();

  return useMutation<MaintenanceSummary, Error, UpdateMaintenanceInput>({
    mutationFn: async ({ id, ...input }) =>
      bffFetch<MaintenanceSummary>(`/api/maintenance/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: input,
      }),
    onSuccess: async (_summary, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: calendarQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: maintenanceDetailsQueryKeys.detail(variables.id) }),
      ]);
    },
  });
}
