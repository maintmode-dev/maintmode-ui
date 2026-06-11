/**
 * Centralized backend → domain mappers for the maintmode read paths
 * (D-2: all BE↔UI mapping lives in `src/server/backend/**`). These are pure,
 * server-only functions invoked from the BFF routes; the browser never sees
 * the wire shapes in `./maintmode-dto.ts`.
 *
 * Reconciliation handled here:
 *  - scope        : passthrough-validated to `global | resource`.
 *  - step status  : `unknown|planned|started|completed|canceled` → UI `StepStatus`.
 *  - revision     : integer `revision` carried through for optimistic concurrency.
 *  - flat times   : `*_time_start/end` → `Period`.
 *  - user summary : `created_by`/`approver` → display string, "Unknown user" fallback.
 *  - steps        : `description` → `title`, `order` → 1-based number.
 *  - conflicts    : `ConflictView` (no reference/resolved) → domain `Conflict`.
 */

import type {
  AssignableUser,
  CancelReason,
  Conflict,
  Maintenance,
  MaintenanceCancelReason,
  MaintenanceDetail,
  MaintenanceDraftInput,
  MaintenanceImpact,
  MaintenanceNotifyTarget,
  MaintenanceResource,
  MaintenanceScope,
  MaintenanceStatus,
  MaintenanceStep,
  Period,
  StepStatus,
} from "@/domain/maintenance/maintenance";

import { BffValidationError, type FieldError } from "@/server/backend/errors/bff-error";

import type {
  AssignableUserDto,
  CalendarViewResponseDto,
  ConflictViewDto,
  CreateDraftMaintRequestDto,
  MaintenanceCancelReasonDto,
  MaintenanceViewDto,
  MaintenanceViewNotifyTargetDto,
  MaintenanceViewResourceDto,
  MaintenanceViewResponseDto,
  MaintenanceViewStepDto,
  UserSummaryDto,
} from "./maintmode-dto";

const UNKNOWN_USER = "Unknown user";

const STATUSES = new Set<MaintenanceStatus>(["draft", "planned", "in_progress", "completed", "canceled"]);
const IMPACTS = new Set<MaintenanceImpact>(["none", "partial_outage", "full_outage"]);
const CANCEL_REASONS = new Set<CancelReason>([
  "conflict",
  "incident",
  "business_decision",
  "rescheduled",
  "mistake",
]);

/** Validate the wire scope against `global | resource`; default to `global`. */
export function mapScope(scope: string | undefined): MaintenanceScope {
  return scope === "resource" ? "resource" : "global";
}

/**
 * Whitelist the wire status against the domain union. Swagger types `status`
 * as the `MaintenanceStatus` enum, but we validate defensively in case the
 * enum widens; an unknown/missing value defaults to `planned`.
 */
export function mapStatus(status: string | undefined): MaintenanceStatus {
  return status && STATUSES.has(status as MaintenanceStatus) ? (status as MaintenanceStatus) : "planned";
}

/**
 * Whitelist the wire impact. Swagger types `MaintenanceView.impact` as a free
 * `string`, so an unexpected value can't be cast blindly; unknown/missing
 * defaults to `none`.
 */
export function mapImpact(impact: string | undefined): MaintenanceImpact {
  return impact && IMPACTS.has(impact as MaintenanceImpact) ? (impact as MaintenanceImpact) : "none";
}

/** Whitelist the wire cancel reason; unknown/missing yields undefined. */
export function mapCancelReason(reason: string | undefined): CancelReason | undefined {
  return reason && CANCEL_REASONS.has(reason as CancelReason) ? (reason as CancelReason) : undefined;
}

/** Backend `MaintenanceStepStatus` → UI `StepStatus`. */
export function mapStepStatus(status: string | undefined): StepStatus {
  switch (status) {
    case "started":
      return "in_progress";
    case "completed":
      return "done";
    case "canceled":
      return "skipped";
    case "planned":
    case "unknown":
    default:
      return "pending";
  }
}

/** Display name of a user summary, falling back to "Unknown user". */
export function mapUserSummary(user: UserSummaryDto | undefined): string {
  const name = user?.display_name?.trim();
  return name && name.length > 0 ? name : UNKNOWN_USER;
}

/** Flat `*_time_start/end` → `Period`, or undefined when both ends are absent. */
export function mapPeriod(start: string | undefined, end: string | undefined): Period | undefined {
  if (!start && !end) return undefined;
  return { start: start ?? "", end: end ?? "" };
}

function mapResource(resource: MaintenanceViewResourceDto): MaintenanceResource {
  return { id: resource.id, name: resource.name ?? "" };
}

