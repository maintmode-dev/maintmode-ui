/**
 * Sign-in methods advertised by the backend's `GET /api/v1/auth/providers`.
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
