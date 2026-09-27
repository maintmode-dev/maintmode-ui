import "server-only";

import { cookies } from "next/headers";

import { OTP_MAX_ATTEMPTS, OTP_REISSUE_COOLDOWN_SECONDS } from "@/domain/auth/otp-timing";

/**
 * Short-lived, httpOnly cookie carrying the OTP browser binding (RUK-288).
 *
 * Why this exists at all: the backend deliberately sets NO cookie on either OTP
 * step. It returns a `session_nonce` in the 202 body of the request step and
 * expects it back as a body field on verify, because the browser never calls
 * that API — the BFF does, server-to-server — so a `Set-Cookie` from the
 * backend would be stored by our HTTP client and never reach the user,
 * "leaving a binding that looks implemented and binds nothing". The binding to
 * an actual browser is therefore ours to implement, on our own origin.
 *
 * (Note the design doc `auth-builtin-signin-design.md` §5.1.1 describes a
 * backend-set cookie. It is stale; the handler is the source of truth. Tracked
 * as FU-1.)
 *
 * The nonce is never returned in a response body, so browser JavaScript can
 * neither read it nor forge one. `__Host-` costs nothing and blocks a sibling
 * subdomain from planting a cookie the sign-in callback would then trust; it
 * implies `Secure`, `Path=/` and no `Domain`, which is why those are not
 * repeated as options below.
 *
 * The email travels with the nonce so the verify step cannot be pointed at a
 * different address than the one the code was issued for. Encoding is
 * base64url(JSON) rather than a delimiter join: the address is attacker-supplied
 * (the backend answers 202 for any well-formed one), so `${nonce}:${email}`
 * would let an address containing the delimiter control the parsed nonce.
 *
 * ONE COOKIE PER FLOW, not one overall (revised in RUK-289). Within a single
 * flow a second tab still overwrites the first, and that remains deliberate:
 * the first tab then fails with the uniform "wrong or expired — request a new
 * code" answer, which is the right advice in that situation too.
 *
 * Across flows it was a defect. Sign-in and password-reset both bind a nonce,
 * and with one cookie a reset request overwrote the sign-in binding while the
 * email equality check still PASSED — same address — so a sign-in code was
 * verified against the reset nonce and the user was told a correct code was
 * wrong.
 *
 * Separating the names fixes the binding, and only the binding. The backend
 * keeps one OTP record per user, so requesting a reset code still consumes any
 * live sign-in code server-side (SPEC §1.5): the sign-in tab fails either way,
 * and the point of the split is that it now fails as "request a new code"
 * rather than as "that code is wrong".
 *
 * Both names are deployed artifacts. Renaming either one invalidates every
 * binding users hold mid-flow at deploy time.
 */
export const OTP_NONCE_COOKIE = "__Host-mm.otp_nonce";
export const PWRESET_NONCE_COOKIE = "__Host-mm.pwreset_nonce";

/**
 * Equal to the backend's `otp_ttl` (5 min), deliberately not longer. A margin
 * would create a window where the cookie outlives the code, so verify would
 * answer `unauthorized` and the user would be told to re-check a code that had
 * merely expired.
 */
const MAX_AGE_SECONDS = 300;

export interface OtpBinding {
  nonce: string;
  email: string;
  /**
   * When the code expires, epoch ms — written by `setBinding`, read back for
   * a resumed flow (UX-12, v0.2.0-rc). Absent on a binding written before the
   * field existed; readers must treat it as unknown.
   */
  expiresAt?: number;
  /**
   * Refused codes counted against this binding's code (BUG-13 follow-up). Kept
   * in the cookie rather than in page state so a reload or the other flow can
   * still tell the code is burnt — the backend holds a burnt code's slot until
   * it expires, and says nothing about it.
   */
  fails?: number;
  /**
   * The user left step two ("Back to sign in", "Change email", "Use a
   * different address"). A dormant binding resumes nothing and verifies
   * nothing, but it is still the binding of a live code: asking again for the
   * same address inside the reissue cooldown must wake it rather than replace
   * it with a nonce that matches nothing.
   */
  dormant?: boolean;
}

/** The two flows that bind a code to this browser; the backend shares one code between them. */
export type OtpFlow = "sign-in" | "reset";

function isBinding(value: unknown): value is OtpBinding {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { nonce, email } = value as Record<string, unknown>;
  return typeof nonce === "string" && nonce.length > 0 && typeof email === "string" && email.length > 0;
}

/**
 * Written on set AND on clear. A `__Host-` cookie must carry `Secure` and
 * `Path=/`, and a delete that omits them is refused by the browser — see
 * `clearBinding`. One object is what keeps the two from drifting apart.
 */
const BINDING_COOKIE_ATTRIBUTES = { httpOnly: true, sameSite: "lax", secure: true, path: "/" } as const;

