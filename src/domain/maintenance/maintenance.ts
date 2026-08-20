/**
 * Domain models for maintenance windows, derived from the backend
 * swagger contract (`apimodels.Maintenance` + neighbours). These types
 * are deliberately simplified — fields the UI doesn't read are dropped;
 * enum unions live in TypeScript instead of strings-for-strings-sake.
 *
 * The corresponding contract (swagger) types live in
 * `src/server/backend/contracts/`; mappers there translate the backend
 * spelling onto these domain shapes so the UI never sees the wire format.
 */

export type MaintenanceStatus = "draft" | "planned" | "in_progress" | "completed" | "canceled";

export type MaintenanceImpact = "none" | "partial_outage" | "full_outage";

/** Wire values per swagger `apimodels.MaintenanceScope`. */
export type MaintenanceScope = "global" | "resource";

export type CancelReason = "conflict" | "incident" | "business_decision" | "rescheduled" | "mistake";

export interface Period {
  start: string;
  end: string;
}

export interface MaintenanceResource {
  id: string;
  name: string;
  /** Snapshot calls this `database | cluster | service`; backend keeps it free-text. */
  type?: string;
}

/**
 * A notify target as it would surface on the read path — the channel the
 * maintenance broadcasts to. The write contract already carries
 * `notify_target_channel_ids`; the read view does not expose `notify_targets`
 * yet (backend gap), so `Maintenance.notify_targets` is currently always empty.
 * The mapper reads it defensively so the Notify-channels section lights up the
 * moment the backend starts returning it — no further UI change needed.
 */
export interface MaintenanceNotifyTarget {
  id: string;
  /** Human channel name, e.g. "#incidents-eu". */
  name: string;
  /** Transport glyph driver: `slack | telegram | email | …` (open string). */
  transport?: string;
}

export type StepStatus = "pending" | "in_progress" | "done" | "skipped";

export interface MaintenanceStep {
  id: string;
  /** Display label. Mapped from backend `description` (swagger has no `title`). */
  title: string;
  description?: string;
  /** 1-based position from backend `order`, when present. */
  order?: number;
  /** ISO duration string (e.g. "PT5M") OR human "5m" — UI normalizes for display. */
  duration?: string;
  /** Backend rollback plan for the step, when present. */
  rollback_description?: string;
  status: StepStatus;
  started_at?: string;
  completed_at?: string;
}

/**
 * Actions the current user may take on this maintenance. Backend computes
 * these from role × status × can_admin; UI MUST consume the flags
 * directly (frozen decision: no client-side recomputation).
 */
export interface MaintenanceActions {
  can_edit: boolean;
  can_cancel: boolean;
  can_approve: boolean;
  can_start: boolean;
  can_complete: boolean;
}

export interface Conflict {
  maintenance_id: string;
  /** Display reference, e.g. "MNT-1042". */
  reference?: string;
  title: string;
  /** Overlap window. */
  overlap_start: string;
  overlap_end: string;
  /** Resolved when the conflicting maintenance is canceled or moved out of the window. */
  resolved?: boolean;
  /**
   * The conflicting maintenance's OWN scope. Nothing renders it — it exists so
   * approve can echo it back in `conflicts_snapshot`, where the backend
   * fingerprints it. Do not delete it as unused (RUK-247).
   */
  scope: MaintenanceScope;
  /**
   * Resources this conflict is about: the INTERSECTION of the neighbour's
   * resources with ours, not the neighbour's full set. Populated for every
   * conflict regardless of `scope` — a `global` neighbour can carry a non-empty
   * intersection — and echoed back on approve unconditionally. Gating the echo
   * on `scope` yields a 409 (SPEC §3.2.1).
   */
  resources: MaintenanceResource[];
  /**
   * Whether the approver had already seen this conflict at the moment they
   * approved (RUK-178). `false` means nobody reviewed it — either it appeared
   * after approval, or the maintenance is still a draft, which the UI tells
   * apart by the maintenance status.
   *
   * An absent wire value maps to `false`, never `true`: claiming the approver
   * saw something on the strength of missing data would be a false audit
   * statement.
   */
  known_at_approval: boolean;
}

/**
 * Should this conflict be flagged as one the approver never reviewed?
 *
 * Both the detail page and the quick sheet render the marker, and both need the
 * draft gate: a draft has never been approved, so `known_at_approval` is `false`
 * for every one of its conflicts and flagging them would mark every row. The
 * rule lives here rather than at the two render sites because it was duplicated
 * across them and only one copy was covered — deleting the gate from the quick
 * sheet left the entire suite green.
 */
