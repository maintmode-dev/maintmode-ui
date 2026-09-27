"use client";

import { useCallback, useState } from "react";

import { Button } from "@/shared/ui/shadcn/button";
import { Input } from "@/shared/ui/shadcn/input";
import { Label } from "@/shared/ui/shadcn/label";
import { isWellFormedOtpCode } from "@/domain/auth/sign-in-method";
import { MAX_CODE_ATTEMPTS, useCodeTimers } from "@/features/auth/use-code-timers";

/**
 * Two-step email one-time-code sign-in (RUK-288).
 *
 * Plain `useState` rather than a state-machine library: `/login` sits under
 * `(public)`, which deliberately omits AppProviders so the app's cold-start
 * route stays thin, and a new client dependency here is exactly what
 * `check-bundle-budget.mjs` guards against.
 */

type Step = "email" | "code";

export interface OtpSignInFlowProps {
  label: string;
  requestCode: (email: string) => Promise<{ error?: string }>;
  submitCode: (email: string, code: string) => Promise<{ error?: string }>;
  onChangeEmail: () => Promise<void>;
}

export function OtpSignInFlow({ label, requestCode, submitCode, onChangeEmail }: OtpSignInFlowProps) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  // Counts THIS browser's submits against the backend's per-code budget. The
  // backend answers an exhausted code with the same 401 as a wrong one, so
  // without a local count the sixth submit — even with the right code — is told
  // "that code isn't valid", and every one after it spends nothing but the
  // user's patience. Same rule the password-reset flow already follows.
  const [attempts, setAttempts] = useState(0);

  // Shared with the password-reset flow (RUK-289): the TTL and the attempt
  // budget are contract facts about the same backend mechanism, and two copies
  // would drift.
  const timers = useCodeTimers(step === "code");
  const { remaining, cooldown, expired } = timers;

  const send = useCallback(
    async (address: string) => {
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
    },
    [requestCode, timers],
  );

  async function onSubmitCode(event: React.FormEvent) {
    event.preventDefault();
    if (pending || expired) return;
    if (!isWellFormedOtpCode(code)) {
      setError("invalid_code_format");
      return;
    }

    const result = await timers.guard(async () => {
      setPending(true);
      setError(undefined);
      const outcome = await submitCode(email, code.trim());
      setPending(false);
      return outcome;
    });
    if (!result || !result.error) return;

    // Counted for every answer the server gave: it claims an attempt BEFORE it
    // compares the code, so no failure here is free.
    const spent = attempts + 1;
    setAttempts(spent);

    if (spent >= MAX_CODE_ATTEMPTS) {
      // Whatever the last answer said, the code is now dead, so step two is a
      // dead end: "Sign in" would fire further doomed calls, and the residual
      // cooldown would grey out the "Request a new code" button the copy points
      // at. Return to step one, where asking again is the primary action and
      // nothing is throttled — and say why, since the backend's answer cannot.
      //
      // This is also the only way back from a lost browser binding: the
      // backend no longer tells that case apart from a wrong code (BUG-2), so
      // it runs out the same budget.
      setStep("email");
      setCode("");
      timers.reset();
      setError("otp_attempts_spent");
      return;
    }
    setError(result.error);
  }

  async function backToEmail() {
    await onChangeEmail();
    setStep("email");
    setCode("");
    setError(undefined);
    timers.reset();
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
        <Label htmlFor="otp-email">{label}</Label>
        <Input
          id="otp-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby={error ? "otp-error" : undefined}
        />
        {error ? <FlowError id="otp-error" code={error} /> : null}
        <Button type="submit" disabled={!email.trim() || pending}>
          {pending ? "Sending…" : "Email me a code"}
        </Button>
      </form>
    );
  }

  return (
    <form className="flex flex-col gap-2.5" onSubmit={onSubmitCode}>
      <Label htmlFor="otp-code">Enter the 6-digit code</Label>
      <p className="caption">
        Sent to {email}.{" "}
        <button type="button" className="underline" onClick={() => void backToEmail()}>
          Change email
        </button>
      </p>
      <Input
        id="otp-code"
        name="code"
        // Not `type="password"`: the code is not a secret to the person holding
        // it, and masking it defeats paste and one-time-code autofill.
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        disabled={expired}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        aria-describedby={error || expired ? "otp-error" : "otp-countdown"}
      />
      {expired ? (
        <FlowError id="otp-error" code="expired" />
      ) : error ? (
        <FlowError id="otp-error" code={error} />
      ) : (
        <p id="otp-countdown" className="caption" role="timer">
          Expires in {formatRemaining(remaining)}
        </p>
      )}
      {!expired ? (
        <Button type="submit" disabled={pending || code.trim().length !== 6}>
          {pending ? "Checking…" : "Sign in"}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="outline"
        disabled={pending || (cooldown > 0 && !expired)}
        onClick={() => void send(email)}
      >
        {cooldown > 0 && !expired ? `Request a new code (${cooldown}s)` : "Request a new code"}
      </Button>
    </form>
  );
}

function formatRemaining(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Client-side conditions only. Codes the backend delivers via `?code=` are
 * rendered by the page, not here — keeping the two maps apart is what stops
 * `contracts.ts`'s sync comment from becoming a lie.
 */
function FlowError({ id, code }: { id: string; code: string }) {
  return (
    <p id={id} role="alert" className="text-xs text-[var(--destructive-fg)]">
      {flowErrorMessage(code)}
    </p>
  );
}

export function flowErrorMessage(code: string): string {
  switch (code) {
    // Expiry wins over a wrong code: telling someone to re-check a code that
    // can no longer work is a dead end.
    case "expired":
      return "This code has expired. Request a new one.";
    case "otp_verification_failed":
      // Covers every verify failure by contract — wrong, expired, exhausted, a
      // lost browser binding — so it names both likely causes and the one
      // action that fixes all of them.
      return "That code is wrong or has expired. Check it, or request a new one.";
    case "otp_attempts_spent":
      // Client-side: the local budget ran out. Says nothing about whether the
      // last code was right — the backend's answer cannot tell us that.
      return "Too many attempts for this code. Request a new one.";
    case "invalid_credentials":
      // Names both fields deliberately: saying which one was wrong would
      // enumerate accounts.
      return "That email or password isn't right.";
    case "identity_lookup_failed":
      return "Signed in, but we couldn't load your profile. Try again.";
    case "invalid_code_format":
      return "Enter the 6-digit code.";
    case "invalid_email":
      return "Enter a valid email address.";
    case "otp_requests_rate_limited":
      // Request step: no code has been checked, so "attempts" would be wrong.
      return "Too many requests. Wait a moment and try again.";
    case "otp_rate_limited":
      return "Too many attempts. Wait a moment and try again.";
    case "otp_request_failed":
      return "Something went wrong. Try again.";
    default:
      return "Something went wrong. Try again.";
  }
}
