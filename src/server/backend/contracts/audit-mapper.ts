/**
 * Backend → domain mapper for the auth-service audit log (D-2: all BE↔UI
 * mapping lives in `src/server/backend/**`). Pure, server-only; the browser
 * never sees the `apiauthmodels.AuditLog` wire shape.
 *
 * Reconciliation handled here:
 *  - action  : whitelisted against the flat `AuditAction` enum; unknown wire
 *              values are dropped (entry skipped) so the UI never renders an
 *              unmapped action label.
 *  - details : carried through as a free-text string (NOT a JSON object).
 *  - actor   : carried through; absent/blank yields `undefined`.
 */

import type { AuditAction, AuditEvent } from "@/domain/audit/audit-log";

import type { AuditLogDto, AuditLogResponseDto } from "./maintmode-dto";

const AUDIT_ACTIONS = new Set<AuditAction>([
  "login_success",
  "login_failed",
  "logout_success",
  "assigned",
  "revoked",
  "replaced",
  "blocked",
  "unblocked",
]);

/** Whitelist the wire action against the domain enum; unknown/missing → undefined. */
export function mapAuditAction(action: string | undefined): AuditAction | undefined {
  return action && AUDIT_ACTIONS.has(action as AuditAction) ? (action as AuditAction) : undefined;
}

function trimmed(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v && v.length > 0 ? v : undefined;
}

/**
 * `apiauthmodels.AuditLog` → domain `AuditEvent`, or `null` when the entry
 * carries no id or an unmappable action (filtered out by the caller). Keeping
 * the guard here means the route never leaks half-formed rows to the table.
 */
export function mapAuditLog(dto: AuditLogDto): AuditEvent | null {
  const action = mapAuditAction(dto.action);
  if (!dto.id || !action) return null;
  return {
    id: dto.id,
    created_at: dto.created_at ?? "",
    actor: trimmed(dto.actor),
    action,
    entity_type: trimmed(dto.entity_type),
    entity_id: trimmed(dto.entity_id),
    target_type: trimmed(dto.target_type),
    target_id: trimmed(dto.target_id),
    details: trimmed(dto.details),
  };
}

/** `GET /api/v1/audit/log` envelope → domain `AuditEvent[]` (unmappable rows dropped). */
export function mapAuditLogResponse(dto: AuditLogResponseDto): AuditEvent[] {
  return (dto.logs ?? []).map(mapAuditLog).filter((e): e is AuditEvent => e !== null);
}
