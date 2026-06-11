import { cn } from "@/shared/ui/lib/cn";

export type SemanticTone = "positive" | "neutral" | "warning" | "danger";

export interface SemanticPillProps {
  /**
   * Colour intent — decoupled from maintenance status. Use for identity /
   * lifecycle states (user active/blocked, invitation pending/accepted/revoked,
   * "current session") so these surfaces stop borrowing the maintenance
   * StatusBadge vocabulary (Completed/Canceled).
   */
  tone: SemanticTone;
  /** Strike-through the label (e.g. a revoked invitation). */
  strike?: boolean;
  className?: string;
  children: React.ReactNode;
}

const TONE_CLASSES: Record<SemanticTone, string> = {
  positive:
    "text-[var(--status-completed-fg)] bg-[var(--status-completed-bg)] border-[var(--status-completed-border)]",
  neutral:
    "text-[var(--status-planned-fg)] bg-[var(--status-planned-bg)] border-[var(--status-planned-border)]",
  warning:
    "text-[var(--impact-partial-fg)] bg-[var(--impact-partial-bg)] border-[var(--impact-partial-border)]",
  danger:
    "text-[var(--status-canceled-fg)] bg-[var(--status-canceled-bg)] border-[var(--status-canceled-border)]",
};

/**
 * Small lifecycle/identity pill. Distinct from `StatusBadge` (which is the
 * maintenance-status vocabulary) — this one carries a neutral tone scale so
 * user/invitation/session surfaces can label their own real states.
 */
export function SemanticPill({ tone, strike = false, className, children }: SemanticPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-[7px] py-[2px] text-[11px] font-medium uppercase tracking-[0.04em] leading-[1.4]",
        TONE_CLASSES[tone],
        strike && "line-through",
        className,
      )}
    >
      {children}
    </span>
  );
}
