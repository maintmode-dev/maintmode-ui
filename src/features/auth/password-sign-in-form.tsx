"use client";

import { useState } from "react";

import { Button } from "@/shared/ui/shadcn/button";
import { Checkbox } from "@/shared/ui/shadcn/checkbox";
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
  /**
   * `rememberMe` is a required third argument, not an optional one: optional
   * would let a caller omit it and pass `undefined` into a chain typed
   * `boolean`, which no compiler error would catch (RUK-290).
   */
  submit: (email: string, password: string, rememberMe: boolean) => Promise<{ error?: string }>;
  /** Opens the reset flow. Absent when the deployment has no reset endpoint. */
  onForgotPassword?: () => void;
}

export function PasswordSignInForm({ label, submit, onForgotPassword }: PasswordSignInFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !password || pending) return;

    setPending(true);
    setError(undefined);
    const result = await submit(trimmed, password, rememberMe);
    setPending(false);
    if (result.error) setError(result.error);
  }

  return (
    <form className="flex flex-col gap-2.5" onSubmit={onSubmit}>
      <Label htmlFor="password-email">Email</Label>
      <Input
        id="password-email"
        name="email"
        type="email"
        // `username` rather than `email` so password managers file and fill this
        // as the identity half of a credential pair.
        autoComplete="username"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-describedby={error ? "password-error" : undefined}
      />
      <Label htmlFor="password-password">{label}</Label>
      <Input
        id="password-password"
        name="password"
        type="password"
        autoComplete="current-password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aria-describedby={error ? "password-error" : undefined}
      />
      <div className="flex items-center gap-2 py-0.5">
        <Checkbox
          id="password-remember-me"
          checked={rememberMe}
          disabled={pending}
          onCheckedChange={(checked) => setRememberMe(checked === true)}
        />
        {/* Names no duration on purpose: the token pair carries no refresh TTL,
            so any "stay signed in for N days" would be invented. */}
        <Label htmlFor="password-remember-me" className="text-xs font-normal text-fg-muted">
          Keep me signed in
        </Label>
      </div>
      {error ? (
        <p id="password-error" role="alert" className="text-xs text-[var(--destructive-fg)]">
          {flowErrorMessage(error)}
        </p>
      ) : null}
      <Button type="submit" disabled={!email.trim() || !password || pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      {onForgotPassword ? (
        <button type="button" className="caption underline self-start" onClick={onForgotPassword}>
          Forgot password?
        </button>
      ) : null}
    </form>
  );
}
