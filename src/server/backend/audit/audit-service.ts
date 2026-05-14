import "server-only";

import type { AuditLogEntry } from "@/domain/audit/models/audit-log";
import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import type {
  BackendAuditLogEntryDto,
  BackendAuditLogResponseDto,
} from "@/server/backend/contracts/audit.contracts";

export const AUDIT_LIMIT_MAX = 100;

export type AuditLogQuery = {
  limit?: number;
  offset?: number;
  action?: string;
  actor?: string;
  createdFrom?: string;
  createdTo?: string;
};

export async function loadAuditLog(query: AuditLogQuery = {}): Promise<AuditLogEntry[]> {
  const params = new URLSearchParams();
  const limit = clampLimit(query.limit);
  params.set("limit", String(limit));
  if (typeof query.offset === "number" && query.offset > 0) {
    params.set("offset", String(Math.floor(query.offset)));
  }
  if (query.action) {
    params.set("action", query.action);
  }
  if (query.actor) {
    params.set("actor", query.actor);
  }
  if (query.createdFrom) {
    params.set("created_from", query.createdFrom);
  }
  if (query.createdTo) {
    params.set("created_to", query.createdTo);
  }

  const response = await authenticatedBackendRequest<BackendAuditLogResponseDto>({
    method: "GET",
    path: `/api/v1/audit/log?${params.toString()}`,
    useAuthBase: true,
  });

  return (response.logs ?? []).map(normalizeAuditLogEntry);
}

export function normalizeAuditLogEntry(dto: BackendAuditLogEntryDto): AuditLogEntry {
  return {
    id: dto.id,
    action: dto.action,
    actor: dto.actor,
    entityType: dto.entity_type || undefined,
    entityId: dto.entity_id || undefined,
    targetType: dto.target_type || undefined,
    targetId: dto.target_id || undefined,
    details: dto.details || undefined,
    createdAt: dto.created_at,
  };
}

function clampLimit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return AUDIT_LIMIT_MAX;
  }
  return Math.min(AUDIT_LIMIT_MAX, Math.floor(value));
}
