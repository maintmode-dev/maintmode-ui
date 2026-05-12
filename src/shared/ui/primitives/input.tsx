"use client";

import * as React from "react";

import { cn } from "@/shared/ui/lib/cn";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type = "text", ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "h-9 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] shadow-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/40 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-[var(--danger-border)] aria-[invalid=true]:focus:ring-[var(--danger-border)]/40",
        className,
      )}
      {...props}
    />
  );
});
