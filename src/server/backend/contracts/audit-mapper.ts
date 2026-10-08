/**
 * Backend → domain mapper for the auth-service audit log (D-2: all BE↔UI
 * mapping lives in `src/server/backend/**`). Pure, server-only; the browser
 * never sees the `apiauthmodels.AuditLog` wire shape.
 *
 * Reconciliation handled here:
 *  - action  : carried through as the wire value. A known action renders with
 *              its label and colour; an unknown one renders as a neutral row
 *              labelled with the raw value. It is NOT dropped: until RUK-297 an
 *              allowlist here discarded every row the enum had not heard of, and
 *              five real security events never reached the screen. Nothing is
 *              filtered by action, on purpose: an allowlist (or a denylist)
 *              here is a place for records to disappear silently.
 *  - details : carried through as a free-text string (NOT a JSON object).
 *  - actor   : carried through; absent/blank yields `undefined`.
 */

import type {
  AuditEvent,
  AuditEventAction,
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

/**
 * The wire action, trimmed; `undefined` only when there is none. Known or not is
 * the presentation layer's question (`isKnownAuditAction`), not a reason to lose
 * the row here.
 */
export function mapAuditAction(action: string | undefined): AuditEventAction | undefined {
  return trimmed(action);
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
 *
 * Except a `secrets.<key>` entry, which is blank on both sides BY DESIGN: it is
 * `integration.updated` saying a secret was replaced or cleared, without ever
 * writing its value. Dropping it would hide exactly the change the audit row
 * exists to show.
 */
function mapChanges(value: AuditLogFieldChangeDto[] | undefined): AuditFieldChange[] | undefined {
  const list = value
    ?.map((c): AuditFieldChange => ({ field: trimmed(c.field), old: trimmed(c.old), new: trimmed(c.new) }))
    .filter(
      (c) => c.field !== undefined && (c.old !== undefined || c.new !== undefined || isSecretChange(c.field)),
    );
  return list && list.length > 0 ? list : undefined;
}

function isSecretChange(field: string): boolean {
  return field.startsWith("secrets.");
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
 * carries no id or no action — filtered out by the caller. An action the UI
 * does not model is NOT a reason to return `null`. Keeping the guard here means
 * the route never leaks half-formed rows to the table.
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
    integration: dto?.integration ?? 0,
  };
}

/**
 * `GET /api/v1/audit/log` envelope → domain `AuditPage` (`{ events, total,
 * facets }`). Rows `mapAuditLog` rejects are dropped; `total`/`facets` come
 * straight from the server (it does the filtering + counting now).
 */
export function mapAuditLogResponse(dto: AuditLogResponseDto): AuditPage {
  const events = (dto.logs ?? []).map(mapAuditLog).filter((e): e is AuditEvent => e !== null);
  return {
    events,
    total: dto.total ?? events.length,
    facets: mapAuditFacets(dto.facets),
  };
}
