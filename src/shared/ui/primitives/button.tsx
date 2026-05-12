import * as React from "react";

import { cn } from "@/shared/ui/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "default" | "sm";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "bg-[var(--accent)] border-[var(--accent)] text-white hover:brightness-105",
  secondary: "bg-[var(--surface)] border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--surface-subtle)]",
  ghost: "bg-transparent border-transparent text-[var(--foreground)] hover:bg-[var(--surface-subtle)]",
  danger: "bg-white border-[var(--danger-border)] text-[var(--danger-fg)] hover:bg-[var(--danger-soft)]",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  default: "h-10 px-4 text-sm",
  sm: "h-8 px-3 text-xs",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className, variant = "secondary", size = "default", type = "button", ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-md border font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
          VARIANT_CLASS[variant],
          SIZE_CLASS[size],
          className,
        )}
        {...props}
      />
    );
  },
);
