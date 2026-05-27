"use client";

import { useQuery } from "@tanstack/react-query";

import { bffFetch } from "@/features/_shared/api/bff-fetch";
import { DATA_SOURCE } from "@/features/_shared/api/data-source";
import { MOCK_GLOBAL_AUDIT, MOCK_MAINTENANCE_AUDIT } from "@/shared/mock/audit";
import type { AuditEvent } from "@/domain/audit/audit-log";

export function maintenanceAuditKey(id: string) {
  return ["maintenance-audit", id] as const;
}
export function globalAuditKey() {
  return ["global-audit"] as const;
}

export function useMaintenanceAuditQuery(id: string) {
  return useQuery({
    queryKey: maintenanceAuditKey(id),
    queryFn: async (): Promise<AuditEvent[]> => {
      if (DATA_SOURCE.maintenanceAudit === "mock") {
        return MOCK_MAINTENANCE_AUDIT[id] ?? [];
      }
      const data = await bffFetch<{ events: AuditEvent[] }>(
        `/api/maintenance/${encodeURIComponent(id)}/audit`,
      );
      return data.events;
    },
  });
}

export function useGlobalAuditQuery() {
  return useQuery({
    queryKey: globalAuditKey(),
    queryFn: async (): Promise<AuditEvent[]> => {
      if (DATA_SOURCE.globalAudit === "mock") {
        return MOCK_GLOBAL_AUDIT;
      }
      const data = await bffFetch<{ events: AuditEvent[] }>("/api/audit");
      return data.events;
    },
  });
}
