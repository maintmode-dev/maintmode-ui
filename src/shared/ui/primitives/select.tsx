"use client";

import * as React from "react";

import { cn } from "@/shared/ui/lib/cn";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        "h-9 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--foreground)] shadow-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/40 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-[var(--danger-border)] aria-[invalid=true]:focus:ring-[var(--danger-border)]/40",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});

export type SelectOptionProps = React.OptionHTMLAttributes<HTMLOptionElement>;

export function SelectOption(props: SelectOptionProps) {
  return <option {...props} />;
}
