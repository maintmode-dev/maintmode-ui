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
  /**
   * Did the approver already see this conflict when they approved?
   *
   * Optional here only because the generated Go client types it `*bool` with
   * `omitempty` — the server field is a plain `bool` and is ALWAYS serialized.
   * So `undefined` means "backend predates RUK-178", not "backend chose to omit
   * it"; do not drop the `?` on the assumption that it is always present.
   *
   * `false` is deliberately ambiguous on the backend side: it covers both "the
   * conflict appeared after approval" and "the snapshot read failed". Tell the
   * two apart via the maintenance status, never by inventing a third state.
   */
  known_at_approval?: boolean;
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
  /** Notify channels the maintenance broadcasts to, resolved from the catalog. */
  notify_targets?: MaintenanceViewNotifyTargetDto[];
  /**
   * Advance reminders, ordered by `fire_at`, so the edit screen can hydrate the
   * already-saved schedule. The backend documents this as always an array
   * (empty when none) — still optional here because every other read-view field
   * is, and a defensive `?? []` costs nothing.
   */
  deferred_notifications?: DeferredNotificationViewDto[];
  /**
   * People tagged in the notification, in insertion order (the storage query
   * pins `ORDER BY created_at, id`). The backend documents this as always an
   * array, never null — so unlike the other read-view fields, an ABSENT key here
   * is load-bearing: it means the deployed backend predates mentions, and the
   * mapper must keep it distinguishable from `[]`. No defensive `?? []`.
   */
  mentions?: MentionViewDto[];
  steps?: MaintenanceViewStepDto[];
  cancel_reason?: string;
  cancel_reason_comment?: string;
  created_at?: string;
  updated_at?: string;
}

/** A notify target as the read view exposes it. */
export interface MaintenanceViewNotifyTargetDto {
  id?: string;
  channel_id?: string;
  name?: string;
  transport?: string;
}

/**
 * `uimodels.MentionView` — one tagged person on the read path.
 *
 * Distinct from the write-side `MentionDto`: it adds `display_name`, resolved in
 * one batch alongside the author and approver (no N+1). It deliberately carries
 * NO messenger-tag flag — the detail view shows who was mentioned, not who has a
 * messenger configured, and the endpoint is readable by guests. An unresolvable
 * user comes back as "Unknown user" rather than being dropped.
 */
export interface MentionViewDto {
  user_id: string;
  display_name?: string;
}

/**
 * `uimodels.DeferredNotificationView` — one saved reminder on the read path.
 *
 * Distinct from the write-side `DeferredNotificationDto`: this one carries the
 * row `id` and `scheduled`. `scheduled` is false while the maintenance is a
 * draft (goque tasks are only enqueued on approve) and true once queued.
 */
