"use client";

import * as React from "react";

import { cn } from "@/shared/ui/lib/cn";

type FieldContextValue = {
  id: string;
  errorId: string;
  hintId: string;
  hasError: boolean;
  hasHint: boolean;
};

const FieldContext = React.createContext<FieldContextValue | null>(null);

function useFieldContext() {
  const ctx = React.useContext(FieldContext);
  if (!ctx) {
    throw new Error("Field subcomponents must be rendered inside <Field>");
  }
  return ctx;
}

export type FieldProps = {
  id?: string;
  error?: string | undefined;
  hint?: string | undefined;
  children: React.ReactNode;
  className?: string;
};

export function Field({ id, error, hint, children, className }: FieldProps) {
  const autoId = React.useId();
  const resolvedId = id ?? autoId;
  const value: FieldContextValue = {
    id: resolvedId,
    errorId: `${resolvedId}-error`,
    hintId: `${resolvedId}-hint`,
    hasError: Boolean(error),
    hasHint: Boolean(hint),
  };
  return (
    <FieldContext.Provider value={value}>
      <div className={cn("flex flex-col gap-1", className)}>
        {children}
        {hint && !error ? (
          <p id={value.hintId} className="text-xs text-[var(--muted)]">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={value.errorId} role="alert" className="text-xs text-[var(--danger-fg)]">
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

export function FieldLabel({ className, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  const ctx = useFieldContext();
  return (
    <label htmlFor={ctx.id} className={cn("text-xs font-semibold uppercase tracking-wide text-[var(--muted)]", className)} {...props}>
      {children}
    </label>
  );
}

export type FieldControlProps = {
  children: React.ReactElement<{
    id?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }>;
};

/**
 * Wraps an input/textarea/select child and threads the field's id/aria props.
 * The child must accept `id`, `aria-describedby`, and `aria-invalid`.
 */
export function FieldControl({ children }: FieldControlProps) {
  const ctx = useFieldContext();
  const describedBy =
    [ctx.hasError ? ctx.errorId : null, ctx.hasHint && !ctx.hasError ? ctx.hintId : null]
      .filter(Boolean)
      .join(" ") || undefined;
  return React.cloneElement(children, {
    id: ctx.id,
    "aria-describedby": describedBy,
    "aria-invalid": ctx.hasError ? true : undefined,
  });
}
