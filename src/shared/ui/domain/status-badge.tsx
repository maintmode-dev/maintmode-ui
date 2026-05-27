import { cn } from "@/shared/ui/lib/cn";

export type MaintenanceStatus = "draft" | "planned" | "in_progress" | "completed" | "canceled";

export const STATUS_LABEL: Record<MaintenanceStatus, string> = {
  draft: "Draft",
  planned: "Planned",
  in_progress: "In progress",
  completed: "Completed",
  canceled: "Canceled",
};

const STATUS_CLASSES: Record<MaintenanceStatus, string> = {
  draft: "text-[var(--status-draft-fg)] bg-[var(--status-draft-bg)] border-[var(--status-draft-border)]",
  planned:
    "text-[var(--status-planned-fg)] bg-[var(--status-planned-bg)] border-[var(--status-planned-border)]",
  in_progress:
    "text-[var(--status-in_progress-fg)] bg-[var(--status-in_progress-bg)] border-[var(--status-in_progress-border)]",
  completed:
    "text-[var(--status-completed-fg)] bg-[var(--status-completed-bg)] border-[var(--status-completed-border)]",
  canceled:
    "text-[var(--status-canceled-fg)] bg-[var(--status-canceled-bg)] border-[var(--status-canceled-border)]",
};

export interface StatusBadgeProps {
  status: MaintenanceStatus;
  /** Show the leading dot. Default true. */
  dot?: boolean;
  /** `sm` (default) or `xs`. */
  size?: "sm" | "xs";
  className?: string;
}

/**
 * Source: maintmode-docs/design-snapshots/maintenance-details-page/project/components.jsx → `StatusBadge`.
 * Canceled variant automatically receives `.is-canceled` for strikethrough.
 */
export function StatusBadge({ status, dot = true, size = "sm", className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[5px] rounded-xs border font-medium uppercase tracking-[0.04em] leading-[1.4]",
        size === "xs" ? "text-[10px] px-[5px] py-px" : "text-[11px] px-[7px] py-[2px]",
        STATUS_CLASSES[status],
        status === "canceled" && "is-canceled",
        className,
      )}
    >
      {dot ? <span className="size-[5px] rounded-full bg-current" aria-hidden="true" /> : null}
      {STATUS_LABEL[status]}
    </span>
  );
}
