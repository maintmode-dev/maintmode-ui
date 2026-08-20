import { cn } from "@/shared/ui/lib/cn";

export interface ArchiveStatusPillProps {
  archived: boolean;
  className?: string;
}

/**
 * Active / Archived status pill for catalog detail headers (channel + resource).
 * Source: the channel/resource-detail snapshots, "Page header" →
 * `Active` green outline / `Archived` zinc outline, mono uppercase 10/600.
 */
export function ArchiveStatusPill({ archived, className }: ArchiveStatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-px font-mono text-[10px] font-semibold uppercase tracking-[0.08em]",
        archived
          ? "border-border-subtle text-fg-muted"
          : "border-[var(--status-completed-border)] text-[var(--status-completed-fg)]",
        className,
      )}
    >
      {archived ? "Archived" : "Active"}
    </span>
  );
}
