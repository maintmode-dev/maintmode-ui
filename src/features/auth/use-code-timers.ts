"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { OTP_REISSUE_COOLDOWN_SECONDS } from "@/domain/auth/otp-timing";

/**
 * The countdown, resend cooldown and double-submit guard shared by the two
 * emailed-code flows: sign-in (RUK-288) and password reset (RUK-289).
 *
 * Extracted rather than duplicated because the numbers are contract facts, not
 * styling: `CODE_TTL_SECONDS` equals the backend's `otp_ttl`, and both flows
 * spend attempts from the same per-user budget. Two copies would drift, and the
 * copy that drifted would tell a user their live code had expired.
 */

/** Backend `otp_ttl`. The real expiry lives server-side and is never returned. */
export const CODE_TTL_SECONDS = 300;

/**
 * The backend's reissue cooldown, not a guess. Inside it a resend is answered
 * 202 with no email, so a shorter wait here offered "Request a new code" for a
 * code that would never come (it was 30s against the backend's 60s). It also
 * keeps retries away from the per-IP bucket the password and OAuth endpoints
 * share.
 */
export const RESEND_COOLDOWN_SECONDS = OTP_REISSUE_COOLDOWN_SECONDS;

/**
 * The backend's `auth.otp_max_attempts`. It claims an attempt BEFORE comparing
 * the code, so a submit with a stale nonce spends one exactly like a wrong
 * digit does — which is why the caller counts every submit rather than only the
 * plausible ones.
 *
 * Deliberately the configured value (5) and not the backend's ceiling for that
 * setting (10). Erring high would hand the user five doomed submits against an
 * exhausted code; erring low costs at worst one premature "request a new code",
 * which is the state they were heading for anyway.
 */
export const MAX_CODE_ATTEMPTS = 5;

export interface CodeTimers {
  /** Seconds until the code is presumed dead. Zero means expired. */
  remaining: number;
  /** Seconds until resend is offered again. Zero means it is available. */
  cooldown: number;
  /** True once `remaining` has run out on the code step. */
  expired: boolean;
  /**
   * Starts both timers — call on a successful code request. A resumed flow
   * passes the code's known deadline (epoch ms) instead of starting afresh.
   */
  start: (knownDeadline?: number) => void;
  /** Stops both — call when leaving the code step. */
  reset: () => void;
  /** Restarts only the cooldown, for a request that failed. */
  startCooldown: () => void;
  /**
   * Runs `fn` unless a submit is already in flight, and reports whether it ran.
   * Each stray submit spends one of the attempts and the backend floors every
   * response to ~300 ms, so a double-click is a live risk rather than a
   * theoretical one.
   */
  guard: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
}

/** Whole seconds from now until `deadline`, floored at zero. */
function secondsUntil(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function useCodeTimers(active: boolean): CodeTimers {
  // Deadlines, not counters. A decrementing counter drifts whenever the tab is
  // throttled — a backgrounded tab, a laptop waking from sleep, a bfcache
  // restore — and it drifts in the direction that OVER-reports the time left,
  // so the user is shown "expires in 4:12" for a code the backend has already
  // discarded. Deriving from a timestamp survives all three, and the displayed
  // value stays optimistic only by the network delay it was always optimistic
  // by.
  const codeDeadline = useRef(0);
  const cooldownDeadline = useRef(0);
  const [remaining, setRemaining] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const inFlight = useRef(false);

  // One interval drives both counters, torn down when the step is left, so a
  // backgrounded tab cannot leave a timer running.
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const now = Date.now();
      setRemaining(secondsUntil(codeDeadline.current, now));
      setCooldown(secondsUntil(cooldownDeadline.current, now));
    };
    const id = setInterval(tick, 1000);
    // Once immediately, so a tab returning to the foreground corrects on the
    // frame it wakes rather than a second later.
    tick();
    return () => clearInterval(id);
  }, [active]);

  const start = useCallback((knownDeadline?: number) => {
    // Counted from response receipt, so the client is always slightly
    // optimistic relative to the server. That is the safe direction: the
    // backend, not this timer, decides whether a code is still valid.
    //
    // A resumed flow passes the deadline it was issued with (UX-12), so a
    // reload does not restart the count; the cooldown is measured from the
    // same moment the code was sent. Never later than a fresh start would
    // give: a skewed or tampered value can shorten the count, not stretch it.
    const now = Date.now();
    const fresh = now + CODE_TTL_SECONDS * 1000;
    const deadline = knownDeadline === undefined ? fresh : Math.min(knownDeadline, fresh);
    const sentAt = deadline - CODE_TTL_SECONDS * 1000;
    codeDeadline.current = deadline;
    cooldownDeadline.current = sentAt + RESEND_COOLDOWN_SECONDS * 1000;
    setRemaining(secondsUntil(codeDeadline.current, now));
    setCooldown(secondsUntil(cooldownDeadline.current, now));
  }, []);

  const reset = useCallback(() => {
    codeDeadline.current = 0;
    cooldownDeadline.current = 0;
    setRemaining(0);
    setCooldown(0);
  }, []);

  const startCooldown = useCallback(() => {
    // A failed request starts a fresh cooldown rather than leaving the button
    // hot: a 429 answered by immediate retries is what caused it.
    cooldownDeadline.current = Date.now() + RESEND_COOLDOWN_SECONDS * 1000;
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }, []);

  const guard = useCallback(async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    try {
      return await fn();
    } finally {
      inFlight.current = false;
    }
  }, []);

  return {
    remaining,
    cooldown,
    expired: active && remaining === 0,
    start,
    reset,
    startCooldown,
    guard,
  };
}

/**
 * Holds back a new code request for an address whose code this browser has
 * just burnt.
 *
 * After five refused codes the backend keeps the burnt code in the user's
 * single slot until it expires: a request before then is answered 202 with no
 * email. So offering "Email me a code" right away promised an email that would
 * not come. The hold lasts what is left of the burnt code, applies only to the
 * address it was burnt for (typing another address is not held), and lifts
 * itself when the code expires.
 */
export function useSpentCodeHold() {
  const [hold, setHold] = useState<{ email: string; until: number }>();

  useEffect(() => {
    if (!hold) return;
    const id = setTimeout(() => setHold(undefined), Math.max(0, hold.until - Date.now()));
    return () => clearTimeout(id);
  }, [hold]);

  const holdFor = useCallback((email: string, seconds: number) => {
    if (seconds <= 0) return;
    setHold({ email: email.trim().toLowerCase(), until: Date.now() + seconds * 1000 });
  }, []);

  const isHeld = useCallback(
    (email: string) => hold !== undefined && hold.email === email.trim().toLowerCase(),
    [hold],
  );

  return { holdFor, isHeld };
}
