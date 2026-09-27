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
export type WireSignInMethodType = "password" | "code" | "redirect";

/**
 * The wire's three types plus `unsupported`, which the backend never sends: it
 * is what the resolver turns a type this build does not know into.
 *
 * It used to turn it into `redirect`, back when no provider was drawn from this
 * list and `redirect` rendered as an inert placeholder anyway. Now every login
 * row in the integration registry arrives as `redirect` and IS a live provider,
 * so the two must not share a spelling — or a method this build cannot handle
 * would be drawn as a working "Continue with …" button.
 */
export type SignInMethodType = WireSignInMethodType | "unsupported";

export interface SignInMethod {
  id: string;
  type: SignInMethodType;
  display_name: string;
}

const KNOWN_TYPES: ReadonlySet<string> = new Set<WireSignInMethodType>(["password", "code", "redirect"]);

/**
 * Narrows a wire `type` to the closed union. An unrecognised value is NOT
 * coerced to something renderable — the caller maps it to `unsupported` and
 * renders it as a disabled placeholder, so a method this frontend does not
 * understand can never be presented as a working way in.
 */
export function isKnownSignInMethodType(value: string): value is WireSignInMethodType {
  return KNOWN_TYPES.has(value);
}

/**
 * One wire entry of `GET /api/v1/auth/providers`, narrowed — or `null` when it
 * is malformed and must not be drawn at all (a nameless button).
 *
 * An unrecognised `type` is preserved, not dropped: the page renders it as a
 * disabled placeholder so a newly-advertised method is visible-but-inert rather
 * than silently missing. It becomes `unsupported`, never `redirect` — `redirect`
 * is a live provider button now (see `SignInMethodType`).
 *
 * The one parser for that endpoint: `/login` reads it through the server
 * resolver, the profile's linking card through the BFF, and two parsers of one
 * wire would drift.
 */
export function toSignInMethod(raw: unknown): SignInMethod | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const { id, type, display_name: displayName } = raw as Record<string, unknown>;
  if (typeof id !== "string" || typeof type !== "string" || typeof displayName !== "string") {
    return null;
  }
  return {
    id,
    type: isKnownSignInMethodType(type) ? type : "unsupported",
    display_name: displayName,
  };
}

/**
 * The sign-in providers to offer: every advertised `redirect` method, in the
 * backend's order.
 *
 * Each one is a login row in the backend's integration registry, and all of
 * them start the same backend-owned dance (`/start/{id}`), so nothing here is
 * provider-specific — a `custom` OIDC provider and GitHub are drawn exactly as
 * Google is. An earlier build knew providers by id, which left every row it had
 * not heard of (`custom` included) as a disabled "coming soon" button.
 *
 * `undefined` means the list could not be READ, which is no evidence that any
 * provider is missing — see `FALLBACK_PROVIDERS`.
 */
export function signInProviders(methods: SignInMethod[] | undefined): SignInMethod[] {
  if (methods === undefined) return FALLBACK_PROVIDERS;
  return methods.filter((m) => m.type === "redirect");
}

/**
 * What to offer when the providers fetch failed at the transport level.
 *
 * Google alone, because it is the one provider the product has always offered
 * and the one most instances configure; suppressing every button here would
 * remove a working way in exactly when the auth service is degraded. A provider
 * this guesses wrong about answers with an error before any state is minted, so
 * the cost of a wrong guess is one failed click, not a spent invitation.
 */
const FALLBACK_PROVIDERS: SignInMethod[] = [{ id: "google", type: "redirect", display_name: "Google" }];

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
