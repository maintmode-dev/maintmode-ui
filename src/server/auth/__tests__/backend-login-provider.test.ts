import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * RUK-288 AC-10 — the `backend-login` provider must be reachable.
 *
 * The `signIn` callback ends in `return false`, so an unregistered provider id
 * fails *silently*: for OTP that happens AFTER the backend has already consumed
 * and burnt the code, leaving the user with a generic error they cannot fix by
 * retrying, for up to five minutes. It would break 100% of OTP and password
 * sign-ins while every other test stayed green.
 *
 * Asserted against the source text rather than by booting NextAuth: importing
 * `auth-config` evaluates the real config at module load (it reads env and
 * builds the provider list), so a behavioural test here would assert more about
 * the harness than about the wiring. What must not regress is that the id is
 * registered AND branched on, and that is exactly what this reads.
 */

const source = readFileSync(join(process.cwd(), "src/server/auth/auth-config.ts"), "utf8");

describe("AC-10 — backend-login is wired into the signIn callback", () => {
  it("registers the provider under the id the sign-in actions call", () => {
    expect(source).toContain('const BACKEND_LOGIN_PROVIDER_ID = "backend-login"');
    expect(source).toMatch(/Credentials\(\{\s*id:\s*BACKEND_LOGIN_PROVIDER_ID/);
  });

  it("branches on that id in the signIn callback, before the catch-all rejection", () => {
    const branch = source.indexOf("account.provider === BACKEND_LOGIN_PROVIDER_ID");
    expect(branch).toBeGreaterThan(-1);

    // The branch has to come before the callback's FINAL `return false` — the
    // catch-all for unrecognised providers — or the provider is registered but
    // unreachable, which looks identical to working until a real sign-in
    // silently fails. (An earlier `return false` guards a missing `account`;
    // that one is not the catch-all.)
    const catchAll = source.lastIndexOf("return false;");
    expect(branch).toBeLessThan(catchAll);
  });

  it("does the exchange in the callback, not in authorize", () => {
    // `authorize` must stay a shape check. If it ever called the backend, a
    // single 6-digit code would be verified twice and the backend allows five
    // attempts before burning it.
    const authorizeStart = source.indexOf("async authorize(credentials)");
    const authorizeEnd = source.indexOf("}),\n);", authorizeStart);
    const authorizeBody = source.slice(authorizeStart, authorizeEnd);

    expect(authorizeBody).not.toContain("verifyOtpCode");
    expect(authorizeBody).not.toContain("loginWithPassword");
    expect(authorizeBody).not.toContain("fetchBackendMe");
  });
});
