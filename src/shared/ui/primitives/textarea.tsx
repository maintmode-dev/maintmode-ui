"use client";

import * as React from "react";

import { cn } from "@/shared/ui/lib/cn";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, rows = 3, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 text-sm text-[var(--foreground)] shadow-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/40 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-[var(--danger-border)] aria-[invalid=true]:focus:ring-[var(--danger-border)]/40",
        className,
      )}
      {...props}
    />
  );
});
