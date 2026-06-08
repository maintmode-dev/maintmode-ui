/**
 * Display helpers. Keep these purely visual — no business logic.
 */

const TIME_FMT = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
});

const FULL_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
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

export function formatTime(iso: string): string {
  const date = parseDate(iso);
  return date ? TIME_FMT.format(date) : NO_DATE;
}
export function formatDate(iso: string): string {
  const date = parseDate(iso);
  return date ? DATE_FMT.format(date) : NO_DATE;
}
export function formatDateTime(iso: string): string {
  const date = parseDate(iso);
  return date ? FULL_FMT.format(date) : NO_DATE;
}
export function formatRange(startIso: string, endIso: string): string {
  return `${formatTime(startIso)} – ${formatTime(endIso)}`;
}

/** "5m", "12m", "1h 30m" — for step duration display. */
export function formatDuration(input?: string): string | undefined {
  if (!input) return undefined;
  // Already a plain "5m" / "1h 30m"? Return as-is.
  if (/^[\d hms]+$/i.test(input.trim())) return input.trim();
  // ISO 8601: PT5M, PT1H30M, PT45S
  const m = input.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!m) return input;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2] ?? 0);
  const s = Number(m[3] ?? 0);
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (min) parts.push(`${min}m`);
  if (!parts.length && s) parts.push(`${s}s`);
  return parts.join(" ");
}

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
  return formatDate(iso);
}
