"use client";

import { useEffect, useState } from "react";

import { Button } from "@/shared/ui/shadcn/button";
import { Input } from "@/shared/ui/shadcn/input";
import { Label } from "@/shared/ui/shadcn/label";
import { isWellFormedOtpCode, isPasswordWithinPolicy } from "@/domain/auth/sign-in-method";
import { flowErrorMessage } from "@/features/auth/otp-sign-in-flow";
import { MAX_CODE_ATTEMPTS, useCodeTimers } from "@/features/auth/use-code-timers";

/**
 * "Forgot password" — a two-step emailed-code flow that ends in a new password
 * (RUK-289).
 *
 * A sibling of `OtpSignInFlow` rather than a mode of it. That component's steps
 * end in a session (its success path is a redirect thrown by NextAuth, so there
 * is no success state to render), while this one ends signed OUT with something
 * to say. Sharing the shell would mean a prop deciding which of two endpoints,
 * which of two cookies and which of two terminal states applies — the timers
 * are what the two genuinely share, and those are extracted into a hook.
 */

type Step = "email" | "code";

export interface PasswordResetFlowProps {
  /** Rehydrated from the reset cookie by the server page, after a reload. */
  initialEmail?: string;
  initialStep?: Step;
  requestCode: (email: string) => Promise<{ error?: string }>;
  confirm: (args: {
    email: string;
    code: string;
    newPassword: string;
  }) => Promise<{ error?: string; done?: boolean }>;
  abandon: () => Promise<void>;
  /** Returns to the sign-in form; the confirmation is owned by the page. */
  onDone: () => void;
  onCancel: () => void;
}

