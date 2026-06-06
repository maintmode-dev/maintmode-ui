/**
 * Backend wire contracts for the maintmode UI endpoints, transcribed verbatim
 * from `maintmode/docs/maintmode/swagger.yaml` (`uimodels.*` for the UI read
 * endpoints, `apimodels.*` for the write requests).
 *
 * These types are SERVER-ONLY: they live under `src/server/backend/**` and are
 * consumed exclusively by the mappers in `./maintenance-mapper.ts` and the BFF
 * routes. Browser code must never import them — it sees only the domain shapes
 * in `src/domain/**` (enforced by `scripts/check-boundaries.mjs`).
 *
 * Fields are optional where swagger does not mark them required and where the
 * backend may legitimately omit them (e.g. `actual_time_*` before a window
 * starts, `approver` before approval).
 */

/** `uimodels.UserSummary`. `display_name` may be the literal "Unknown user". */
export interface UserSummaryDto {
  id?: string;
  email?: string;
  display_name?: string;
}

/** `uimodels.CalendarEvent` — flat projection, no period/steps/resources. */
export interface CalendarEventDto {
  id: string;
  title?: string;
  /** ISO-8601 date-time. */
  start?: string;
  /** ISO-8601 date-time. */
  end?: string;
  status?: string;
  scope?: string;
  impact?: string;
  created_by?: UserSummaryDto;
}

/** `uimodels.CalendarViewMeta`. */
export interface CalendarViewMetaDto {
  count?: number;
  truncated?: boolean;
}

/** `uimodels.CalendarViewResponse`. */
export interface CalendarViewResponseDto {
  events?: CalendarEventDto[];
  meta?: CalendarViewMetaDto;
}

/** `uimodels.MaintenanceViewResource` — only `{ id, name }` on the wire. */
export interface MaintenanceViewResourceDto {
  id: string;
  name?: string;
}

/** `uimodels.MaintenanceStep` — note `description` (no `title`) and integer `order`. */
export interface MaintenanceViewStepDto {
  id: string;
  order?: number;
  description?: string;
  /** Human duration string, e.g. "1h30m". */
  duration?: string;
  rollback_description?: string;
  planned_time_start?: string;
  planned_time_end?: string;
  status?: string;
}

/** `uimodels.ConflictView` — no `reference`, no `resolved`. */
export interface ConflictViewDto {
  maintenance_id: string;
  title?: string;
  scope?: string;
  overlap_start?: string;
  overlap_end?: string;
  resources?: MaintenanceViewResourceDto[];
}

/** `uimodels.MaintenanceActions` — already 1:1 with the domain shape. */
export interface MaintenanceActionsDto {
  can_edit?: boolean;
  can_cancel?: boolean;
  can_approve?: boolean;
  can_start?: boolean;
  can_complete?: boolean;
}

/** `uimodels.MaintenanceView` — flat `*_time_*`, integer `revision`. */
export interface MaintenanceViewDto {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  impact?: string;
  scope?: string;
  planned_time_start?: string;
  planned_time_end?: string;
  actual_time_start?: string;
  actual_time_end?: string;
  /** Integer optimistic-concurrency revision (NOT a string snapshot id). */
  revision?: number;
  created_by?: UserSummaryDto;
  approver?: UserSummaryDto;
  resources?: MaintenanceViewResourceDto[];
  steps?: MaintenanceViewStepDto[];
  cancel_reason?: string;
  cancel_reason_comment?: string;
  created_at?: string;
  updated_at?: string;
}

/** `uimodels.MaintenanceViewResponse` envelope. */
export interface MaintenanceViewResponseDto {
  maintenance: MaintenanceViewDto;
  actions?: MaintenanceActionsDto;
  conflicts?: ConflictViewDto[];
}

/**
 * `apimodels.Resource` — the resource read shape. No `type`/`owner`: archival
 * is a lifecycle `status` toggled via the archive/unarchive endpoints, and the
 * operator-facing handle is `external_id`.
 */
export interface ResourceDto {
  id: string;
  name?: string;
  description?: string;
  external_id?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

/** `apimodels.ListResourcesResponse` — paginated list envelope. */
export interface ListResourcesResponseDto {
  resources?: ResourceDto[];
  limit?: number;
  offset?: number;
  total?: number;
}

/** `apimodels.CreateResourceRequest` — `name` required, rest optional. */
export interface CreateResourceRequestDto {
  name: string;
  description?: string;
  external_id?: string;
}

/**
 * `apimodels.UpdateResourceRequest` — every field optional (partial update).
 * Sending `external_id: ""` clears the stored value server-side.
 */
export interface UpdateResourceRequestDto {
  name?: string;
  description?: string;
  external_id?: string;
}
