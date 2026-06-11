import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/shared/ui/lib/cn";

export interface ConflictRowProps {
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  resolved?: boolean;
  onClick?: () => void;
  /**
   * Drop the row's own fuchsia accent rail + elevated background — use when the
   * rows sit inside a section that already carries a single accent bar (e.g. the
   * quick-sheet CONFLICTS list), so the bars don't double up into two stripes.
   */
  flush?: boolean;
  className?: string;
}

/**
 * Compact row variant of ConflictCard — for lists, drawers, side-panels.
 * Carries its own fuchsia accent rail by default; pass `flush` to drop it when
 * the surrounding section already provides one.
 */
export function ConflictRow({
  title,
  meta,
  trailing,
  resolved,
  onClick,
  flush,
  className,
}: ConflictRowProps) {
  const Element = onClick ? "button" : "div";
  return (
    <Element
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "w-full text-left flex items-center gap-3 px-3 py-2 rounded-sm transition-colors",
        flush
          ? "bg-transparent"
          : cn(
              "border-l-[3px] bg-bg-elev-1",
              resolved ? "border-l-[var(--status-completed-fg)] opacity-60" : "border-l-[var(--conflict-fg)]",
            ),
        flush && resolved && "opacity-60",
        onClick && "hover:bg-bg-row-hover cursor-pointer",
        className,
      )}
    >
      <div className="flex-1 min-w-0">
        <div className={cn("text-[13px] text-fg truncate", resolved && "line-through text-fg-muted")}>
          {title}
        </div>
        {meta ? <div className="text-xs text-fg-dim mt-0.5 font-mono">{meta}</div> : null}
      </div>
      {trailing}
      {onClick ? <ChevronRight className="size-3.5 text-fg-dim shrink-0" aria-hidden="true" /> : null}
    </Element>
  );
}
