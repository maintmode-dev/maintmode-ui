/**
 * Backend → domain mapper for the auth-service audit log (D-2: all BE↔UI
 * mapping lives in `src/server/backend/**`). Pure, server-only; the browser
 * never sees the `apiauthmodels.AuditLog` wire shape.
 *
 * Reconciliation handled here:
 *  - action  : whitelisted against the dotted `AuditAction` enum; unknown wire
 *              values are dropped (entry skipped) so the UI never renders an
 *              unmapped action label.
 *  - details : carried through as a free-text string (NOT a JSON object).
 *  - actor   : carried through; absent/blank yields `undefined`.
 */

import { AUDIT_ACTIONS } from "@/domain/audit/audit-log";
import type {
  AuditAction,
  AuditEvent,
  AuditFacets,
  AuditFieldChange,
  AuditMetadata,
  AuditPage,
} from "@/domain/audit/audit-log";

import type {
  AuditLogDto,
  AuditLogFieldChangeDto,
  AuditLogMetadataDto,
  AuditLogResponseDto,
} from "./maintmode-dto";

// Whitelist derived from the domain tuple — single source of truth, so a new
// wire action can never be silently accepted without also being a known enum.
const KNOWN_ACTIONS = new Set<AuditAction>(AUDIT_ACTIONS);

/** Whitelist the wire action against the domain enum; unknown/missing → undefined. */
export function mapAuditAction(action: string | undefined): AuditAction | undefined {
  return action && KNOWN_ACTIONS.has(action as AuditAction) ? (action as AuditAction) : undefined;
}

function trimmed(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v && v.length > 0 ? v : undefined;
}

/** Drop empty strings; keep a non-empty array, else undefined. */
function trimmedList(value: string[] | undefined): string[] | undefined {
  const list = value?.map((v) => v.trim()).filter((v) => v.length > 0);
  return list && list.length > 0 ? list : undefined;
}

/**
 * Keep only real field-changes; collapse to undefined when none. A change is
 * dropped when it names no field, or when both `old` and `new` are blank — the
 * backend emits such no-op entries for untouched fields on `maintenance.updated`
 * (e.g. `steps`/`resources` with empty before/after), which would otherwise
 * render as a meaningless `field: ∅ → ∅` row in the diff.
 */
function mapChanges(value: AuditLogFieldChangeDto[] | undefined): AuditFieldChange[] | undefined {
  const list = value
    ?.map((c): AuditFieldChange => ({ field: trimmed(c.field), old: trimmed(c.old), new: trimmed(c.new) }))
    .filter((c) => c.field !== undefined && (c.old !== undefined || c.new !== undefined));
  return list && list.length > 0 ? list : undefined;
}

/** `AuditLogMetadata` → domain `AuditMetadata`, or `undefined` when nothing is set. */
function mapAuditMetadata(dto: AuditLogMetadataDto | undefined): AuditMetadata | undefined {
  if (!dto) return undefined;
  const metadata: AuditMetadata = {
    ip: trimmed(dto.ip),
    user_agent: trimmed(dto.user_agent),
    session_id: trimmed(dto.session_id),
    failure_reason: trimmed(dto.failure_reason),
    logout_kind: trimmed(dto.logout_kind),
    roles: trimmedList(dto.roles),
    roles_added: trimmedList(dto.roles_added),
    roles_removed: trimmedList(dto.roles_removed),
    target_display_name: trimmed(dto.target_display_name),
    target_email: trimmed(dto.target_email),
    maint_title: trimmed(dto.maint_title),
    changes: mapChanges(dto.changes),
  };
  // Collapse to undefined when every field is empty (login rows with no payload).
  return Object.values(metadata).some((v) => v !== undefined) ? metadata : undefined;
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
    actor_display_name: trimmed(dto.actor_display_name),
    actor_id: trimmed(dto.actor_id),
    action,
    entity_type: trimmed(dto.entity_type),
    entity_id: trimmed(dto.entity_id),
    details: trimmed(dto.details),
    metadata: mapAuditMetadata(dto.metadata),
  };
}

function mapAuditFacets(dto: AuditLogResponseDto["facets"]): AuditFacets {
  return {
    all: dto?.all ?? 0,
    auth: dto?.auth ?? 0,
    roles: dto?.roles ?? 0,
    block: dto?.block ?? 0,
    maintenance: dto?.maintenance ?? 0,
  };
}

/**
 * `GET /api/v1/audit/log` envelope → domain `AuditPage` (`{ events, total,
 * facets }`). Unmappable rows are dropped; `total`/`facets` come straight from
 * the server (it does the filtering + counting now).
 */
export function mapAuditLogResponse(dto: AuditLogResponseDto): AuditPage {
  const events = (dto.logs ?? []).map(mapAuditLog).filter((e): e is AuditEvent => e !== null);
  return {
    events,
    total: dto.total ?? events.length,
    facets: mapAuditFacets(dto.facets),
  };
}
