"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/shared/ui/shadcn/button";
import { Input } from "@/shared/ui/shadcn/input";
import { Label } from "@/shared/ui/shadcn/label";

/**
 * Two-step email one-time-code sign-in (RUK-288).
 *
 * Plain `useState` rather than a state-machine library: `/login` sits under
 * `(public)`, which deliberately omits AppProviders so the app's cold-start
 * route stays thin, and a new client dependency here is exactly what
 * `check-bundle-budget.mjs` guards against.
 */

/** Backend `otp_ttl`. The real expiry lives server-side and is never returned. */
const CODE_TTL_SECONDS = 300;
/**
 * Advisory only. The backend has no resend cooldown, and its per-IP bucket is
 * shared with the password and OAuth endpoints — so an unthrottled resend
 * button would lock the user out of the *other* ways in. The server's 429 is
 * the real backstop.
 */
const RESEND_COOLDOWN_SECONDS = 30;

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
  const [remaining, setRemaining] = useState(0);
  const [cooldown, setCooldown] = useState(0);

  // One interval drives both counters. Started on entry to step two and torn
  // down on leaving it, so a backgrounded tab cannot leave a timer running.
  useEffect(() => {
    if (step !== "code") return;
    const id = setInterval(() => {
      setRemaining((r) => (r > 0 ? r - 1 : 0));
      setCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  const expired = step === "code" && remaining === 0;

  const send = useCallback(
    async (address: string) => {
      setPending(true);
      setError(undefined);
      const result = await requestCode(address);
      setPending(false);

      if (result.error) {
        setError(result.error);
        // A failed request starts a fresh cooldown rather than leaving the
        // button hot: a 429 answered by immediate retries is what caused it.
        setCooldown(RESEND_COOLDOWN_SECONDS);
        return;
      }
      // Counted from response receipt, so the client is always slightly
      // optimistic relative to the server. That is the safe direction: the
      // backend, not this timer, decides whether a code is still valid.
      setRemaining(CODE_TTL_SECONDS);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setCode("");
      setStep("code");
    },
    [requestCode],
  );

  const inFlight = useRef(false);

  async function onSubmitCode(event: React.FormEvent) {
    event.preventDefault();
    // Each stray submit spends one of five attempts, and the backend floors
    // every response to ~300ms, so a double-click is a live risk.
    if (inFlight.current || pending || expired) return;
    if (!/^\d{6}$/.test(code.trim())) {
      setError("invalid_code_format");
      return;
    }

    inFlight.current = true;
    setPending(true);
    setError(undefined);
    const result = await submitCode(email, code.trim());
    inFlight.current = false;
    setPending(false);
    if (result.error) setError(result.error);
  }

  async function backToEmail() {
    await onChangeEmail();
    setStep("email");
    setCode("");
    setError(undefined);
    setRemaining(0);
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
    case "otp_request_failed":
      return "Too many requests. Wait a moment and try again.";
    default:
      return "Something went wrong. Try again.";
  }
}
