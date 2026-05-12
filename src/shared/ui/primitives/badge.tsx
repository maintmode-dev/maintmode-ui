import * as React from "react";

import { cn } from "@/shared/ui/lib/cn";

type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger" | "muted";

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: "bg-[var(--surface-subtle)] text-[var(--foreground)] border-[var(--border)]",
  info: "bg-[#e0ecff] text-[#1d4ed8] border-[#bfd4ff]",
  success: "bg-[#dcf6e4] text-[#166534] border-[#bce5c9]",
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
