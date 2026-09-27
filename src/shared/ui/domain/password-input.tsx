"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { Input } from "@/shared/ui/shadcn/input";
import { cn } from "@/shared/ui/lib/cn";

export type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, "type">;

/**
 * A password field the person typing it can check.
 *
 * For fields where a typo is expensive and invisible: a NEW password is typed
 * once, with nothing to compare it against, and a mistake in the reset flow
 * means requesting another code and doing the whole reset again. Showing what
 * was typed is the cheap alternative to a second "confirm" field.
 *
 * The toggle is a real `type="button"` — it never submits the form — with a
 * label that says what pressing it will do, and it follows the input in tab
 * order, so keyboard users reach it with one Tab.
 */
export function PasswordInput({ className, disabled, ...inputProps }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        {...inputProps}
        type={visible ? "text" : "password"}
        disabled={disabled}
        className={cn("pr-9", className)}
      />
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-fg-muted hover:text-fg disabled:opacity-50"
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        // The label says what pressing will do. No `aria-pressed` alongside it:
        // "Hide password, pressed" reads backwards to a screen reader.
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
