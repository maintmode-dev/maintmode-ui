"use client";

import { useCallback, useState } from "react";

import { Button } from "@/shared/ui/shadcn/button";
import { Checkbox } from "@/shared/ui/shadcn/checkbox";
import { Input } from "@/shared/ui/shadcn/input";
import { Label } from "@/shared/ui/shadcn/label";
import { isWellFormedOtpCode } from "@/domain/auth/sign-in-method";
import { useCodeTimers } from "@/features/auth/use-code-timers";

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
  /**
   * `rememberMe` is a required third argument (RUK-290) — optional would let a
   * caller pass `undefined` into a chain typed `boolean` with no compiler error.
   */
  submitCode: (email: string, code: string, rememberMe: boolean) => Promise<{ error?: string }>;
  onChangeEmail: () => Promise<void>;
}

export function OtpSignInFlow({ label, requestCode, submitCode, onChangeEmail }: OtpSignInFlowProps) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  // Belongs to step two: this is the request that mints the session. Asking on
  // the address step would attach the choice to a request that issues no token.
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

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
      const outcome = await submitCode(email, code.trim(), rememberMe);
      setPending(false);
      return outcome;
    });
    if (!result || !result.error) return;

    if (result.error === "otp_session_mismatch") {
      // The binding is gone — the server has already cleared it — so step two
      // is now a dead end: "Sign in" would fire further doomed calls, and the
      // copy tells the user to request a new code while the residual cooldown
      // greys that button out. Return to step one, where asking for a new code
      // is the primary action and nothing is throttled.
      setStep("email");
      setCode("");
      // Reset explicitly: the step changes in place, the component is not
      // unmounted, so nothing clears this for us. Returning to step one is a
      // fresh sign-in and must not silently inherit the previous choice.
      setRememberMe(false);
      timers.reset();
    }
    setError(result.error);
  }

  async function backToEmail() {
    await onChangeEmail();
    setStep("email");
    setCode("");
    setRememberMe(false);
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
        <>
          <div className="flex items-center gap-2 py-0.5">
            <Checkbox
              id="otp-remember-me"
              checked={rememberMe}
              disabled={pending}
              onCheckedChange={(checked) => setRememberMe(checked === true)}
            />
            {/* Names no duration on purpose — see the password form. */}
            <Label htmlFor="otp-remember-me" className="text-xs font-normal text-fg-muted">
              Keep me signed in
            </Label>
          </div>
          <Button type="submit" disabled={pending || code.trim().length !== 6}>
            {pending ? "Checking…" : "Sign in"}
          </Button>
        </>
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
    case "otp_session_mismatch":
      return "This code can't be checked in this browser. Request a new one to continue.";
    case "otp_verification_failed":
      return "That code isn't valid. Check it and try again, or request a new one.";
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
