import type { ReactNode } from "react";
import { cn } from "@/shared/ui/lib/cn";

export interface StackProps {
  icon?: ReactNode;
  title: ReactNode;
  caption?: ReactNode;
  cta?: ReactNode;
  className?: string;
}

/**
 * Composition primitive used by Empty / Error / Loading states.
 * Centered icon → title → caption → optional CTA, 80px vertical padding.
 * Source: maintmode-docs/design-snapshots/empty-states/project/states.jsx → `Stack`.
 */
export function Stack({ icon, title, caption, cta, className }: StackProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center gap-3 px-6 py-20 max-w-[420px] mx-auto",
        className,
      )}
    >
      {icon ? (
        <div className="size-8 text-fg-dim flex items-center justify-center [&_svg]:size-8">{icon}</div>
      ) : null}
      <h3 className="text-[14px] font-semibold leading-[1.25] text-fg-strong tracking-[-0.005em] m-0">
        {title}
      </h3>
      {caption ? (
        <p className="text-[12.5px] leading-[1.45] text-fg-muted max-w-[360px] m-0">{caption}</p>
      ) : null}
      {cta ? <div className="mt-1 flex gap-2">{cta}</div> : null}
    </div>
  );
}
