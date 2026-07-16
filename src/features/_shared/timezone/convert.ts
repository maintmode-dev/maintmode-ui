import { TZDate } from "@date-fns/tz";

/**
 * Timezone conversion between a **wall-clock** string (what the picker shows and
 * the operator types, e.g. "2026-07-16T18:00" — no zone) and a **UTC instant**
 * ISO string (what the backend stores and returns).
 *
 * These are the heart of RUK-201. The bug they fix: the old helpers parsed the
 * wall-clock string with `new Date(local)` and formatted UTC instants with
 * `getHours()`/`getFullYear()`, both of which silently use the **browser
 * machine's** zone — while the whole display layer was pinned to **UTC**. Enter
 * 18:00 (UTC+3) and the calendar showed 15:00. Routing every conversion through
 * an **explicit** IANA zone closes "18 = 18".
 *
 * We use `@date-fns/tz`'s `TZDate` rather than hand-rolled offset math because a
 * fixed offset is wrong across DST transitions — `TZDate` resolves the correct
 * offset for the given instant/zone. No `getTimezoneOffset()` juggling anywhere.
 */

/** A wall-clock string as produced by the date-time picker: `YYYY-MM-DDTHH:MM`. */
type WallClock = string;

/**
 * True if `zone` is an IANA id this runtime understands. `Intl.DateTimeFormat`
 * throws a `RangeError` on an unknown/malformed zone, so this is the standard
 * validity probe. Empty/nullish is invalid.
 */
export function isValidZone(zone: string | null | undefined): zone is string {
  if (!zone) return false;
  try {
    // Constructing with an unknown `timeZone` throws RangeError; the returned
    // formatter is discarded — we only care whether construction succeeds.
    Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Coerce to a zone `TZDate`/`Intl` can resolve. An unknown zone makes
 * `TZDate.getTime()` return `NaN` and silently corrupts the conversion (the raw
 * wall-clock string leaks to the wire, or `NaN-NaN-NaN…` shows in the picker).
 * The resolver in `use-timezone` already validates before a zone reaches here,
 * so this is a defense-in-depth backstop, not the primary guard. Falls back to
 * UTC — a visibly-wrong-but-consistent time beats a corrupt instant.
 */
function safeZone(zone: string): string {
  return isValidZone(zone) ? zone : "UTC";
}

/**
 * Interpret a wall-clock `YYYY-MM-DDTHH:MM` **as a time in `zone`** and return
 * the corresponding UTC instant as an ISO-8601 string (`…Z`). Returns the input
 * unchanged if it is not a parseable wall-clock string, mirroring the tolerant
 * behavior of the old `localToIso` (the caller validates "required" separately).
 *
 * Example: `wallClockToUtcIso("2026-07-16T18:00", "Asia/Nicosia")`
 *          → `"2026-07-16T15:00:00.000Z"`.
 */
export function wallClockToUtcIso(local: WallClock, zone: string): string {
  const parts = parseWallClock(local);
  if (!parts) return local;
  const { y, mo, d, h, mi } = parts;
  // TZDate(y, monthIndex, d, h, mi, s, zone) builds the instant for that
  // wall-clock time *in `zone`*; `.getTime()` is the true UTC epoch ms.
  const instant = new TZDate(y, mo - 1, d, h, mi, 0, safeZone(zone));
  const ms = instant.getTime();
  return Number.isNaN(ms) ? local : new Date(ms).toISOString();
}

/**
 * Inverse of {@link wallClockToUtcIso}: render a UTC-instant ISO string as the
 * wall-clock `YYYY-MM-DDTHH:MM` an operator in `zone` would read on the clock.
 * Returns `""` for an empty/invalid input (the picker's "unset" contract).
 *
 * Example: `utcIsoToWallClock("2026-07-16T15:00:00Z", "Asia/Nicosia")`
 *          → `"2026-07-16T18:00"`.
 */
export function utcIsoToWallClock(iso: string, zone: string): WallClock {
  if (!iso) return "";
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const t = new TZDate(ms, safeZone(zone));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}`;
}

/** Split `YYYY-MM-DDTHH:MM` into numeric parts, or null if it doesn't match. */
function parseWallClock(
  local: WallClock,
): { y: number; mo: number; d: number; h: number; mi: number } | null {
  const [ymd, hm] = (local ?? "").split("T");
  if (!ymd) return null;
  const [y, mo, d] = ymd.split("-").map(Number);
  const [h, mi] = (hm || "00:00").split(":").map(Number);
  if ([y, mo, d, h, mi].some((n) => !Number.isFinite(n))) return null;
  return { y, mo, d, h, mi };
}
