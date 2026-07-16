/**
 * Display helpers. Keep these purely visual — no business logic.
 *
 * Two families live here, and the split is deliberate (RUK-201):
 *
 *  - **Event-window** formatters (`formatTime`/`formatDate`/`formatDateTime`/
 *    `formatRange`) render a maintenance window in a caller-supplied IANA
 *    `zone`. These describe *when the work happens*, so the operator wants them
 *    in their own timezone ("18:00 means 18:00"). The `zone` is resolved once,
 *    app-wide, by `useTimezone()` — call sites pass it straight through.
 *  - **Identity/audit stamps** (`formatUtc`) stay pinned to **UTC** so a stamp
 *    reads identically for every viewer. Do NOT thread a zone into `formatUtc`.
 *
 * Formatters are memoized per zone (`Intl.DateTimeFormat` construction is not
 * free) so re-renders don't rebuild them.
 */

/** Cache one `Intl.DateTimeFormat` per (kind, zone) — construction is costly. */
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(kind: string, zone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${kind}@${zone}`;
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { ...options, timeZone: zone });
    fmtCache.set(key, f);
  }
  return f;
}

const TIME_OPTS: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hour12: false };
const DATE_OPTS: Intl.DateTimeFormatOptions = { month: "short", day: "2-digit" };
const FULL_OPTS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

/**
 * Project-wide identity timestamp format: `YYYY-MM-DD HH:mm UTC`, rendered in
 * UTC (not the viewer's locale) so a stamp reads the same for everyone. Pair
 * with `font-mono tabular-nums` at the call site. This is the canonical format
 * for list "Created" columns and detail identity cards / meta rows.
 */
const UTC_FMT = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

/** Placeholder for an empty/invalid timestamp (e.g. backend `updated_at: ""`). */
const NO_DATE = "—";

/**
 * Parse an ISO string to a valid Date, or null. The backend returns `""` for
 * never-set timestamps (e.g. a draft's `updated_at`); `new Date("")` is an
 * Invalid Date and `Intl.DateTimeFormat.format` THROWS on it, which would crash
 * the rendering component. Guard once here so every formatter is safe.
 */
function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Event-window time as `HH:mm`, in `zone`. `zone` is an IANA id from
 * `useTimezone()` (defaults to UTC during SSR/first render).
 */
export function formatTime(iso: string, zone: string): string {
  const date = parseDate(iso);
  return date ? fmt("time", zone, TIME_OPTS).format(date) : NO_DATE;
}
/** Event-window date as `MMM dd`, in `zone`. */
export function formatDate(iso: string, zone: string): string {
  const date = parseDate(iso);
  return date ? fmt("date", zone, DATE_OPTS).format(date) : NO_DATE;
}
/** Event-window date+time as `MMM dd, yyyy HH:mm`, in `zone`. */
export function formatDateTime(iso: string, zone: string): string {
  const date = parseDate(iso);
  return date ? fmt("full", zone, FULL_OPTS).format(date) : NO_DATE;
}
/**
 * Identity timestamp as `YYYY-MM-DD HH:mm UTC`. `Intl` with `en-GB` yields
 * `DD/MM/YYYY, HH:mm`; reorder to ISO and append the ` UTC` suffix so the
 * convention is unambiguous regardless of viewer locale.
 */
export function formatUtc(iso: string | null | undefined): string {
  const date = parseDate(iso);
  if (!date) return NO_DATE;
  const parts = UTC_FMT.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")} UTC`;
}
/** Event-window range `HH:mm – HH:mm`, both ends in `zone`. */
export function formatRange(startIso: string, endIso: string, zone: string): string {
  return `${formatTime(startIso, zone)} – ${formatTime(endIso, zone)}`;
}

/**
 * Compact step-duration text: "5m", "1h", "1h30m". Collapses zero components so
 * Go's `time.Duration` serialization ("2h0m0s", "90m0s") and the ISO-8601 form
 * (PT5M, PT1H30M) both render as the contract's short style. A bare integer is
 * read as minutes ("120" → "2h"). Returns the input unchanged if unparseable.
 */
export function formatDuration(input?: string): string | undefined {
  if (input == null) return undefined;
  const trimmed = String(input).trim();
  if (!trimmed) return undefined;

  let h = 0;
  let min = 0;
  let s = 0;

  // Bare integer → minutes ("120" → 2h).
  if (/^\d+$/.test(trimmed)) {
    min = Number(trimmed);
  } else {
    // Go-style "2h0m0s" / "90m" or ISO-8601 "PT1H30M". One regex covers both
    // (the leading "PT" is optional and case-insensitive).
    const m = trimmed.match(/^(?:PT)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
    if (!m || !(m[1] || m[2] || m[3])) return trimmed;
    h = Number(m[1] ?? 0);
    min = Number(m[2] ?? 0);
    s = Number(m[3] ?? 0);
  }

  // Normalize 60+ minutes into hours so "90m" reads "1h30m".
  h += Math.floor(min / 60);
  min %= 60;

  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (min) parts.push(`${min}m`);
  if (!parts.length && s) parts.push(`${s}s`);
  if (!parts.length) parts.push("0m");
  return parts.join("");
}

/**
 * Relative "…ago" text for recency (audit "last activity"). Zone-independent up
 * to a week; past that it degrades to an absolute date. This is an audit/recency
 * signal, not an event window, so the absolute fallback stays in **UTC** (no
 * zone param) — consistent with the other audit stamps.
 */
export function formatRelative(iso: string): string {
  const date = parseDate(iso);
  if (!date) return NO_DATE;
  const diff = Date.now() - date.getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return formatDate(iso, "UTC");
}