/** `MaintenanceStep` DTO → domain step (`description`→`title`, `order`→number). */
export function mapStep(step: MaintenanceViewStepDto, index: number): MaintenanceStep {
  return {
    id: step.id,
    title: step.description?.trim() ? step.description : "Untitled step",
    description: step.description,
    order: step.order ?? index + 1,
    duration: step.duration,
    rollback_description: step.rollback_description,
    status: mapStepStatus(step.status),
  };
}

/**
 * Read-view notify targets → domain. The backend read view does not emit
 * `notify_targets` yet, so this is empty in practice today; map defensively so
 * the Notify-channels section starts rendering the moment the field appears.
 */
export function mapNotifyTargets(
  targets: MaintenanceViewNotifyTargetDto[] | undefined,
): MaintenanceNotifyTarget[] {
  return (targets ?? [])
    .map((t) => ({ id: t.id ?? t.channel_id ?? "", name: t.name ?? "", transport: t.transport }))
    .filter((t) => t.id || t.name);
}

/** `ConflictView` → domain `Conflict`. No `reference`/`resolved` on the wire. */
export function mapConflict(conflict: ConflictViewDto): Conflict {
  return {
    maintenance_id: conflict.maintenance_id,
    title: conflict.title ?? "Untitled maintenance",
    overlap_start: conflict.overlap_start ?? "",
    overlap_end: conflict.overlap_end ?? "",
  };
}

/**
 * `GET /ui/v1/calendar` → domain `Maintenance[]`.
 *
 * Calendar events are a flat projection: the grid only reads
 * `planned_period`, `title`, `status` and `scope`. Period-less detail fields
 * (`steps`, `resources`, `actual_period`) are filled with empty defaults; the
 * detail screen fetches the full view separately.
 */
export function mapCalendarResponse(dto: CalendarViewResponseDto): Maintenance[] {
  const events = dto.events ?? [];
  return events.map((event) => {
    const start = event.start ?? "";
    const end = event.end ?? "";
    return {
      id: event.id,
      title: event.title ?? "",
      status: mapStatus(event.status),
      impact: mapImpact(event.impact),
      scope: mapScope(event.scope),
      planned_period: { start, end },
      resources: [],
      notify_targets: [],
      steps: [],
      created_by: event.created_by ? mapUserSummary(event.created_by) : undefined,
      // Calendar events carry no audit timestamps; the grid never reads these.
      created_at: start,
      updated_at: start,
    } satisfies Maintenance;
  });
}

/** `GET /ui/v1/maintenances/{id}` → domain `MaintenanceDetail`. */
export function mapMaintenanceView(dto: MaintenanceViewResponseDto): MaintenanceDetail {
  const m: MaintenanceViewDto = dto.maintenance;
  const actions = dto.actions ?? {};
  const plannedPeriod = mapPeriod(m.planned_time_start, m.planned_time_end) ?? { start: "", end: "" };
  const actualPeriod = mapPeriod(m.actual_time_start, m.actual_time_end);

  return {
    id: m.id,
    title: m.title ?? "",
    description: m.description,
    status: mapStatus(m.status),
    impact: mapImpact(m.impact),
    scope: mapScope(m.scope),
    planned_period: plannedPeriod,
    actual_period: actualPeriod,
    resources: (m.resources ?? []).map(mapResource),
    notify_targets: mapNotifyTargets(m.notify_targets),
    steps: (m.steps ?? []).map(mapStep),
    cancel_reason: mapCancelReason(m.cancel_reason),
    cancel_reason_comment: m.cancel_reason_comment,
    created_by: m.created_by ? mapUserSummary(m.created_by) : undefined,
    approver: m.approver ? mapUserSummary(m.approver) : undefined,
    created_at: m.created_at ?? "",
    updated_at: m.updated_at ?? "",
    actions: {
      can_edit: actions.can_edit ?? false,
      can_cancel: actions.can_cancel ?? false,
      can_approve: actions.can_approve ?? false,
      can_start: actions.can_start ?? false,
      can_complete: actions.can_complete ?? false,
    },
    conflicts: (dto.conflicts ?? []).map(mapConflict),
    revision: m.revision,
  };
}

// ---------------------------------------------------------------------------
// Write direction: domain form input → backend request DTO.
// ---------------------------------------------------------------------------

/**
 * Validate the parsed request body has the shape `mapDraftToCreateRequest`
 * dereferences, throwing `BffValidationError` (→ 400) for a malformed/incomplete
 * client body. The BFF routes `JSON.parse(... as MaintenanceDraftInput)` is a
 * compile-time assertion only — without this guard a body missing `steps` (or
 * `resource_ids` under `resource` scope) makes the mapper throw a bare
 * `TypeError`, which `normalizeRouteError` (correctly) treats as an internal bug
 * and surfaces as 500 `BFF_ERROR`. A client-supplied incomplete body is a 400,
 * not a server fault: validate the structure here so a genuine adapter
 * `TypeError` stays the only thing that reaches the 500 branch.
 *
 * This is a structural guard, not full business validation — the backend remains
 * the source of truth for value-level rules (e.g. `notify_targets: min 1`,
 * non-empty title). Those reach the backend and come back as its own 400.
 */
