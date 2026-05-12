import * as React from "react";

import { cn } from "@/shared/ui/lib/cn";

export function Separator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div role="separator" className={cn("h-px w-full bg-[var(--border)]", className)} {...props} />;
}
