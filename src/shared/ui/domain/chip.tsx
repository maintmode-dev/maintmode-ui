import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/shared/ui/lib/cn";

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  leadingIcon?: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
  children: ReactNode;
}

/**
 * Generic chip — filter chip, tag chip, etc.
 * Source: the maintenance-details-page design snapshot → `.mm-chip`.
 */
export function Chip({ leadingIcon, trailing, selected, className, children, ...rest }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border border-border-subtle bg-bg-elev-3 text-fg px-2 py-[3px] text-xs",
        selected && "border-border-strong bg-bg-row-selected",
        className,
      )}
      {...rest}
    >
      {leadingIcon ? <span className="text-fg-muted [&_svg]:size-3">{leadingIcon}</span> : null}
      <span>{children}</span>
      {trailing ? <span className="text-fg-muted [&_svg]:size-3">{trailing}</span> : null}
    </span>
  );
}
