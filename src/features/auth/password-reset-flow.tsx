"use client";

import { useEffect, useState } from "react";

import { Button } from "@/shared/ui/shadcn/button";
import { Input } from "@/shared/ui/shadcn/input";
import { PasswordInput } from "@/shared/ui/domain/password-input";
import { Label } from "@/shared/ui/shadcn/label";
import { isWellFormedOtpCode, isPasswordWithinPolicy } from "@/domain/auth/sign-in-method";
import { flowErrorMessage } from "@/features/auth/otp-sign-in-flow";
import { MAX_CODE_ATTEMPTS, useCodeTimers, useSpentCodeHold } from "@/features/auth/use-code-timers";

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
  /** The resumed code's deadline (epoch ms), when the binding carries one. */
  initialExpiresAt?: number;
  /** Resolves with the bound code's deadline (epoch ms) on success. */
  requestCode: (email: string) => Promise<{ error?: string; expiresAt?: number; refused?: number }>;
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
  initialExpiresAt,
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
  const spentHold = useSpentCodeHold();
  const budgetSpent = attempts >= MAX_CODE_ATTEMPTS;

  // Rehydrating straight into step two starts with the countdown at zero, which
  // reads as "expired" and hides the submit button — so a user returning from
  // their email finds a form they cannot send. The real expiry is server-side
  // and never returned; this is the same optimistic local clock the flow uses
  // after a fresh request, and the backend remains the authority.
  useEffect(() => {
    if (initialStep === "code") timers.start(initialExpiresAt);
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
      // The server recognised a burnt code for this address — after a reload,
      // or burnt in the sign-in flow — and says when it clears.
      if (result.error === "otp_attempts_spent" && result.expiresAt !== undefined) {
        spentHold.holdFor(address, Math.ceil((result.expiresAt - Date.now()) / 1000));
      }
      timers.startCooldown();
      return;
    }
    // The deadline the server bound — part-way through its life when a request
    // inside the backend's reissue cooldown kept the existing code.
    timers.start(result.expiresAt);
    setCode("");
    // A kept code resumes with what it has left, not a fresh five: back out of
    // step two after four refusals, ask again, and one attempt remains.
    setAttempts(result.refused ?? 0);
    setStep("code");
  }

  /**
   * Leaves step two for step one, discarding the binding server-side.
   *
   * Takes the message to show rather than leaving the caller to set it
   * afterwards: the caller's `setError` used to land in a later batch and
   * survive only because nothing here touched `error`. Adding the obvious
   * `setError(undefined)` to this function — it clears every other field —
   * would have silently deleted the only explanation the user gets.
   */
  async function restart(message?: string) {
    await abandon();
    timers.reset();
    setStep("email");
    setCode("");
    // Cleared with the code, not left behind. Without this, someone who backs
    // out and resets a DIFFERENT address finds the previous password already
    // filled in, and submits for that account a secret they never knowingly
    // re-entered — besides holding a plaintext password in state longer than
    // the flow has any use for it.
    setPassword("");
    setAttempts(0);
    setError(message);
  }

  /** Abandons the flow from step two: discard the binding, then leave. */
  async function leave() {
    await restart();
    onCancel();
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

      // Only a refused code counts — the one answer that spent a backend
      // attempt. A 429 never reached the code and an outage checked nothing;
      // counted, five of either threw away a still-valid code and sent the user
      // back into the same limiter. The sign-in flow counts the same way.
      const spent = result.error === "password_reset_failed" ? attempts + 1 : attempts;
      setAttempts(spent);

      if (spent >= MAX_CODE_ATTEMPTS) {
        // The attempts are spent, so step two is a dead end, and leaving a live
        // cookie behind would rehydrate the user onto a code that can never be
        // redeemed. A lost binding ends up here too: the backend no longer
        // tells it apart from a wrong code (BUG-2).
        // The cause, in the sign-in flow's words: the backend's answer cannot
        // say the budget is gone, so the generic failure would not either.
        // The burnt code holds the backend's slot until it expires: a new
        // request before then sends nothing, so it is held for what is left.
        spentHold.holdFor(email, timers.remaining);
        await restart("otp_attempts_spent");
        return;
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
          if (!trimmed || pending || spentHold.isHeld(trimmed)) return;
          void send(trimmed);
        }}
      >
        <Label htmlFor="reset-email">Reset your password</Label>
        <p className="caption">
          We&apos;ll email you a code if that address has an account. Setting a new password signs you out
          everywhere within minutes.
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
        <Button type="submit" disabled={!email.trim() || pending || spentHold.isHeld(email)}>
          {pending ? "Sending…" : "Email me a code"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Back to sign in
        </Button>
      </form>
    );
  }

  // Only expiry can be true here. Spending the budget is always followed by
  // `restart()` in the same React batch, so the flow leaves this step before a
  // `budgetSpent` render can happen — the submit guard above still checks it,
  // because a guard that is cheap and states the intent is worth keeping, but
  // the rendering below would be dead code.
  const dead = timers.expired;
  // A dead code makes resend the only way forward, so the cooldown is waived
  // rather than made to run out first.
  const throttled = timers.cooldown > 0 && !dead;

  return (
    <form className="flex flex-col gap-2.5" onSubmit={onSubmitCode}>
      {/* The flow's name stays on screen for step two as well (UX-2): the page
          heading still reads "Sign in to …", and without this the code and
          password fields below look like a sign-in form. */}
      <h2 className="text-sm font-medium">Reset your password</h2>
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
        // Points at whichever of the two actually renders below, matching the
        // sign-in flow: the alert fires once, and a screen-reader user who
        // returns focus here afterwards would otherwise hear nothing saying why
        // the code was rejected.
        aria-describedby={error || dead ? "reset-error" : "reset-countdown"}
      />
      <Label htmlFor="reset-password">New password</Label>
      <PasswordInput
        id="reset-password"
        name="new-password"
        autoComplete="new-password"
        value={password}
        disabled={dead}
        onChange={(e) => setPassword(e.target.value)}
        aria-describedby={
          error === "password_policy_violation" ? "reset-error reset-password-hint" : "reset-password-hint"
        }
      />
      {/*
       * "Characters" rather than bytes: the policy is 12 BYTES, which is not a
       * unit to put in front of an operator. The hint is the ASCII worst case,
       * so it can only ever under-promise — an 11-character Cyrillic password
       * is 22 bytes and is accepted. Erring that way shows a user their
       * password was taken when the hint implied otherwise, never the reverse.
       */}
      <p id="reset-password-hint" className="caption">
        At least 12 characters. This signs you out of every device within minutes.
      </p>
      {dead ? (
        <ResetError code="expired" />
      ) : error ? (
        <ResetError code={error} />
      ) : (
        <p id="reset-countdown" className="caption" role="timer">
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
        disabled={pending || throttled}
        onClick={() => void send(email)}
      >
        {throttled ? `Request a new code (${timers.cooldown}s)` : "Request a new code"}
      </Button>
      {/* A way out of step two (UX-2). It discards the binding before leaving:
          otherwise the next visit to /login would rehydrate straight back into
          this step, which is the opposite of what "back" asked for. */}
      <Button type="button" variant="ghost" disabled={pending} onClick={() => void leave()}>
        Back to sign in
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
 * flows raise. Kept separate where the wording has to differ: a failed confirm
 * can also mean the attempts are spent, and the password-policy and outage
 * cases exist only here.
 */
export function resetErrorMessage(code: string): string {
  switch (code) {
    case "password_reset_failed":
      // The same words as sign-in's uniform failure, for the same contract:
      // one 401 for wrong, expired, exhausted and a lost binding. It used to add
      // "used too many times", which told a user on their first typo that the
      // code was spent while four attempts remained.
      return flowErrorMessage("otp_verification_failed");
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
