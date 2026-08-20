import { cn } from "@/shared/ui/lib/cn";

type SkelType = "bar" | "row" | "chip" | "block";

export interface SkeletonProps {
  type?: SkelType;
  width?: number | string;
  height?: number | string;
  className?: string;
}

const TYPE_STYLES: Record<SkelType, string> = {
  bar: "h-[10px] inline-block",
  row: "h-[14px] inline-block",
  chip: "h-[22px] inline-block rounded-[11px]",
  block: "block w-full h-16 rounded-md",
};

/**
 * Opacity-shimmer skeleton, 0.55 ↔ 0.85 at 1.6s ease-in-out (per snapshot).
 * Source: the empty-states design snapshot → `.es-skel`.
 * Distinct from the shadcn `<Skeleton>` (which uses pulse/animate-pulse).
 */
export function Skeleton({ type = "bar", width, height, className }: SkeletonProps) {
  const style: Record<string, string> = {};
  if (width !== undefined) style.width = typeof width === "number" ? `${width}px` : width;
  if (height !== undefined) style.height = typeof height === "number" ? `${height}px` : height;

  return (
    <span
      data-skeleton
      aria-hidden="true"
      className={cn(
        "bg-bg-elev-3 rounded-[3px] motion-safe:animate-mm-shimmer",
        TYPE_STYLES[type],
        className,
      )}
      style={style}
    />
  );
}
