"use client";

import { useQuery } from "@tanstack/react-query";

import { bffFetch, BffError } from "@/features/_shared/api/bff-fetch";
import { DATA_SOURCE } from "@/features/_shared/api/data-source";
import { getMockMaintenanceDetail } from "@/shared/mock/maintenances";
import type { MaintenanceDetail } from "@/domain/maintenance/maintenance";

export function maintenanceDetailKey(id: string) {
  return ["maintenance-detail", id] as const;
}

export function useMaintenanceDetailQuery(id: string) {
  return useQuery({
    // The quick sheet stays mounted on the calendar with an empty id while
    // closed (maintenanceId ?? ""). Without this guard the query fires
    // `/api/maintenance/` → 308 → 405 on every calendar load.
    enabled: id.length > 0,
    queryKey: maintenanceDetailKey(id),
    queryFn: async (): Promise<MaintenanceDetail> => {
      if (DATA_SOURCE.maintenanceDetail === "mock") {
        const detail = getMockMaintenanceDetail(id);
        if (!detail) {
          throw new BffError(404, "Maintenance not found", "NOT_FOUND");
        }
        return detail;
      }
      return bffFetch<MaintenanceDetail>(`/api/maintenance/${encodeURIComponent(id)}`);
    },
    retry: (failureCount, error) => {
      // Don't retry 404/403 — those are terminal states, not "try again" errors.
      if (error instanceof BffError && (error.status === 404 || error.status === 403)) {
        return false;
      }
      return failureCount < 1;
    },
    staleTime: 15_000,
  });
}
