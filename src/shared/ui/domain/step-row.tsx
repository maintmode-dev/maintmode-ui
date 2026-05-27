import { Check, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/shared/ui/lib/cn";

export type StepState = "pending" | "in_progress" | "done" | "skipped";

export interface StepRowProps {
  /** 1-based step number, rendered in the leading circle. */
  number: number;
  title: ReactNode;
  /** Right-aligned duration / timestamp text, monospaced. */
  duration?: ReactNode;
  state?: StepState;
  onClick?: () => void;
  className?: string;
}

/**
 * Frozen decision: steps DO NOT use status badges. State is conveyed by:
 *   - circle bg-color (done = green soft)
 *   - check-icon overlay (done)
 *   - dimmed/strikethrough text (skipped)
 *
 * Source: maintmode-docs/design-snapshots/maintenance-details-page/project/styles.css
 *   → `.ap-step`, `.ap-step--done`, `.ap-step--skipped`.
 */
export function StepRow({ number, title, duration, state = "pending", onClick, className }: StepRowProps) {
  const Element = onClick ? "button" : "div";
  return (
    <Element
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "group w-full grid grid-cols-[24px_1fr_auto_auto] items-center gap-3 rounded-sm py-2 pl-1 pr-2 text-left",
        onClick && "cursor-pointer hover:bg-bg-elev-2",
        "border-t border-border-subtle first:border-t-0",
        className,
      )}
    >
      <span
        className={cn(
          "size-[22px] grid place-items-center rounded-full border text-[11px] font-medium leading-none font-mono",
          state === "done"
            ? "bg-[var(--status-completed-bg)] border-[var(--status-completed-border)] text-[var(--status-completed-fg)]"
            : state === "in_progress"
              ? "bg-[var(--status-in_progress-bg)] border-[var(--status-in_progress-border)] text-[var(--status-in_progress-fg)]"
              : "bg-bg-elev-2 border-border text-fg-muted",
        )}
        aria-hidden="true"
      >
        {state === "done" ? <Check className="size-3.5" aria-hidden="true" /> : number}
      </span>
      <span
        className={cn(
          "text-[13px]",
          state === "done" && "text-fg-muted",
          state === "skipped" && "text-fg-disabled line-through",
          state === "pending" && "text-fg",
          state === "in_progress" && "text-fg-strong font-medium",
        )}
      >
        {title}
      </span>
      {duration ? (
        <span
          className={cn(
            "text-xs font-mono tabular-nums",
            state === "done" || state === "skipped" ? "text-fg-disabled" : "text-fg-dim",
          )}
        >
          {duration}
        </span>
      ) : (
        <span aria-hidden="true" />
      )}
      {onClick ? (
        <ChevronRight className="size-3.5 text-fg-dim group-hover:text-fg" aria-hidden="true" />
      ) : (
        <span aria-hidden="true" />
      )}
    </Element>
  );
}
