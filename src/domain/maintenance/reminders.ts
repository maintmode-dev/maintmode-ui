/**
 * Advance ("deferred") notification scheduling — RUK-216.
 *
 * The backend stores ONLY absolute instants (`deferred_notifications:
 * [{ fire_at }]`); there is no offset column and, per the migration comment,
 * that is deliberate. So "1 day before" exists only here: the UI holds offsets
 * in minutes, and the boundary resolves them against `planned_start`.
 *
 * Everything below is pure instant arithmetic on UTC ISO strings, so no IANA
 * zone is involved — unlike the wall-clock conversions in
 * `@/features/_shared/timezone/convert`, which need one. Subtracting 24h from an
 * instant is unambiguous even across a DST boundary; it may land on a different
 * *wall-clock* hour, which is correct ("1 day before" means 24h earlier).
 */

/** Backend cap: `maxDeferredNotifications` in `internal/services/maint/create_draft.go`. */
export const MAX_REMINDERS = 10;

/**
 * Largest lead time we accept, in minutes (365 days).
 *
 * The backend caps the reminder *count*, not how far ahead they sit, so a
 * fat-fingered "999999999 hours" would otherwise be stored happily and queued
 * with a delay measured in millennia. A year is comfortably beyond any real
 * maintenance window and turns the typo into a visible error.
 */
export const MAX_OFFSET_MINUTES = 365 * 24 * 60;

export interface ReminderPreset {
  id: string;
  label: string;
  minutes: number;
}

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/** The quick picks from RUK-216, longest lead time first. */
export const REMINDER_PRESETS: readonly ReminderPreset[] = [
  { id: "7d", label: "7 days before", minutes: 7 * MINUTES_PER_DAY },
  { id: "1d", label: "1 day before", minutes: MINUTES_PER_DAY },
  { id: "1h", label: "1 hour before", minutes: MINUTES_PER_HOUR },
  { id: "15m", label: "15 minutes before", minutes: 15 },
] as const;

export type ReminderUnit = "minutes" | "hours" | "days";

export const REMINDER_UNITS: ReadonlyArray<{ id: ReminderUnit; label: string; minutes: number }> = [
  { id: "minutes", label: "minutes", minutes: 1 },
  { id: "hours", label: "hours", minutes: MINUTES_PER_HOUR },
  { id: "days", label: "days", minutes: MINUTES_PER_DAY },
] as const;

/**
 * Custom-offset value + unit → offset in minutes. `null` when not a usable
 * number, or when it exceeds `MAX_OFFSET_MINUTES`.
 */
export function toOffsetMinutes(value: string, unit: ReminderUnit): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  const factor = REMINDER_UNITS.find((u) => u.id === unit)?.minutes ?? 1;
  const minutes = n * factor;
  return minutes <= MAX_OFFSET_MINUTES ? minutes : null;
}

/**
 * Offset in minutes → the absolute UTC instant the reminder fires at.
 * `fire_at = planned_start − offset`. Returns `null` when `plannedStart` is not
 * a parseable instant (the form can hold a half-typed date).
 */
export function toFireAt(plannedStart: string, offsetMinutes: number): string | null {
  const startMs = new Date(plannedStart).getTime();
  if (!Number.isFinite(startMs)) return null;
  return new Date(startMs - offsetMinutes * 60_000).toISOString();
}

/**
 * Inverse of `toFireAt`, for hydrating the edit form from the backend's absolute
 * instants (it never returns the original offset — see SPEC §1.4). Rounds to the
 * nearest minute so a stored instant that drifted by seconds still snaps onto a
 * preset. Returns `null` for an unparseable pair or a non-positive offset (a
 * reminder at/after the start).
 */
export function toOffsetFromFireAt(plannedStart: string, fireAt: string): number | null {
  const startMs = new Date(plannedStart).getTime();
  const fireMs = new Date(fireAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(fireMs)) return null;
  const minutes = Math.round((startMs - fireMs) / 60_000);
  return minutes > 0 ? minutes : null;
}

/** Human label for an offset: a preset's own wording, else a derived one. */
export function offsetLabel(minutes: number): string {
  const preset = REMINDER_PRESETS.find((p) => p.minutes === minutes);
  if (preset) return preset.label;

  const [amount, unit] =
    minutes % MINUTES_PER_DAY === 0
      ? [minutes / MINUTES_PER_DAY, "day"]
      : minutes % MINUTES_PER_HOUR === 0
        ? [minutes / MINUTES_PER_HOUR, "hour"]
        : [minutes, "minute"];

  return `${amount} ${unit}${amount === 1 ? "" : "s"} before`;
}