/**
 * Addresses are normalized before they are bound, and compared normalized, so
 * the frontend's idea of "the same address" matches the backend's — it
 * normalizes server-side. Without this, typing `User@x.test` at step one and
 * letting a password manager fill `user@x.test` at step two would fail the
 * binding check and destroy a perfectly valid code.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Whether `binding` names a code for this address that the backend issued too
 * recently to issue another (`OTP_REISSUE_COOLDOWN_SECONDS`).
 *
 * In that window a new request would be answered 202 with no email and a
 * fresh nonce that matches nothing — writing it over this binding would leave
 * the user holding the one code they were sent and no way to verify it. The
 * request actions therefore keep the binding and skip the call. Reached by a
 * reload of /login (the sign-in flow starts over at step one) or a second tab,
 * which the in-page resend cooldown cannot see.
 *
 * A binding with no deadline (written before the field existed) is never
 * kept: its age is unknown, and a request then behaves as it always did.
 */
export function isWithinReissueCooldown(
  binding: OtpBinding | undefined,
  email: string,
  now: number = Date.now(),
): binding is OtpBinding & { expiresAt: number } {
  if (binding?.expiresAt === undefined) return false;
  if (binding.email !== normalizeEmail(email)) return false;
  const issuedAt = binding.expiresAt - MAX_AGE_SECONDS * 1000;
  return now - issuedAt < OTP_REISSUE_COOLDOWN_SECONDS * 1000;
}

async function setBinding(name: string, binding: OtpBinding): Promise<number> {
  // A fresh code lives the full TTL. A binding rewritten for the same code —
  // counted, put to sleep, woken, or copied from the other flow — keeps the
  // deadline of the code it names, never later than a fresh one would be.
  const now = Date.now();
  const fresh = now + MAX_AGE_SECONDS * 1000;
  const expiresAt = binding.expiresAt === undefined ? fresh : Math.min(binding.expiresAt, fresh);
  const maxAge = Math.max(1, Math.ceil((expiresAt - now) / 1000));
  const encoded = Buffer.from(
    JSON.stringify({
      nonce: binding.nonce,
      email: normalizeEmail(binding.email),
      // The code's deadline, so a flow resumed after a reload counts down from
      // what is actually left instead of restarting at the full TTL — which
      // showed "Expires in 4:59" for a code minutes into its life (UX-12). The
      // cookie's own maxAge IS that TTL, so the two cannot disagree.
      exp: expiresAt,
      ...(binding.fails ? { fails: binding.fails } : {}),
      ...(binding.dormant ? { dormant: true } : {}),
    }),
    "utf8",
  ).toString("base64url");
  const store = await cookies();
  store.set(name, encoded, { ...BINDING_COOKIE_ATTRIBUTES, maxAge });
  return expiresAt;
}

/** Writes the binding and returns the code's deadline (epoch ms). */
export function setOtpBinding(binding: OtpBinding): Promise<number> {
  return setBinding(OTP_NONCE_COOKIE, binding);
}

export function setPasswordResetBinding(binding: OtpBinding): Promise<number> {
  return setBinding(PWRESET_NONCE_COOKIE, binding);
}

/**
 * Reads the binding, or `undefined` when there is none.
 *
 * Total by construction: a missing, truncated, non-base64, non-JSON or
 * wrong-shaped cookie all resolve to `undefined` rather than throwing. The
 * caller treats `undefined` exactly as a mismatch — the "request a new code"
 * state — so a corrupted cookie can never surface as "wrong code" to someone
 * holding a correct one, and can never crash the sign-in callback.
 */
async function readBinding(
  name: string,
  { includeDormant = false }: { includeDormant?: boolean } = {},
): Promise<OtpBinding | undefined> {
  const store = await cookies();
  const raw = store.get(name)?.value;
  if (!raw) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!isBinding(parsed)) return undefined;
    const { exp, fails, dormant } = parsed as { exp?: unknown; fails?: unknown; dormant?: unknown };
    // A dormant binding is invisible to everything but the request step: it
    // must not resume a flow the user left, nor verify a code from it.
    if (dormant === true && !includeDormant) return undefined;
    return {
      nonce: parsed.nonce,
      email: parsed.email,
      ...(typeof exp === "number" && Number.isFinite(exp) ? { expiresAt: exp } : {}),
      ...(typeof fails === "number" && Number.isInteger(fails) && fails > 0 ? { fails } : {}),
      ...(dormant === true ? { dormant: true } : {}),
    };
  } catch {
    return undefined;
  }
}

export function readOtpBinding(): Promise<OtpBinding | undefined> {
  return readBinding(OTP_NONCE_COOKIE);
}

export function readPasswordResetBinding(): Promise<OtpBinding | undefined> {
  return readBinding(PWRESET_NONCE_COOKIE);
}

/**
 * Clears a binding — with the SAME attributes it was written with.
 *
 * `store.delete(name)` alone emits `name=; Path=/; Expires=1970…` with no
 * `Secure`, and a browser silently DISCARDS a `Set-Cookie` for a `__Host-`
 * cookie that lacks `Secure`. So every clear was a no-op: a verified sign-in
 * code's binding outlived its use, "Back to sign in" and a finished reset left
 * the reset binding behind, and the next visit to /login rehydrated into a flow
 * the user had left (found by QA on UX-2, v0.2.0-rc). Passing the attributes is
 * what makes the delete one the browser will apply.
 */