export function PasswordResetFlow({
  initialEmail,
  initialStep,
  requestCode,
  confirm,
  abandon,
  onDone,
  onCancel,
}: PasswordResetFlowProps) {
  const [step, setStep] = useState<Step>(initialStep ?? "email");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  // Counts THIS browser's submits against the backend's per-code budget. The
  // backend collapses "wrong code", "expired" and "attempts exhausted" into one
  // indistinguishable answer, so without a local count a user who burns every
  // attempt keeps a live cookie for its full TTL and every reload drops them
  // back onto a permanently dead code.
  const [attempts, setAttempts] = useState(0);

  const timers = useCodeTimers(step === "code");
  const budgetSpent = attempts >= MAX_CODE_ATTEMPTS;

  // Rehydrating straight into step two starts with the countdown at zero, which
  // reads as "expired" and hides the submit button — so a user returning from
  // their email finds a form they cannot send. The real expiry is server-side
  // and never returned; this is the same optimistic local clock the flow uses
  // after a fresh request, and the backend remains the authority.
  useEffect(() => {
    if (initialStep === "code") timers.start();
    // Once, on mount: `start` is stable and re-running it would reset the
    // countdown under a user who is mid-flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(address: string) {
    setPending(true);
    setError(undefined);
    const result = await requestCode(address);
    setPending(false);

    if (result.error) {
      setError(result.error);
      timers.startCooldown();
      return;
    }
    timers.start();
    setCode("");
    setAttempts(0);
    setStep("code");
  }

  /** Leaves step two for step one, discarding the binding server-side. */
  async function restart() {
    await abandon();
    timers.reset();
    setStep("email");
    setCode("");
    setAttempts(0);
  }

  async function onSubmitCode(event: React.FormEvent) {
    event.preventDefault();
    if (pending || timers.expired || budgetSpent) return;

    if (!isWellFormedOtpCode(code)) {
      setError("invalid_code_format");
      return;
    }
    // Checked here as well as in the action so the user is told which field is
    // wrong before a round-trip. The action is the authority; this is the
    // message.
    if (!isPasswordWithinPolicy(password)) {
      setError("password_policy_violation");
      return;
    }

    await timers.guard(async () => {
      setPending(true);
      setError(undefined);
      const result = await confirm({ email, code: code.trim(), newPassword: password });
      setPending(false);

      if (result.done) {
        onDone();
        return;
      }

      // Counted for every answer the server gave, including a mismatch: the
      // backend claims an attempt BEFORE it compares the code, so a stale nonce
      // costs one exactly as a wrong digit does.
      const spent = attempts + 1;
      setAttempts(spent);

      if (result.error === "password_reset_session_mismatch") {
        // The binding is already gone server-side, so step two is a dead end.
        await restart();
      } else if (spent >= MAX_CODE_ATTEMPTS) {
        // Out of attempts: drop the binding rather than leave a live cookie
        // pointing at a code that can no longer be redeemed.
        await restart();
      }
      setError(result.error);
    });
  }

  if (step === "email") {
    return (
      <form
        className="flex flex-col gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = email.trim();
          if (!trimmed || pending) return;
          void send(trimmed);
        }}
      >
        <Label htmlFor="reset-email">Reset your password</Label>
        <p className="caption">
          We&apos;ll email you a code if that address has an account. Setting a new password signs you out
          everywhere.
        </p>
        <Input
          id="reset-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby={error ? "reset-error" : undefined}
        />
        {error ? <ResetError code={error} /> : null}
        <Button type="submit" disabled={!email.trim() || pending}>
          {pending ? "Sending…" : "Email me a code"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Back to sign in
        </Button>
      </form>
    );
  }

  const dead = timers.expired || budgetSpent;

  return (
    <form className="flex flex-col gap-2.5" onSubmit={onSubmitCode}>
      <Label htmlFor="reset-code">Enter the 6-digit code</Label>
      <p className="caption">
        Sent to {email}.{" "}
        <button type="button" className="underline" onClick={() => void restart()}>
          Use a different address
        </button>
      </p>
      <Input
        id="reset-code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        disabled={dead}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
      />
      <Label htmlFor="reset-password">New password</Label>
      <Input
        id="reset-password"
        name="new-password"
        type="password"
        autoComplete="new-password"
        value={password}
        disabled={dead}
        onChange={(e) => setPassword(e.target.value)}
        aria-describedby="reset-password-hint"
      />
      {/*
       * "Characters" rather than bytes: the policy is 12 BYTES, which is not a
       * unit to put in front of an operator. The hint is the ASCII worst case,
       * so it can only ever under-promise — an 11-character Cyrillic password
       * is 22 bytes and is accepted. Erring that way shows a user their
       * password was taken when the hint implied otherwise, never the reverse.
       */}
      <p id="reset-password-hint" className="caption">
        At least 12 characters. This signs you out of every device.
      </p>
      {dead ? (
        <ResetError code={budgetSpent ? "password_reset_failed" : "expired"} />
      ) : error ? (
        <ResetError code={error} />
      ) : (
        <p className="caption" role="timer">
          Expires in {formatRemaining(timers.remaining)}
        </p>
      )}
      {!dead ? (
        <Button type="submit" disabled={pending || code.trim().length !== 6 || !password}>
          {pending ? "Saving…" : "Set new password"}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="outline"
        disabled={pending || (timers.cooldown > 0 && !dead)}
        onClick={() => void send(email)}
      >
        {timers.cooldown > 0 && !dead ? `Request a new code (${timers.cooldown}s)` : "Request a new code"}
      </Button>
    </form>
  );
}

function formatRemaining(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function ResetError({ code }: { code: string }) {
  return (
    <p id="reset-error" role="alert" className="text-xs text-[var(--destructive-fg)]">
      {resetErrorMessage(code)}
    </p>
  );
}

/**
 * Reset-specific copy, falling through to the shared map for the codes both
 * flows raise. Kept separate where the wording has to differ: sign-in's
 * mismatch copy tells the user to go back and sign in, which is not where
 * someone mid-reset is trying to go.
 */
export function resetErrorMessage(code: string): string {
  switch (code) {
    case "password_reset_session_mismatch":
      return "This code can't be checked in this browser. Request a new one to continue.";
    case "password_reset_failed":
      return "That code isn't valid, or it has been used too many times. Request a new one.";
    case "password_policy_violation":
      return "Choose a longer password — at least 12 characters.";
    case "password_reset_unavailable":
      // A fact about the service, not about the account or the code. Saying so
      // stops an outage from reading as "you typed something wrong".
      return "Password reset is unavailable right now. Try again shortly.";
    default:
      return flowErrorMessage(code);
  }
}