/**
 * Parse a draft request body and validate its structure. Malformed JSON and a
 * structurally-incomplete body are both client errors → `BffValidationError`
 * (400). Without this, `JSON.parse` throws a `SyntaxError` that falls through to
 * the 500 `BFF_ERROR` branch.
 */
export function parseDraftBody(raw: string): MaintenanceDraftInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BffValidationError(
      [{ field: "body", message: "Request body is not valid JSON" }],
      "Malformed request body",
    );
  }
  assertValidDraftInput(parsed);
  return parsed;
}

export function assertValidDraftInput(input: unknown): asserts input is MaintenanceDraftInput {
  const fieldErrors: FieldError[] = [];

  if (!input || typeof input !== "object") {
    throw new BffValidationError(
      [{ field: "body", message: "Request body must be a JSON object" }],
      "Malformed request body",
    );
  }

  const record = input as Record<string, unknown>;

  if (typeof record.title !== "string") {
    fieldErrors.push({ field: "title", message: "title is required and must be a string" });
  }
  if (typeof record.planned_start !== "string") {
    fieldErrors.push({ field: "planned_start", message: "planned_start is required and must be a string" });
  }
  if (record.scope !== "global" && record.scope !== "resource") {
    fieldErrors.push({ field: "scope", message: "scope must be 'global' or 'resource'" });
  }
  // `resource_ids` is dereferenced (`.map`) for `resource` scope; `global` drops
  // it, so only require the array when the scope actually reads it.
  if (record.scope === "resource" && !Array.isArray(record.resource_ids)) {
    fieldErrors.push({ field: "resource_ids", message: "resource_ids must be an array for resource scope" });
  }
  if (!Array.isArray(record.steps)) {
    fieldErrors.push({ field: "steps", message: "steps must be an array" });
  }
  if (!Array.isArray(record.notify_target_channel_ids)) {
    fieldErrors.push({
      field: "notify_target_channel_ids",
      message: "notify_target_channel_ids must be an array",
    });
  }

  if (fieldErrors.length > 0) {
    throw new BffValidationError(fieldErrors, "Malformed request body");
  }
}

/**
 * Domain `MaintenanceDraftInput` → `CreateDraftMaintRequest` /
 * `UpdateDraftMaintRequest` (same wire shape). Steps keep their human
 * `duration` string ("1h30m") — the write contract takes a Go-duration
 * string, NOT integer seconds. Resources become `{ id }` refs; `global`
 * scope carries no resources.
 */
export function mapDraftToCreateRequest(input: MaintenanceDraftInput): CreateDraftMaintRequestDto {
  const resourceIds = input.scope === "resource" ? input.resource_ids : [];
  return {
    approver_user_id: input.approver_user_id || undefined,
    title: input.title,
    description: input.description || undefined,
    planned_start: input.planned_start,
    scope: input.scope,
    impact: input.impact,
    resources: resourceIds.map((id) => ({ id })),
    steps: input.steps.map((step, index) => ({
      order: step.order || index + 1,
      description: step.description,
      duration: step.duration || undefined,
      rollback_description: step.rollback_description || undefined,
    })),
    // The backend requires `notify_targets: { channel_ids }` (min 1); folding
    // the flat domain list into the object shape is what unblocks create AND
    // edit (a missing field was the `notify_targets: cannot be blank` 400).
    notify_targets: { channel_ids: input.notify_target_channel_ids },
  };
}

/** `uimodels.AssignableUser` → domain `AssignableUser` (approver picker). */
export function mapAssignableUser(dto: AssignableUserDto): AssignableUser {
  const name = dto.display_name?.trim();
  return {
    id: dto.id,
    display_name: name && name.length > 0 ? name : (dto.email ?? UNKNOWN_USER),
    email: dto.email ?? "",
    roles: dto.roles ?? [],
  };
}

/**
 * `uimodels.MaintenanceCancelReason` → domain `MaintenanceCancelReason`.
 * Drops reasons whose `value` is outside the known enum so the UI never
 * renders a value it can't submit. Returns null for those (filter at call site).
 */
export function mapCancelReasonView(dto: MaintenanceCancelReasonDto): MaintenanceCancelReason | null {
  if (!CANCEL_REASONS.has(dto.value as CancelReason)) return null;
  return {
    value: dto.value as CancelReason,
    title: dto.title?.trim() ? dto.title : dto.value,
    description: dto.description?.trim() ? dto.description : undefined,
  };
}
