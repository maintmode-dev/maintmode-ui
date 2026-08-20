import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/shared/ui/lib/cn";
import type { MaintenanceStatus } from "./status-badge";

export interface CalendarEventBarProps {
  status: MaintenanceStatus;
  title: ReactNode;
  /** Right-aligned time text, monospaced. */
  time?: ReactNode;
  /** Render a warning icon to signal a conflict on this event. */
  conflict?: boolean;
  /**
   * Mark this bar as a continuation of an event that started on a previous
   * day. Adds a small `↳` glyph in a dimmed muted color OUTSIDE the truncate
   * area so it never eats title characters on narrow lanes.
   */
  continuation?: boolean;
  /** Compact size variant (single line, smaller paddings). */
  compact?: boolean;
  /** Click handler (for FullCalendar event click delegation). */
  onClick?: () => void;
  className?: string;
}

const STATUS_BAR_CLASSES: Record<MaintenanceStatus, string> = {
  draft: "bg-[var(--status-draft-bg)] border-[var(--status-draft-border)] text-[var(--status-draft-fg)]",
  planned:
    "bg-[var(--status-planned-bg)] border-[var(--status-planned-border)] text-[var(--status-planned-fg)]",
  in_progress:
    "bg-[var(--status-in_progress-bg)] border-[var(--status-in_progress-border)] text-[var(--status-in_progress-fg)]",
  completed:
    "bg-[var(--status-completed-bg)] border-[var(--status-completed-border)] text-[var(--status-completed-fg)]",
  canceled:
    "bg-[var(--status-canceled-bg)] border-[var(--status-canceled-border)] text-[var(--status-canceled-fg)]",
};

/**
 * FROZEN DECISION: conflict on an event-bar is signalled by a single
 * warning icon (lucide AlertTriangle, color #E879F9, 14px) and NOTHING else.
 * No stripes, no special border, no badge. Stripes live in ConflictCard.
 *
 * Source: the design plan's frozen decisions.
 */
export function CalendarEventBar({
  status,
  title,
  time,
  conflict,
  continuation,
  compact,
  onClick,
  className,
}: CalendarEventBarProps) {
  const Element = onClick ? "button" : "div";
  return (
    <Element
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-xs border",
        compact ? "px-1.5 py-0.5 text-[11px] leading-tight" : "px-2 py-1 text-xs leading-tight",
        STATUS_BAR_CLASSES[status],
        status === "canceled" && "is-canceled",
        onClick && "cursor-pointer hover:brightness-110",
        className,
      )}
    >
      <span className="flex items-center gap-1.5 min-w-0">
        {continuation ? (
          <span
            className="shrink-0 text-fg-dim text-[11px] leading-none"
            aria-label="Continuation of an event that started earlier"
          >
            ↳
          </span>
        ) : null}
        {conflict ? (
          <AlertTriangle
            className="size-3.5 shrink-0"
            style={{ color: "#E879F9" }}
            aria-label="Conflict on this event"
          />
        ) : null}
        <span className="truncate flex-1 min-w-0 font-medium">{title}</span>
        {time ? <span className="font-mono tabular-nums text-[10px] opacity-90">{time}</span> : null}
      </span>
    </Element>
  );
}