export function isUnreviewedConflict(status: MaintenanceStatus, conflict: Conflict): boolean {
  return status !== "draft" && !conflict.known_at_approval;
}

/**
 * A calendar-grid event — what `GET /ui/v1/calendar` actually returns, projected
 * into the domain.
 *
 * Deliberately NOT {@link Maintenance}. That type is the DETAIL page's shape, and
 * reusing it here forced `mapCalendarResponse` to invent five fields the calendar
 * wire never carried: `notify_targets`, `steps`, `created_at`, `updated_at` (all
 * removed in RUK-258) and `resources` (kept, see below). They were serialized
 * into every event of every calendar response and read by nobody — ~103 B per
 * event, about 27% of the payload.
 *
 * Three things in this area are called "calendar event". Keep them apart:
 *
 * | name                             | layer                          | meaning                  |
 * | -------------------------------- | ------------------------------ | ------------------------ |
 * | `CalendarEventDto`               | wire (`src/server/backend/`)   | what the backend sends   |
 * | `CalendarEvent`                  | domain (this type)             | what the UI reads        |
 * | `CalendarEventProps`/`EventInput`| view (`event-mapping.ts`)      | FullCalendar's own event |
 *
 * Do NOT let this type acquire wire spellings (flat `start`/`end`, a
 * `UserSummaryDto` author). The mapper is where the wire stops.
 */
export interface CalendarEvent {
  id: string;
  title: string;
  status: MaintenanceStatus;
  impact: MaintenanceImpact;
  scope: MaintenanceScope;
  planned_period: Period;
  /**
   * Always empty, and — since RUK-256 — read by NOTHING.
   *
   * The backend confirmed it will not add `resources` to calendar events: the
   * endpoint takes `resource_ids` as a filter instead and answers with an
   * already-narrowed window. So the sidebar stopped filtering on this field
   * (`matchesFilters` now checks `scope` alone, and `resourceOptions` is gone),
   * and nothing replaced those readers.
   *
   * That makes this a dormant stub. Retiring it — here, in
   * `mapCalendarResponse`, in `MOCK_CALENDAR_EVENTS`, in the payload contract
   * test, and moving its row in `docs/contract-gaps.md` from Class B to Class C
   * — is a follow-up ticket, kept separate because detection and repair are
   * separate changes (AGENTS.md). Do not build anything new on this field.
   */
  resources: MaintenanceResource[];
  /**
   * Author display name, flattened from the wire's `UserSummaryDto` by
   * `mapUserSummary`. A projection of received data, not a stub.
   */
  created_by?: string;
}

