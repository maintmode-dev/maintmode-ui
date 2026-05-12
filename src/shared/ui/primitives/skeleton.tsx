import * as React from "react";

import { cn } from "@/shared/ui/lib/cn";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-[var(--surface-subtle)]", className)} {...props} />;
}
