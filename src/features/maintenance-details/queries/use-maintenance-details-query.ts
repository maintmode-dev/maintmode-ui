"use client";

import { useQuery } from "@tanstack/react-query";

import type { MaintenanceSummary } from "@/domain/maintenance/models/maintenance";
import { bffFetch } from "@/features/_shared/api/bff-fetch";
import { maintenanceDetailsQueryKeys } from "@/features/maintenance-details/queries/query-keys";

export function useMaintenanceDetailsQuery(maintenanceId: string | null | undefined) {
  return useQuery({
    queryKey: maintenanceId ? maintenanceDetailsQueryKeys.detail(maintenanceId) : ["maintenance-details", "none"],
    enabled: Boolean(maintenanceId),
    staleTime: 0,
    queryFn: async ({ signal }) => {
      const path = `/api/maintenance/${encodeURIComponent(maintenanceId!)}`;
      return bffFetch<MaintenanceSummary>(path, { method: "GET", signal });
    },
  });
}