async function clearBinding(name: string): Promise<void> {
  const store = await cookies();
  store.delete({ name, ...BINDING_COOKIE_ATTRIBUTES });
}

export function clearOtpBinding(): Promise<void> {
  return clearBinding(OTP_NONCE_COOKIE);
}

export function clearPasswordResetBinding(): Promise<void> {
  return clearBinding(PWRESET_NONCE_COOKIE);
}

const COOKIE_OF: Record<OtpFlow, string> = { "sign-in": OTP_NONCE_COOKIE, reset: PWRESET_NONCE_COOKIE };

/**
 * Counts a refused code against the flow's binding. Called on the backend's
 * uniform 401 only: a 429 or an outage never reached the code.
 */
export async function recordRefusedCode(flow: OtpFlow): Promise<void> {
  const binding = await readBinding(COOKIE_OF[flow]);
  if (!binding) return;
  await setBinding(COOKIE_OF[flow], { ...binding, fails: (binding.fails ?? 0) + 1 });
}

/**
 * The user left step two. The binding is kept, asleep, instead of deleted:
 * deleted, a request for the same address inside the reissue cooldown went to
 * the backend, which answered 202 with no email and a nonce that matches
 * nothing — and the one code the user had stopped verifying (QA regress of
 * BUG-13: "Back to sign in", "Use a different address", "Change email", each
 * followed by asking again).
 */
export async function putBindingToSleep(flow: OtpFlow): Promise<void> {
  const binding = await readBinding(COOKIE_OF[flow], { includeDormant: true });
  if (!binding || binding.dormant) return;
  await setBinding(COOKIE_OF[flow], { ...binding, dormant: true });
}

/**
 * A code was redeemed. The backend keeps one code for both flows, so the
 * other flow's binding may name the same, now spent, code — both go.
 */
export async function clearAllBindings(): Promise<void> {
  await clearBinding(OTP_NONCE_COOKIE);
  await clearBinding(PWRESET_NONCE_COOKIE);
}

/**
 * `refused` is how many attempts the kept code has already lost, so the flow
 * resumes with the budget the backend actually has left, not a fresh five.
 */
export type ReissueDecision = { expiresAt: number; spent?: true; refused?: number } | undefined;

/**
 * The code-request step, for either flow: whether the backend can issue a
 * code for this address right now, and if not, which code the flow is bound to.
 *
 * The backend keeps ONE code per user for sign-in and password reset alike,
 * verifies it the same way for both, and while that code holds the slot it
 * answers a request 202 with no email and a nonce that matches nothing. It
 * holds the slot in two cases, and both are visible from this browser's two
 * bindings, awake or asleep, for the same address:
 *
 * - the code is burnt — `OTP_MAX_ATTEMPTS` refused, counted in the binding —
 *   until it expires: answered `spent`, so the flow says "in a few minutes"
 *   instead of promising an email (and a reload cannot forget it);
 * - the code is younger than the reissue cooldown: the flow is bound to it —
 *   its own binding woken, or the other flow's copied (BUG-14: sign-in code
 *   requested, then "Forgot password?" within the minute).
 *
 * `undefined` means ask the backend. Cooldowns in OTHER browsers are
 * invisible here; that gap is the backend's to close.
 */
export async function bindWithinReissueCooldown(flow: OtpFlow, email: string): Promise<ReissueDecision> {
  const other: OtpFlow = flow === "sign-in" ? "reset" : "sign-in";
  const own = await readBinding(COOKIE_OF[flow], { includeDormant: true });
  const sibling = await readBinding(COOKIE_OF[other], { includeDormant: true });
  const now = Date.now();
  const forThisAddress = (b: OtpBinding | undefined): b is OtpBinding & { expiresAt: number } =>
    b?.expiresAt !== undefined && b.email === normalizeEmail(email) && b.expiresAt > now;

  // The backend's budget is per code, not per flow: refusals are summed over
  // every binding naming the same code.
  const live = [own, sibling].filter(forThisAddress);
  const refusedOf = (nonce: string) =>
    live.filter((b) => b.nonce === nonce).reduce((n, b) => n + (b.fails ?? 0), 0);
  const kept = (expiresAt: number, nonce: string) => {
    const refused = refusedOf(nonce);
    return refused > 0 ? { expiresAt, refused } : { expiresAt };
  };

  for (const binding of live) {
    if (refusedOf(binding.nonce) >= OTP_MAX_ATTEMPTS) return { expiresAt: binding.expiresAt, spent: true };
  }
  if (isWithinReissueCooldown(own, email, now)) {
    if (own.dormant) await setBinding(COOKIE_OF[flow], { ...own, dormant: false });
    return kept(own.expiresAt, own.nonce);
  }
  if (isWithinReissueCooldown(sibling, email, now)) {
    // The copy starts at zero refusals: the sibling keeps counting its own,
    // and the sum above is what the backend sees.
    const expiresAt = await setBinding(COOKIE_OF[flow], { ...sibling, fails: undefined, dormant: false });
    return kept(expiresAt, sibling.nonce);
  }
  return undefined;
}