export interface DeferredNotificationViewDto {
  id?: string;
  /** ISO-8601 datetime the reminder fires at. */
  fire_at?: string;
  scheduled?: boolean;
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
  /** Authorship summary; null until the auth service resolves it. */
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
// Notification channels (`apimodels.*`) — the notify-target catalog.
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
   * Delivery health of the transport's integration: `ok` /
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

/**
 * `apimodels.ChannelsResponse` — a paginated window, same shape as
 * `ListResourcesResponseDto`.
 *
 * `total` is the count the query matched, not the catalog size: under a `name`
 * filter it is the number of matches (measured — 246 across two disjoint pages),
 * and `include_archived` widens it.
 */
export interface ChannelsResponseDto {
  channels?: ChannelDto[];
  limit?: number;
  offset?: number;
  total?: number;
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
  /** Delivery health of the transport's integration; see `ChannelDto`. */
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
 * `apimodels.DeferredNotification` — one advance reminder for a maintenance.
 *
 * The backend stores ONLY the absolute instant: there is no `offset` /
 * `lead_time` / `notify_before` field, by design. The UI presets ("1 day
 * before", …) are client-side sugar — the mapper resolves them against
 * `planned_start` and sends absolute timestamps.
 */
export interface DeferredNotificationDto {
  /** ISO-8601 datetime the reminder fires at. */
  fire_at: string;
}

/**
 * `apimodels.Mention` — one person to tag in the notification.
 *
 * An OBJECT rather than a bare uuid, verbatim per the backend comment: the
 * contract can gain keys without a breaking change. Sending `string[]` would be
 * rejected — the same mistyping that silently blocked `notify_targets` and
 * `deferred_notifications` before RUK-216.
 */
export interface MentionDto {
  user_id: string;
}

/**
 * `apimodels.CreateDraftMaintRequest` — body for
 * `POST /api/v1/maintenances/create`.
 *
 * NOT interchangeable with `UpdateDraftMaintRequestDto`: the two diverged when
 * the backend made update's `deferred_notifications` (and later `mentions`)
 * tri-state (see below). Create has no "unchanged" state — the maintenance
 * either starts with reminders/mentions or with none — so both stay flat arrays.
 *
 * `notify_targets` is the OBJECT shape `{ channel_ids }` — NOT a bare string
 * array (the earlier `string[]` typing was wrong and meant the field was never
 * sent, blocking both create and edit). `deferred_notifications` is an array of
 * OBJECTS for the same reason — it was mistyped as `string[]` here too, which is
 * why the field had never been sent at all (RUK-216).
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
  /**
   * Advance reminders the maintenance starts with. Omitted when none are picked;
   * on create there is no "unchanged" state to distinguish, so `[]` and an
   * absent field mean the same thing.
   */
  deferred_notifications?: DeferredNotificationDto[];
  /**
   * People to tag in the notification on top of the delivery channels. Omitted
   * when nobody is picked; on create there is no "unchanged" state to
   * distinguish, so `[]` and an absent field mean the same thing.
   */
  mentions?: MentionDto[];
}

/**
 * `apimodels.UpdateDraftMaintRequest` — body for
 * `POST /api/v1/maintenances/{id}/edit`. Same as create EXCEPT
 * `deferred_notifications` and `mentions`, which are tri-state here.
 */
export interface UpdateDraftMaintRequestDto extends Omit<
  CreateDraftMaintRequestDto,
  "deferred_notifications" | "mentions"
> {
  /**
   * Tri-state, carried by `*[]*DeferredNotification` on the Go side and gated
   * with `cmd.DeferredNotifications != nil` (`update_maint.go:107`):
   *
   * - **omitted / `null`** → leave the saved reminders unchanged
   * - **`[]`** → clear them (hard-deletes the rows)
   * - **non-empty** → replace the whole set
   *
   * `undefined` and `null` are equivalent on the wire, since `JSON.stringify`
   * drops an `undefined` value. The distinction that matters to the mapper is
   * `[]` (clear) vs absent (unchanged) — conflating them is exactly the bug the
   * backend fixed in `53d3ba0c`, where unchecking every reminder silently kept
   * them and they still fired.
   */
  deferred_notifications?: DeferredNotificationDto[] | null;
  /**
   * Tri-state, carried by `*[]*Mention` on the Go side, with the same three
   * readings as `deferred_notifications` above:
   *
   * - **omitted / `null`** → leave the saved mentions unchanged
   * - **`[]`** → clear them
   * - **non-empty** → replace the whole set
   *
   * The trap runs OPPOSITE to the reminders mapper, which omits the field when
   * the form has none: doing that here would leave un-picked mentions tagged. An
   * emptied picker must send `[]`. Equally, `[]` must never be sent for a set we
   * failed to resolve — that clears mentions the operator never saw.
   */
  mentions?: MentionDto[] | null;
}

/** `uimodels.AssignableUser` — `GET /api/v1/users/assignable`. */
export interface AssignableUserDto {
  id: string;
  display_name?: string;
  email?: string;
  roles?: string[];
  /**
   * Whether the user has a messenger handle a mention can reach. On the Go side
   * this is a non-pointer `bool` without `omitempty`, so the key is ALWAYS
   * present — deliberately, so the frontend never confuses "not permitted" with
   * "no handle". It is gated behind `maintenance.create` and hard-false per row
   * for guests. Optional here only because an absent key is a real signal: a
   * backend predating the flag. The mapper must pass it through untouched.
   */
  has_messenger_tag?: boolean;
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
  /**
   * Integration events. The backend has been counting these all along; this
   * type did not declare the field, so `mapAuditFacets` dropped it and the
   * category could not render. Found by the RUK-254 DTO↔wire reconciliation,
   * not by anyone noticing a missing tab — the count is 0 on the dev seed, so
   * there was no visible symptom to notice.
   */
  integration?: number;
}

/** `apiauthmodels.AuditLogResponse` — `{ logs, total, facets }`. */
export interface AuditLogResponseDto {
  logs?: AuditLogDto[];
  total?: number;
  facets?: AuditFacetsDto;
}
