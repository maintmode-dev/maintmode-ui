import type { ReactNode } from "react";
import { cn } from "@/shared/ui/lib/cn";

export interface KbdProps {
  children: ReactNode;
  className?: string;
}

/**
 * Source: maintmode-docs/design-snapshots/maintenance-details-page/project/styles.css → `.mm-kbd`.
 * Do NOT use on MaintenanceDetailsPage (frozen). Calendar / Users management OK.
 */
export function Kbd({ children, className }: KbdProps) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center h-[18px] min-w-[18px] px-1.5 rounded-xs",
        "bg-bg-elev-2 border border-border-subtle text-fg-dim",
        "text-[10px] tracking-[0.02em] font-sans",
        "font-mono",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