export interface Maintenance {
  id: string;
  reference?: string;
  title: string;
  description?: string;
  status: MaintenanceStatus;
  impact: MaintenanceImpact;
  scope: MaintenanceScope;
  planned_period: Period;
  actual_period?: Period;
  resources: MaintenanceResource[];
  /**
   * Notify channels the maintenance broadcasts to. Read-only on this shape.
   * Empty until the backend adds `notify_targets` to the read view (see
   * {@link MaintenanceNotifyTarget}).
   */
  notify_targets: MaintenanceNotifyTarget[];
  steps: MaintenanceStep[];
  /** Set when status=canceled. */
  cancel_reason?: CancelReason;
  cancel_reason_comment?: string;
  /** Author display name (backend `created_by.display_name`, may be "Unknown user"). */
  created_by?: string;
  /** Approver display name (backend `approver.display_name`), set once approved. */
  approver?: string;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceDetail extends Maintenance {
  actions: MaintenanceActions;
  conflicts: Conflict[];
  /**
   * Integer optimistic-concurrency revision (backend `revision`). Sent back
   * as `observed_maint_revision` on approve.
   */
  revision?: number;
  /**
   * Saved advance reminders, ordered by `fire_at`. Lives on the detail (not on
   * `Maintenance`) because only the detail read view carries them — the calendar
   * projection has no reminders.
   */
  reminders: MaintenanceReminder[];
  /**
   * People tagged in the notification, in insertion order. Lives on the detail
   * (not on `Maintenance`) for the same reason as {@link reminders} — only the
   * detail read view carries them, the calendar projection has none.
   *
   * `undefined` means the backend predates mentions and never sent the key: the
   * read view documents this as always an array, never null, so an absent field
   * is an unambiguous version detect (the form hides the field on it). `[]`
   * means the contract is there and nobody was tagged.
   */
  mentions?: MaintenanceMention[];
}

/**
 * One tagged person as the detail read view exposes it. Deliberately carries no
 * messenger-tag flag (backend `uimodels.MentionView`): the detail shows who was
 * mentioned, not who has a messenger configured, and the endpoint is readable by
 * guests. `display_name` may be the literal "Unknown user" for someone deleted
 * or unresolvable — the backend keeps the row rather than dropping it, so the UI
 * never silently loses a mention.
 */
export interface MaintenanceMention {
  user_id: string;
  display_name: string;
}

/**
 * A saved reminder as the read view exposes it. The absolute `fire_at` is the
 * stored truth; the edit form derives its offset back out (see
 * `toOffsetFromFireAt`), since the backend never stores the chosen preset.
 */
export interface MaintenanceReminder {
  id: string;
  /** ISO-8601 datetime the reminder fires at. */
  fire_at: string;
  /** True once the goque task is queued — only ever after approval. */
  scheduled: boolean;
}

/**
 * A single step as the create/edit form submits it. Distinct from the read
 * `MaintenanceStep`: no `id`/`status` (assigned by the backend), and
 * `duration` is the human Go-duration string (e.g. "1h30m") the write
 * contract expects.
 */
export interface MaintenanceStepInput {
  /** 1-based position. */
  order: number;
  description: string;
  /** Go-duration string, e.g. "1h30m". Empty/undefined when unset. */
  duration?: string;
  rollback_description?: string;
}

/**
 * Form payload for creating a draft and editing an existing one (both hit the
 * same backend shape — `CreateDraftMaintRequest` / `UpdateDraftMaintRequest`).
 * The BFF mapper translates this onto the wire contract.
 */
export interface MaintenanceDraftInput {
  title: string;
  description?: string;
  /** ISO-8601 datetime of the planned start. */
  planned_start: string;
  scope: MaintenanceScope;
  impact: MaintenanceImpact;
  /** Resource ids in scope (empty for `global`). */
  resource_ids: string[];
  steps: MaintenanceStepInput[];
  /** Chosen approver (backend `approver_user_id`), when picked. */
  approver_user_id?: string;
  /**
   * Notification channel ids the maintenance broadcasts to. Required by the
   * backend (`notify_targets: { channel_ids }`, min 1) — a blank list is
   * rejected with `notify_targets: cannot be blank` on BOTH create and edit.
   * Channel ids come from the catalog (`@/domain/notify-channel`).
   */
  notify_target_channel_ids: string[];
  /**
   * Advance reminders, as offsets in minutes BEFORE `planned_start` (e.g. 1440 =
   * "1 day before"). The wire contract carries absolute instants
   * (`deferred_notifications: [{ fire_at }]`); the offset is the operator's
   * mental model and the only thing worth holding in form state, so the mapper
   * resolves `fire_at = planned_start − offset` at the boundary.
   *
   * Empty or absent means "no reminders" — the mapper omits the wire field
   * entirely rather than sending `[]`, which the backend reads as "leave
   * unchanged" on edit. Optional so a client that predates reminders (or simply
   * has none) stays a valid body; `assertValidDraftInput` matches.
   */
  reminder_offsets_minutes?: number[];
  /**
   * User ids to tag in the notification, on top of the delivery channels. Held
   * as bare ids because that is the operator's mental model; the wire contract
   * carries objects (`mentions: [{ user_id }]`) so it can gain keys without a
   * breaking change, and the mapper wraps them at the boundary.
   *
   * Empty or absent means "nobody tagged" — but unlike
   * {@link reminder_offsets_minutes}, the mappers must NOT treat the two alike:
   * edit has to send `[]` so cleared mentions are actually deleted, while create
   * omits the field. Optional so a client that predates mentions stays a valid
   * body; `assertValidDraftInput` matches.
   */
  mention_user_ids?: string[];
}

/**
 * A user eligible to be picked as approver. Backend
 * `uimodels.AssignableUser` (`GET /api/v1/users/assignable`).
 */
export interface AssignableUser {
  id: string;
  display_name: string;
  email: string;
  roles: string[];
  /**
   * Whether the user has a messenger handle a mention can actually reach.
   * Tri-state ON PURPOSE — optional so `undefined` survives as its own answer:
   *
   * - `true` — reachable, no warning
   * - `false` — the backend checked and found no handle, warn on the picker row
   * - `undefined` — we don't know (backend predates the flag, or the entry came
   *   from detail hydration rather than the picker) — warn about nothing
   *
   * Never collapse this with `?? false`: that turns "we don't know" into "no
   * handle" and makes the UI warn on data it never had.
   */
  has_messenger_tag?: boolean;
}

/**
 * A cancel reason as the backend exposes it (`GET
 * /api/v1/maintenances/cancel-reasons`): the enum `value` plus display text.
 * The hardcoded fallback in the cancel dialog mirrors this shape.
 */
export interface MaintenanceCancelReason {
  value: CancelReason;
  title: string;
  description?: string;
}
