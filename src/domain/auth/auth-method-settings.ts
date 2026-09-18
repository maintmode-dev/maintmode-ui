/**
 * The built-in sign-in methods an admin can switch on and off (RUK-297).
 *
 * ## Not to be confused with `sign-in-method.ts`
 *
 * That file models the PUBLIC listing behind `/login`
 * (`GET /api/v1/auth/providers`: `id` / `type` / `display_name`). This one
 * models the ADMIN setting behind `/admin/auth-methods`
 * (`GET /api/v1/auth/settings`: `method` / `enabled` / `updated_at`).
 *
 * The two are causally linked — disabling a method here removes it from that
 * listing — which is exactly why they are easy to confuse, and why the names
 * are kept apart. Login providers (`oidc`, `github`) appear in neither: they
 * live in the integration registry with their own `enabled` flag.
 *
 * ## Why the labels live here
 *
 * `GET /api/v1/auth/settings` sends no `display_name` — the backend keeps its
 * own literals in `providers_list.go`. Label and closed set therefore sit in
 * one file, so adding a method cannot leave a row on an admin screen labelled
 * with a bare identifier.
 */

/**
 * One method as the admin screen holds it.
 *
 * `method` is a plain `string`, not `AuthMethodName`, for the same reason the
 * DTO is: a method this build has never heard of is still a sign-in path in
 * force, and the screen has to be able to hold it in order to show it.
 */
export interface AuthMethod {
  method: string;
  enabled: boolean;
  updated_at: string;
}

/** Every built-in method the backend seeds. `bootstrap` is deliberately absent:
 * it is the break-glass credential, always on and never listed. */
export const AUTH_METHODS = ["email_otp", "email_password"] as const;

export type AuthMethodName = (typeof AUTH_METHODS)[number];

const KNOWN: ReadonlySet<string> = new Set<AuthMethodName>(AUTH_METHODS);

/**
 * Whether this build knows the method.
 *
 * Used for LABELS, never as a gate. A method that fails this check is still
 * rendered and still togglable (SPEC §3.1): it is a sign-in path already in
 * force, and a screen that hid it would hide it from the one person
 * responsible for it.
 */
export function isKnownAuthMethod(value: string): value is AuthMethodName {
  return KNOWN.has(value);
}

const LABELS: Readonly<Record<AuthMethodName, string>> = {
  email_otp: "Email code",
  email_password: "Password",
};

/**
 * The human label, falling back to the raw name.
 *
 * The fallback is what makes rendering an unknown method possible at all. It
 * looks unpolished on purpose — a method this build has never heard of should
 * read as exactly that, not as something the screen understands.
 */
export function authMethodLabel(method: string): string {
  return isKnownAuthMethod(method) ? LABELS[method] : method;
}

const NOTES: Readonly<Partial<Record<AuthMethodName, string>>> = {
  /**
   * From the backend's security audit (SPEC §0.5.1). Turning this off closes
   * email codes as a way to SIGN IN; it does not stop the codes themselves,
   * because password reset sends them through the same issuer to the same
   * mailbox. An admin will not guess that, and the gap between "I disabled
   * email codes" and "my users still receive email codes" is exactly where
   * trust in the switch is lost.
   */
  email_otp: "Password reset still sends one-time codes to the same mailbox.",
};

/** The always-visible caveat for a method, when it has one. */
export function authMethodNote(method: string): string | undefined {
  return isKnownAuthMethod(method) ? NOTES[method] : undefined;
}
