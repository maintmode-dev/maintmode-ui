/**
 * Parse the "Keep me signed in" checkbox out of NextAuth credentials (RUK-290).
 *
 * Credentials cross the provider boundary as strings, so this one comparison
 * decides whether the user asked for a long session.
 *
 * **Fail closed: only the exact string `"true"` is a yes.** `Boolean("false")`
 * is `true`, so the obvious coercion would grant a long session to everyone who
 * deliberately unticked the box — and it would fail silently, on the side that
 * matters most, for users on shared computers.
 *
 * It lives in its own module, rather than beside `authorize` in
 * `auth-config.ts`, so that it can be tested by calling it. Importing
 * `auth-config` pulls in NextAuth, which fails outside the Next runtime, and
 * asserting on its source text instead does not actually work: a semantically
 * inverted `!(value === "true")` keeps the substring intact and passes. That
 * inversion — every unticked box granted a long session — is precisely the bug
 * this parser exists to prevent, so its test has to exercise behaviour.
 */
export function parseRememberMe(value: unknown): boolean {
  return value === "true";
}
