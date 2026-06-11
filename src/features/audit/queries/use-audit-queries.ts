"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { bffFetch } from "@/features/_shared/api/bff-fetch";
import { DATA_SOURCE } from "@/features/_shared/api/data-source";
import { MOCK_GLOBAL_AUDIT } from "@/shared/mock/audit";
import type { AuditEvent, AuditFacets, AuditPage } from "@/domain/audit/audit-log";
import {
  type AuditCategory,
  auditActionInCategory,
  auditCategoryActions,
} from "@/domain/audit/audit-presentation";

export function maintenanceAuditKey(id: string) {
  return ["maintenance-audit", id] as const;
}

/**
 * Server-side filter/page params for the global audit feed. `category` is
 * translated to a backend `action` CSV; `from`/`to` are RFC3339 (the date
 * presets / custom range produce these). The query key carries them all so each
 * distinct view is cached independently.
 */
export interface AuditQueryParams {
  category: AuditCategory;
  actor: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}

export function globalAuditKey(params: AuditQueryParams) {
  return ["global-audit", params] as const;
}

export function useMaintenanceAuditQuery(id: string) {
  return useQuery({
    queryKey: maintenanceAuditKey(id),
    queryFn: async (): Promise<AuditEvent[]> => {
      const data = await bffFetch<{ events: AuditEvent[] }>(
        `/api/maintenance/${encodeURIComponent(id)}/audit`,
      );
      return data.events;
    },
  });
}

/** Build the BFF query string from the filter params (empty values omitted). */
function buildAuditQuery(params: AuditQueryParams): string {
  const qs = new URLSearchParams();
  qs.set("limit", String(params.limit));
  qs.set("offset", String(params.offset));
  const actions = auditCategoryActions(params.category);
  if (actions.length) qs.set("action", actions.join(","));
  if (params.actor.trim()) qs.set("actor", params.actor.trim());
  if (params.from) qs.set("created_from", params.from);
  if (params.to) qs.set("created_to", params.to);
  return qs.toString();
}

/**
 * Mock-backed page — the in-memory fixture has no server to filter/count, so we
 * apply the category + actor filters and facets client-side to keep the
 * mock-mode screen functional. The live `bff` path does none of this.
 */
function mockAuditPage(params: AuditQueryParams): AuditPage {
  const actor = params.actor.trim().toLowerCase();
  const filtered = MOCK_GLOBAL_AUDIT.filter(
    (e) =>
      auditActionInCategory(e.action, params.category) &&
      (!actor || (e.actor ?? "").toLowerCase().includes(actor)),
  );
  const facets: AuditFacets = {
    all: MOCK_GLOBAL_AUDIT.length,
    auth: MOCK_GLOBAL_AUDIT.filter((e) => auditActionInCategory(e.action, "auth")).length,
    roles: MOCK_GLOBAL_AUDIT.filter((e) => auditActionInCategory(e.action, "roles")).length,
    block: MOCK_GLOBAL_AUDIT.filter((e) => auditActionInCategory(e.action, "block")).length,
  };
  return {
    events: filtered.slice(params.offset, params.offset + params.limit),
    total: filtered.length,
    facets,
  };
}

export function useGlobalAuditQuery(params: AuditQueryParams) {
  return useQuery({
    queryKey: globalAuditKey(params),
    // Keep the previous page on screen while the next loads — no flash to a
    // skeleton on every page/filter change.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<AuditPage> => {
      if (DATA_SOURCE.globalAudit === "mock") {
        return mockAuditPage(params);
      }
      return bffFetch<AuditPage>(`/api/audit?${buildAuditQuery(params)}`);
    },
  });
}
