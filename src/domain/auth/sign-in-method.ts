/**
 * Sign-in methods advertised by the backend's `GET /api/v1/auth/providers`.
 *
 * NOT `auth-method-settings.ts`, which models the admin-side flags behind
 * `GET /api/v1/auth/settings`. This file is the public listing `/login` renders
 * from; that one is what an admin switches on and off. Disabling a method there
 * removes it from here, which is what makes the two easy to confuse.
 *
 * Lives in `src/domain/**` rather than beside the backend client because the
 * browser-owned login component names this type, and `scripts/check-boundaries.mjs`
 * matches `import type` as well as value imports — a type under `src/server/**`
 * would be unimportable from `src/features/**` (RUK-288, SPEC §10a).
 *
 * `type` drives rendering, `id` is the stable machine key, `display_name` is the
 * human label. There is deliberately no icon field: the backend sends none.
 */
export type SignInMethodType = "password" | "code" | "redirect";

export interface SignInMethod {
  id: string;
  type: SignInMethodType;
  display_name: string;
}

const KNOWN_TYPES: ReadonlySet<string> = new Set<SignInMethodType>(["password", "code", "redirect"]);

/**
 * Narrows a wire `type` to the closed union. An unrecognised value is NOT
 * coerced to something renderable — the caller renders it as a disabled
 * placeholder, so a method this frontend does not understand can never be
 * presented as a working way in.
 */
export function isKnownSignInMethodType(value: string): value is SignInMethodType {
  return KNOWN_TYPES.has(value);
}

/**
 * The backend requires exactly six digits and allows only five attempts before
 * burning the code for the rest of its TTL. Rejecting a malformed value before
 * it reaches the wire means a typo cannot spend one of those attempts.
 *
 * Lives in `domain/` because both the client form and the server-side
 * `authorize` must agree on it; two copies of this rule would drift.
 */
export function isWellFormedOtpCode(value: string): boolean {
  return /^\d{6}$/.test(value.trim());
}

/**
 * The backend's password length policy, in BYTES (RUK-289).
 *
 * Bytes, not characters, and the distinction is not pedantic. The backend
 * validates with ozzo's `Length` rather than `RuneLength`, which measures Go's
 * `len()` — so "аброакадабра" is 12 characters but 24 bytes, and a 6-character
 * Cyrillic password is 12 bytes and passes. Measuring `.length` here would
 * diverge from the server for every non-ASCII password.
 */
export const PASSWORD_MIN_BYTES = 12;
export const PASSWORD_MAX_BYTES = 256;

/**
 * Whether a password satisfies the backend's policy, measured the way the
 * backend measures it.
 *
 * Duplicating a server-side rule on the client is usually a smell. Here it is
 * required: on the reset path a policy violation is collapsed into the same
 * 401 as a wrong code, so without this check a user with a short password is
 * told the code they just read off their screen is wrong. The maximum matters
 * for the same reason — an over-long password lands in that same collapse.
 *
 * This is a UX guard, never an authorization one. The backend re-checks.
 */
export function isPasswordWithinPolicy(password: string): boolean {
  const bytes = new TextEncoder().encode(password).length;
  return bytes >= PASSWORD_MIN_BYTES && bytes <= PASSWORD_MAX_BYTES;
}
