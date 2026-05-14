"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";

import type { AuditLogEntry } from "@/domain/audit/models/audit-log";
import { bffFetch } from "@/features/_shared/api/bff-fetch";
import { auditLogKeys } from "@/features/audit-log/queries/query-keys";
import type { AuditLogFilters } from "@/features/audit-log/schemas/audit-filter-schema";

type AuditLogResponse = { logs: AuditLogEntry[] };

export function useAuditLogQuery(filters: AuditLogFilters) {
  return useQuery({
    queryKey: auditLogKeys.list(filters),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      params.set("limit", String(filters.limit));
      params.set("offset", String(filters.offset));
      if (filters.action) {
        params.set("action", filters.action);
      }
      if (filters.actor) {
        params.set("actor", filters.actor);
      }
      if (filters.createdFrom) {
        params.set("created_from", filters.createdFrom);
      }
      if (filters.createdTo) {
        params.set("created_to", filters.createdTo);
      }
      return bffFetch<AuditLogResponse>(`/api/audit?${params.toString()}`, {
        method: "GET",
        signal,
      });
    },
    placeholderData: keepPreviousData,
    staleTime: 15 * 1000,
  });
}
