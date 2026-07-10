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
  /**
   * Notify channels the maintenance broadcasts to. Not yet emitted by the
   * backend read view (only the write path carries `notify_target_channel_ids`);
   * typed here so the mapper can pick it up defensively once it lands.
   */
  notify_targets?: MaintenanceViewNotifyTargetDto[];
  steps?: MaintenanceViewStepDto[];
  cancel_reason?: string;
  cancel_reason_comment?: string;
  created_at?: string;
  updated_at?: string;
}

/** A notify target as the read view would expose it (anticipated shape). */
export interface MaintenanceViewNotifyTargetDto {
  id?: string;
  channel_id?: string;
  name?: string;
  transport?: string;
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
  /** Authorship summary (RUK-169); null until the auth service resolves it. */
  created_by?: UserSummaryDto;
  updated_at?: string;
  updated_by?: UserSummaryDto;
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

// ---------------------------------------------------------------------------
// Notification channels (`apimodels.*`) — the notify-target catalog (RUK-164).
// ---------------------------------------------------------------------------

/**
 * `apimodels.Channel` — one notification channel in the catalog. `transport` is
 * a free-text key; `archived_at` is present (date-time) only once archived. The
 * authorship summaries match `UserSummaryDto` and are null until resolved.
 */
export interface ChannelDto {
  id: string;
  name?: string;
  description?: string;
  transport?: string;
  transport_channel_id?: string;
  /**
   * Delivery health of the transport's integration (RUK-198): `ok` /
   * `disabled` / `not_configured`, open-ended. Semantically required, but the
   * swagger style leaves it optional on the wire.
   */
  transport_status?: string;
  /** Present (date-time) only when the channel is archived. */
  archived_at?: string;
  created_at?: string;
  /** Null until the channel is first edited. */
  updated_at?: string;
  created_by?: UserSummaryDto;
  updated_by?: UserSummaryDto;
}

/** `apimodels.ChannelsResponse` — `{ channels: Channel[] }`, no pagination window. */
export interface ChannelsResponseDto {
  channels?: ChannelDto[];
}

/** `apimodels.CreateChannelRequest` — all fields free-text; backend enforces requireds. */
export interface CreateChannelRequestDto {
  name: string;
  description?: string;
  transport: string;
  transport_channel_id: string;
}

/**
 * `apimodels.UpdateChannelRequest` — partial update. `transport` is immutable
 * and intentionally absent (the backend ignores it if sent).
 */
export interface UpdateChannelRequestDto {
  name?: string;
  description?: string;
  transport_channel_id?: string;
}

/** `apimodels.Transport` — a supported transport `{ id, title }` (e.g. slack / Slack). */
export interface TransportDto {
  id?: string;
  title?: string;
  /** Delivery health of the transport's integration (RUK-198); see `ChannelDto`. */
  transport_status?: string;
}

/** `apimodels.TransportsResponse` — `{ transports: Transport[] }`. */
export interface TransportsResponseDto {
  transports?: TransportDto[];
}

// ---------------------------------------------------------------------------
// Write contracts (`apimodels.*`) — create / edit draft maintenance.
// ---------------------------------------------------------------------------

/** `apimodels.ResourceRef` — a resource referenced by id on write. */
export interface ResourceRefDto {
  id: string;
}

/**
 * `apimodels.MaintenanceStepInput` — the WRITE shape. Note `duration` is a
 * Go-duration string ("1h30m") here, distinct from `apimodels.MaintenanceStep.duration`
 * (integer seconds); `order` is 1-based. No `id`/`status` (backend assigns).
 */
export interface MaintenanceStepInputDto {
  order: number;
  description: string;
  /** Go-duration string, e.g. "1h30m". */
  duration?: string;
  rollback_description?: string;
}

/**
 * `apimodels.NotifyTargets` — Go struct `NotifyTargets{ ChannelIDs []string }`.
 * The backend requires at least one channel id; an empty/omitted object is
 * rejected with `notify_targets: cannot be blank` on create AND edit.
 */
export interface NotifyTargetsDto {
  channel_ids: string[];
}

/**
 * `apimodels.CreateDraftMaintRequest` — body for
 * `POST /api/v1/maintenances/create`. `UpdateDraftMaintRequest`
 * (`POST /api/v1/maintenances/{id}/edit`) shares the same shape.
 *
 * `notify_targets` is the OBJECT shape `{ channel_ids }` — NOT a bare string
 * array (the earlier `string[]` typing was wrong and meant the field was never
 * sent, blocking both create and edit).
 */
export interface CreateDraftMaintRequestDto {
  approver_user_id?: string;
  title: string;
  description?: string;
  /** ISO-8601 datetime. */
  planned_start: string;
  scope: string;
  impact: string;
  resources: ResourceRefDto[];
  steps: MaintenanceStepInputDto[];
  notify_targets: NotifyTargetsDto;
  deferred_notifications?: string[];
}

/** `apimodels.UpdateDraftMaintRequest` — same wire shape as create. */
export type UpdateDraftMaintRequestDto = CreateDraftMaintRequestDto;

/** `uimodels.AssignableUser` — `GET /api/v1/users/assignable`. */
export interface AssignableUserDto {
  id: string;
  display_name?: string;
  email?: string;
  roles?: string[];
}

/** `uimodels.ListAssignableUsersResponse` envelope. */
export interface ListAssignableUsersResponseDto {
  users?: AssignableUserDto[];
  limit?: number;
  offset?: number;
  total?: number;
}

/**
 * `uimodels.MaintenanceCancelReason` — `GET /api/v1/maintenances/cancel-reasons`.
 * The endpoint exposes the enum value plus display text (title/desc); the
 * values match the frozen UI enum (`conflict|incident|...`).
 */
export interface MaintenanceCancelReasonDto {
  value: string;
  title?: string;
  description?: string;
}

/**
 * `apiauthmodels.AuditLog` (auth service swagger). `action` is the dotted
 * `entity.AuditAction` enum (e.g. `login.success`, `maintenance.created`);
 * `details` is a free-text fallback string (NOT a JSON object). Per-maintenance
 * scoping rides on `entity_id` (`entity_type` is `user` | `maintenance`).
 */
export interface AuditLogDto {
  id?: string;
  action?: string;
  actor?: string;
  actor_id?: string;
  /** Human display name of the actor at event time (write-time snapshot). */
  actor_display_name?: string;
  created_at?: string;
  /** One-line human summary (legacy/fallback display). */
  details?: string;
  /** `entity.AuditEntityType` — `user` | `maintenance`. */
  entity_type?: string;
  entity_id?: string;
  /** Structured per-action payload — present on the upgraded contract. */
  metadata?: AuditLogMetadataDto;
}

/**
 * `apiauthmodels.AuditLogFieldChange` — one before/after diff entry, set on
 * `maintenance.updated` (one per changed scalar field).
 */
export interface AuditLogFieldChangeDto {
  field?: string;
  old?: string;
  new?: string;
}

/**
 * `apiauthmodels.AuditLogMetadata` — action-specific structured payload that
 * backs the expandable-row detail grids. Every field is optional; which ones
 * are populated depends on the action: login → ip/user_agent/session_id
 * (+failure_reason on `login.failed`); logout → session_id/logout_kind;
 * `roles.changed`/`user.blocked`/`user.unblocked` → roles_added/removed/roles
 * + target_*; `maintenance.*`/`maintenance_step.*` → maint_title (+ changes on
 * `maintenance.updated`).
 */
export interface AuditLogMetadataDto {
  ip?: string;
  user_agent?: string;
  session_id?: string;
  failure_reason?: string;
  logout_kind?: string;
  roles?: string[];
  roles_added?: string[];
  roles_removed?: string[];
  target_display_name?: string;
  target_email?: string;
  /** Maintenance title snapshot — `maintenance.*` / `maintenance_step.*`. */
  maint_title?: string;
  /** Per-field before/after diff — `maintenance.updated`. */
  changes?: AuditLogFieldChangeDto[];
}

/** `apiauthmodels.AuditFacets` — category counts over the actor/date window. */
export interface AuditFacetsDto {
  all?: number;
  auth?: number;
  roles?: number;
  block?: number;
  maintenance?: number;
}

/** `apiauthmodels.AuditLogResponse` — `{ logs, total, facets }`. */
export interface AuditLogResponseDto {
  logs?: AuditLogDto[];
  total?: number;
  facets?: AuditFacetsDto;
}
