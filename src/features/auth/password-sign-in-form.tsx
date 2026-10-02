"use client";

import { useState } from "react";

import { Button } from "@/shared/ui/shadcn/button";
import { Input } from "@/shared/ui/shadcn/input";
import { Label } from "@/shared/ui/shadcn/label";

import { flowErrorMessage } from "@/features/auth/otp-sign-in-flow";

/**
 * Email + password sign-in (RUK-288).
 *
 * Serves both the bootstrap break-glass administrator and, later,
 * `email_password`; the backend decides which internally, so this form does not
 * change when the second arrives.
 *
 * The "Forgot password?" affordance lives INSIDE this form (RUK-289), so it
 * appears and disappears with the password method itself: an instance that is
 * not advertising password sign-in must not offer to reset one.
 */

export interface PasswordSignInFormProps {
  label: string;
  submit: (email: string, password: string) => Promise<{ error?: string }>;
  /** Opens the reset flow. Absent when the deployment has no reset endpoint. */
  onForgotPassword?: () => void;
  /** Focus the email field on mount — set when the user just opened this form. */
  autoFocus?: boolean;
}

export function PasswordSignInForm({ label, submit, onForgotPassword, autoFocus }: PasswordSignInFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !password || pending) return;

    setPending(true);
    setError(undefined);
    // A rejected action must not leave the button on "Signing in…" for good:
    // the form is then a dead end with nothing to say. Any rejection reads as
    // the generic failure — what failed is not the user's to fix.
    try {
      const result = await submit(trimmed, password);
      if (result.error) setError(result.error);
    } catch {
      setError("unexpected");
    } finally {
      setPending(false);
    }
  }

  return (
    // Label-to-field 6px, field-to-field 12px: the grouping is what tells the
    // eye which label belongs to which input without a card around them.
    <form className="flex flex-col gap-3" onSubmit={onSubmit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password-email">Email</Label>
        <Input
          className="h-10"
          id="password-email"
          name="email"
          autoFocus={autoFocus}
          type="email"
          // `username` rather than `email` so password managers file and fill this
          // as the identity half of a credential pair.
          autoComplete="username"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby={error ? "password-error" : undefined}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password-password">{label}</Label>
        <Input
          className="h-10"
          id="password-password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby={error ? "password-error" : undefined}
        />
      </div>
      {error ? (
        <p id="password-error" role="alert" className="text-xs text-[var(--destructive-fg)]">
          {flowErrorMessage(error)}
        </p>
      ) : null}
      <Button size="lg" type="submit" disabled={!email.trim() || !password || pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      {onForgotPassword ? (
        <button
          type="button"
          className="caption self-center underline-offset-4 hover:text-fg-muted hover:underline"
          onClick={onForgotPassword}
        >
          Forgot password?
        </button>
      ) : null}
    </form>
  );
}
