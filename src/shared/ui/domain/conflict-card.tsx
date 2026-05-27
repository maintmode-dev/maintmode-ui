import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/shared/ui/lib/cn";

export type ConflictState = "active" | "new" | "resolved";

export interface ConflictCardProps {
  title: ReactNode;
  /** Compact secondary line, e.g. `MNT-1042 · 14 Mar 16:00 → 17:00`. */
  meta?: ReactNode;
  /** A grid of key/value pairs (e.g. owner, resources, overlap). Render via `ConflictGrid`. */
  details?: ReactNode;
  /** Highlighted overlap-zone callout (uses conflict-stripes pattern). */
  overlap?: ReactNode;
  state?: ConflictState;
  className?: string;
}

/**
 * Source: maintmode-docs/design-snapshots/maintenance-details-page/project/styles.css
 *   → `.ap-confcard`, `.ap-confcard.is-new`, `.ap-confcard.is-resolved`, `.ap-overlap`.
 * Fuchsia 3px left rail; switches to green for resolved.
 */
export function ConflictCard({
  title,
  meta,
  details,
  overlap,
  state = "active",
  className,
}: ConflictCardProps) {
  return (
    <article
      className={cn(
        "relative bg-bg-elev-1 border border-border-subtle rounded-md px-4 py-3.5 transition-[border-color,opacity] duration-150 border-l-[3px]",
        state === "active" && "border-l-[var(--conflict-fg)]",
        state === "new" &&
          "border-l-[5px] border-l-[var(--conflict-fg)] bg-[color-mix(in_oklab,var(--conflict-fg)_5%,var(--bg-elev-1))]",
        state === "resolved" && "opacity-55 border-l-[var(--status-completed-fg)]",
        "hover:border-border",
        className,
      )}
    >
      <header className="flex items-center gap-2 mb-2.5">
        <h3
          className={cn(
            "flex-1 min-w-0 font-medium text-[13px] text-fg-strong truncate m-0",
            state === "resolved" && "line-through",
          )}
        >
          {title}
        </h3>
        {meta ? <span className="font-mono text-xs text-fg-dim">{meta}</span> : null}
      </header>
      {details ? <div className="grid grid-cols-2 gap-x-4 gap-y-2 py-1.5">{details}</div> : null}
      {overlap ? (
        <div className="mt-3 flex items-center gap-2 rounded-sm border border-[var(--conflict-border)] bg-[var(--conflict-bg)] text-fg text-xs px-3 py-2">
          <AlertTriangle className="size-3.5 shrink-0 text-[var(--conflict-fg)]" aria-hidden="true" />
          {overlap}
        </div>
      ) : null}
    </article>
  );
}

export interface ConflictGridItemProps {
  label: ReactNode;
  value: ReactNode;
  mono?: boolean;
}

/** Key/value cell for ConflictCard.details. */
export function ConflictGridItem({ label, value, mono }: ConflictGridItemProps) {
  return (
    <div>
      <div className="text-[10px] font-semibold leading-none uppercase tracking-[0.08em] text-fg-dim mb-1">
        {label}
      </div>
      <div className={cn("flex items-center gap-1.5 text-xs text-fg", mono && "font-mono tabular-nums")}>
        {value}
      </div>
    </div>
  );
}
