import { cn } from "@/shared/ui/lib/cn";

export type ImpactLevel = "none" | "partial_outage" | "full_outage";

export const IMPACT_LABEL: Record<ImpactLevel, string> = {
  none: "No outage",
  partial_outage: "Partial outage",
  full_outage: "Full outage",
};

const IMPACT_CLASSES: Record<ImpactLevel, string> = {
  none: "text-[var(--impact-none-fg)] bg-[var(--impact-none-bg)] border-transparent",
  partial_outage:
    "text-[var(--impact-partial-fg)] bg-[var(--impact-partial-bg)] border-[var(--impact-partial-border)]",
  full_outage: "text-[var(--impact-full-fg)] bg-[var(--impact-full-bg)] border-[var(--impact-full-border)]",
};

export interface ImpactBadgeProps {
  impact: ImpactLevel;
  size?: "sm" | "xs";
  className?: string;
}

/**
 * Impact is orthogonal to status. partial=amber (distinct from in_progress orange),
 * full=red (distinct from destructive red — different hue ramp).
 * Source: maintmode-docs/design-snapshots/maintenance-details-page/project/components.jsx → `ImpactBadge`.
 */
export function ImpactBadge({ impact, size = "sm", className }: ImpactBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-xs border font-medium uppercase tracking-[0.04em] leading-[1.4]",
        size === "xs" ? "text-[10px] px-[5px] py-px" : "text-[11px] px-[7px] py-[2px]",
        IMPACT_CLASSES[impact],
        className,
      )}
    >
      {IMPACT_LABEL[impact]}
    </span>
  );
}
