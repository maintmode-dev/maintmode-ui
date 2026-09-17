import type { IntegrationHealth } from "@/domain/admin/integration";

/**
 * What each health value means to an operator, and how alarmed to look.
 *
 * `unresolved` is the one worth getting right. It is what a correctly saved
 * provider reads as until the backend's snapshot catches up — the value is read
 * from a cache and never probed on the request — so presenting it as a fault
 * sends people debugging a non-problem. It is also what a genuinely broken row
 * reads as, which is why the copy describes the state rather than judging it.
 */
const HEALTH_COPY: Record<IntegrationHealth, { label: string; tone: "ok" | "warn" | "bad" }> = {
  ok: { label: "Active", tone: "ok" },
  unresolved: { label: "Not picked up yet", tone: "warn" },
  disabled: { label: "Turned off", tone: "warn" },
  unreadable: { label: "Secret unreadable", tone: "bad" },
};

const TONE_CLASS = {
  ok: "text-[var(--status-completed-fg)]",
  warn: "text-[var(--status-in_progress-fg)]",
  bad: "text-[var(--destructive-fg)]",
} as const;

/**
 * Per-provider sign-in health, reported by the backend for login rows only.
 *
 * Absence is NOT health: the field is `omitempty` and a login row can arrive
 * without it (the backend returns nothing when its snapshot is unavailable), so
 * an unknown state is shown as unknown rather than defaulted to working. The
 * caller decides whether a row has health at all — this renders nothing for a
 * transport, whose reachability is a different endpoint's answer entirely.
 */
export function IntegrationHealthBadge({ health }: { health?: IntegrationHealth }) {
  if (!health) {
    return <span className="text-xs text-fg-dim">Status unknown</span>;
  }
  const { label, tone } = HEALTH_COPY[health];
  return <span className={`text-xs ${TONE_CLASS[tone]}`}>{label}</span>;
}
