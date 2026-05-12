import * as React from "react";

import { cn } from "@/shared/ui/lib/cn";

type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger" | "muted";

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: "bg-[var(--surface-subtle)] text-[var(--foreground)] border-[var(--border)]",
  info: "bg-[var(--info-soft)] text-[var(--info-fg)] border-[var(--info-border)]",
  success: "bg-[var(--success-soft)] text-[var(--success-fg)] border-[var(--success-border)]",
  warning: "bg-[var(--warning-soft)] text-[var(--warning-fg)] border-[var(--warning-border)]",
  danger: "bg-[var(--danger-soft)] text-[var(--danger-fg)] border-[var(--danger-border)]",
  muted: "bg-transparent text-[var(--muted)] border-[var(--border)]",
};

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        TONE_CLASS[tone],
        className,
      )}
      {...props}
    />
  );
}
