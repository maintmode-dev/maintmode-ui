import "server-only";

import { cookies } from "next/headers";

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
 * One cookie, not one per flow: a second tab overwrites the first, and the
 * first tab's code then fails with `otp_session_mismatch`, which renders the
 * honest "request a new code" state that exists for exactly this situation.
 */
export const OTP_NONCE_COOKIE = "__Host-mm.otp_nonce";

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
}

function isBinding(value: unknown): value is OtpBinding {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { nonce, email } = value as Record<string, unknown>;
  return typeof nonce === "string" && nonce.length > 0 && typeof email === "string" && email.length > 0;
}

export async function setOtpBinding(binding: OtpBinding): Promise<void> {
  const encoded = Buffer.from(JSON.stringify(binding), "utf8").toString("base64url");
  const store = await cookies();
  store.set(OTP_NONCE_COOKIE, encoded, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
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
export async function readOtpBinding(): Promise<OtpBinding | undefined> {
  const store = await cookies();
  const raw = store.get(OTP_NONCE_COOKIE)?.value;
  if (!raw) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    return isBinding(parsed) ? { nonce: parsed.nonce, email: parsed.email } : undefined;
  } catch {
    return undefined;
  }
}

export async function clearOtpBinding(): Promise<void> {
  const store = await cookies();
  store.delete(OTP_NONCE_COOKIE);
}
