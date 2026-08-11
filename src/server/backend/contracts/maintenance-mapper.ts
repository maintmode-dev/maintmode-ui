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
 *  - conflicts    : `ConflictView` (no reference/resolved) → domain `Conflict`,
 *                   carrying `scope`/`resources` through for the approve echo.
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
  MaintenanceMention,
  MaintenanceNotifyTarget,
  MaintenanceReminder,
  MaintenanceResource,
  MaintenanceScope,
  MaintenanceStatus,
  MaintenanceStep,
  Period,
  StepStatus,
} from "@/domain/maintenance/maintenance";
import { MAX_MENTIONS } from "@/domain/maintenance/mentions";
import { MAX_OFFSET_MINUTES, MAX_REMINDERS, toFireAt } from "@/domain/maintenance/reminders";

import { BffValidationError, type FieldError } from "@/server/backend/errors/bff-error";

import type {
  AssignableUserDto,
  CalendarViewResponseDto,
  ConflictViewDto,
  CreateDraftMaintRequestDto,
  DeferredNotificationDto,
  DeferredNotificationViewDto,
  MaintenanceCancelReasonDto,
  MaintenanceViewDto,
  MaintenanceViewNotifyTargetDto,
  MaintenanceViewResourceDto,
  MaintenanceViewResponseDto,
  MaintenanceViewStepDto,
  MentionDto,
  MentionViewDto,
  UpdateDraftMaintRequestDto,
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

/** Read-view notify targets → domain. */
export function mapNotifyTargets(
  targets: MaintenanceViewNotifyTargetDto[] | undefined,
): MaintenanceNotifyTarget[] {
  return (targets ?? [])
    .map((t) => ({ id: t.id ?? t.channel_id ?? "", name: t.name ?? "", transport: t.transport }))
    .filter((t) => t.id || t.name);
}

/**
 * Read-view reminders → domain, so Edit can hydrate the saved schedule
 * (backend `90488d0e`). Entries without a `fire_at` are dropped rather than
 * carried as an empty string: the form derives an offset from this instant, and
 * an unparseable one would render as a phantom reminder the operator can't act
 * on. The backend already orders by `fire_at`; the sort keeps that guarantee
 * local rather than assuming it.
 */
export function mapReminders(reminders: DeferredNotificationViewDto[] | undefined): MaintenanceReminder[] {
  return (reminders ?? [])
    .filter((r): r is DeferredNotificationViewDto & { fire_at: string } => Boolean(r.fire_at))
    .map((r) => ({ id: r.id ?? "", fire_at: r.fire_at, scheduled: r.scheduled ?? false }))
    .sort((a, b) => a.fire_at.localeCompare(b.fire_at));
}

/**
 * Read-view mention → domain, so Edit can hydrate the tagged people and the
 * detail can name them (RUK-218).
 *
 * `display_name` is defended through `mapUserSummary` — the same trim/fallback
 * every other read DTO here gets. The backend already substitutes its own
 * "Unknown user" for someone deleted or unresolvable, but this is what the chips
 * render, so it is not left to trust.
 */
export function mapMention(mention: MentionViewDto): MaintenanceMention {
  return {
    user_id: mention.user_id,
    display_name: mapUserSummary(mention),
  };
}

/**
 * `ConflictView` → domain `Conflict`. No `reference`/`resolved` on the wire.
 *
 * `scope` and `resources` are carried through even though nothing renders them:
 * approve echoes them back in `conflicts_snapshot` and the backend fingerprints
 * the echo. Dropping them here is what made every approve of a conflicted
 * maintenance fail with 400 (RUK-247).
 */
export function mapConflict(conflict: ConflictViewDto): Conflict {
  return {
    maintenance_id: conflict.maintenance_id,
    title: conflict.title ?? "Untitled maintenance",
    overlap_start: conflict.overlap_start ?? "",
    overlap_end: conflict.overlap_end ?? "",
    scope: mapScope(conflict.scope),
    resources: (conflict.resources ?? []).map(mapResource),
    // Absent → `false` (not reviewed). Never `?? true`: that would assert the
    // approver saw a conflict on the strength of a field the backend didn't
    // send (RUK-178).
    known_at_approval: conflict.known_at_approval ?? false,
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
    reminders: mapReminders(m.deferred_notifications),
    // Deliberately NOT `?? []`. The read view documents `mentions` as always an
    // array, never null, so an ABSENT key is an unambiguous version detect: the
    // deployed backend predates mentions and the form hides the field entirely.
    // `[]` is the other answer — the contract is there, nobody was tagged.
    mentions: m.mentions ? m.mentions.map(mapMention) : undefined,
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
  } else if (!Number.isFinite(new Date(record.planned_start).getTime())) {
    // Reminder offsets resolve against this instant, so an unparseable start
    // would drop every one of them on the floor. Reject the body instead.
    fieldErrors.push({ field: "planned_start", message: "planned_start must be a valid date-time" });
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
  // Reminder offsets are optional (absent === none), but when present they are
  // `.map`ped, so a non-array is a 400 rather than a mapper TypeError. The cap
  // is enforced here too: the backend rejects >10 with a generic error, and this
  // turns it into a field-scoped one the form can render.
  if (record.reminder_offsets_minutes !== undefined) {
    if (!Array.isArray(record.reminder_offsets_minutes)) {
      fieldErrors.push({
        field: "reminder_offsets_minutes",
        message: "reminder_offsets_minutes must be an array",
      });
    } else if (record.reminder_offsets_minutes.length > MAX_REMINDERS) {
      fieldErrors.push({
        field: "reminder_offsets_minutes",
        message: `At most ${MAX_REMINDERS} reminders.`,
      });
    } else if (
      // Whole minutes only, and within the same horizon the picker enforces.
      // A fractional offset would survive the round trip badly: hydration rounds
      // to the minute, so re-opening Edit would silently rewrite the instant.
      record.reminder_offsets_minutes.some(
        (m) => typeof m !== "number" || !Number.isInteger(m) || m <= 0 || m > MAX_OFFSET_MINUTES,
      )
    ) {
      fieldErrors.push({
        field: "reminder_offsets_minutes",
        message: `reminder_offsets_minutes must contain whole minutes between 1 and ${MAX_OFFSET_MINUTES}`,
      });
    }
  }
  // Mentions are optional and `.map`ped by the mappers, so the same structural
  // treatment as the reminder offsets above: array-or-400, and the cap turned
  // into a field-scoped error because the backend rejects >10 with a generic
  // `invalid request` the form cannot attribute to a field.
  //
  // This guard stays DIRECTION-AGNOSTIC on purpose — `parseDraftBody` calls it
  // for both the create and the edit route. Whether an empty list means "clear"
  // or "leave unchanged" is a wire-semantics question that lives exclusively in
  // the two mappers, exactly as it does for `reminder_offsets_minutes`.
  if (record.mention_user_ids !== undefined) {
    if (!Array.isArray(record.mention_user_ids)) {
      fieldErrors.push({
        field: "mention_user_ids",
        message: "mention_user_ids must be an array",
      });
    } else if (record.mention_user_ids.length > MAX_MENTIONS) {
      fieldErrors.push({
        field: "mention_user_ids",
        message: `At most ${MAX_MENTIONS} mentions.`,
      });
    } else if (record.mention_user_ids.some((id) => typeof id !== "string" || id.trim().length === 0)) {
      // A blank id would reach the backend as a nil-uuid and come back as the
      // same unattributable 400.
      fieldErrors.push({
        field: "mention_user_ids",
        message: "mention_user_ids must contain non-empty user ids",
      });
    }
  }

  if (fieldErrors.length > 0) {
    throw new BffValidationError(fieldErrors, "Malformed request body");
  }
}

/**
 * Domain `MaintenanceDraftInput` → `CreateDraftMaintRequest`. Steps keep their
 * human `duration` string ("1h30m") — the write contract takes a Go-duration
 * string, NOT integer seconds. Resources become `{ id }` refs; `global`
 * scope carries no resources.
 *
 * Create and update are NOT the same request any more — use
 * `mapDraftToUpdateRequest` for edit, whose `deferred_notifications` and
 * `mentions` are tri-state.
 */
export function mapDraftToCreateRequest(input: MaintenanceDraftInput): CreateDraftMaintRequestDto {
  const notifications = remindersToFireAt(input);
  const mentions = mentionsToWire(input);
  return {
    ...mapDraftCommon(input),
    // On create there is no "unchanged" state, so nothing-to-send (an empty
    // selection, or offsets that would not resolve — `null`) simply omits the key.
    ...(notifications?.length ? { deferred_notifications: notifications } : {}),
    // Same reasoning for mentions: on create `[]` and an absent key say the same
    // thing, so an empty picker omits it.
    ...(mentions.length ? { mentions } : {}),
  };
}

/**
 * Domain `MaintenanceDraftInput` → `UpdateDraftMaintRequest`.
 *
 * Identical to create except `deferred_notifications` and `mentions`, both of
 * which the backend made tri-state (`53d3ba0c` and RUK-218): omitted = leave
 * unchanged, `[]` = clear, non-empty = replace. The edit form always knows the
 * operator's full intent, so this always sends the keys — `[]` included. That is
 * what makes "clear everything, save" actually clear them instead of silently
 * keeping them.
 */
export function mapDraftToUpdateRequest(input: MaintenanceDraftInput): UpdateDraftMaintRequestDto {
  const notifications = remindersToFireAt(input);
  return {
    ...mapDraftCommon(input),
    // `null` means "we could not resolve what the operator asked for" — omit the
    // key so the backend leaves the saved reminders alone. Sending `[]` there
    // would read as "clear" and hard-delete them: silent data loss on a body we
    // failed to understand. An operator-chosen empty set still sends `[]`.
    ...(notifications === null ? {} : { deferred_notifications: notifications }),
    // ALWAYS sends the key, `[]` included — no `null` counterpart exists here
    // because there is nothing to resolve: ids go to the wire as-is (unlike
    // offsets, which may fail to become instants). Omitting on an empty picker
    // would read as "leave unchanged" and the mentions the operator just removed
    // would stay tagged. This is the exact inverse of the reminders trap.
    mentions: mentionsToWire(input),
  };
}

/**
 * The fields create and update share verbatim. `deferred_notifications` and
 * `mentions` are excluded because their empty-list semantics diverge between the
 * two directions — each mapper adds its own one-line spread.
 */
function mapDraftCommon(
  input: MaintenanceDraftInput,
): Omit<CreateDraftMaintRequestDto, "deferred_notifications" | "mentions"> {
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

/**
 * Reminder offsets → the wire's absolute instants, or `null` when they cannot be
 * resolved at all.
 *
 * Offsets resolve against `planned_start`, so a changed start moves every
 * reminder with it — the backend never recomputes `fire_at` itself.
 *
 * The `null` return distinguishes two cases update must not conflate: an
 * operator who genuinely selected nothing (empty array → "clear") versus a body
 * whose `planned_start` won't parse, where every offset silently drops out and
 * an empty array would read as "clear" and delete reminders nobody touched.
 * Duplicates are collapsed so the same instant is never sent twice — the picker
 * already prevents it, but the BFF is a trust boundary of its own.
 */
function remindersToFireAt(input: MaintenanceDraftInput): DeferredNotificationDto[] | null {
  const offsets = [...new Set(input.reminder_offsets_minutes ?? [])];
  if (offsets.length === 0) return [];

  const resolved = offsets
    .map((minutes) => toFireAt(input.planned_start, minutes))
    .filter((fireAt): fireAt is string => fireAt !== null)
    .map((fireAt) => ({ fire_at: fireAt }));

  return resolved.length > 0 ? resolved : null;
}

/**
 * Selected user ids → the wire's `[{ user_id }]` objects (RUK-218).
 *
 * Returns a plain array and never `null`: unlike the reminder offsets there is
 * nothing to resolve — the ids travel as-is — so no "we failed to understand the
 * body" state exists for the callers to guard against. The two directions differ
 * only in what they do with an EMPTY result, and that decision stays in them.
 *
 * Duplicates are collapsed: the backend rejects them outright
 * (`ErrDuplicateMentions` → an unattributable 400), and tagging the same person
 * twice is never a distinguishable intent.
 */
function mentionsToWire(input: MaintenanceDraftInput): MentionDto[] {
  return [...new Set(input.mention_user_ids ?? [])].map((id) => ({ user_id: id }));
}

/**
 * `uimodels.AssignableUser` → domain `AssignableUser` (approver and mention
 * pickers).
 *
 * `has_messenger_tag` is carried through RAW — no `?? false`. "The backend
 * checked and found no handle" (`false`) and "nobody told us" (absent) are
 * different statements, and collapsing them would make the mention picker warn
 * about a missing messenger handle on data it never had (RUK-218).
 */
export function mapAssignableUser(dto: AssignableUserDto): AssignableUser {
  const name = dto.display_name?.trim();
  return {
    id: dto.id,
    display_name: name && name.length > 0 ? name : (dto.email ?? UNKNOWN_USER),
    email: dto.email ?? "",
    roles: dto.roles ?? [],
    has_messenger_tag: dto.has_messenger_tag,
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
