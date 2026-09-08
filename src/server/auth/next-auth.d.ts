import "next-auth";
import "next-auth/jwt";

import type { Role } from "@/domain/auth/permissions";
import type { AuthSessionUser, BackendTokenPair } from "@/server/auth/contracts";

/**
 * Module augmentation for NextAuth so the rest of the codebase can read
 * `session.user.{id,displayName,roles}`, `session.error`, and the
 * server-only token fields on the JWT without `as` casts.
 */

declare module "next-auth" {
  interface Session {
    error?: string;
    user: AuthSessionUser & {
      name?: string | null;
      image?: string | null;
    };
  }

  interface Account {
    /**
     * Set by our `signIn` callback after a successful backend exchange.
     * Carried over to the `jwt` callback's `account` argument; never
     * exposed to the browser.
     */
    maintmodeTokens?: BackendTokenPair;
    maintmodeUser?: AuthSessionUser;
  }

  interface User {
    /**
     * Dev-only. The role chosen in the "Login as {role}" block, returned from
     * the dev-bypass provider's `authorize` and read by the `signIn` callback
     * to seed `X-Test-Roles`. Absent for every real (Google) login. Typed as
     * `Role` (not `string`) so the validated-in-`authorize` invariant is
     * structural — any future writer must supply a valid role.
     */
    role?: Role;
    /**
     * Built-in sign-in (RUK-288). Returned from the `backend-login` provider's
     * `authorize` and read by the `signIn` callback, which performs the actual
     * backend exchange.
     *
     * Carried on the user object rather than read from the callback's
     * `credentials` argument, which is typed `Record<string, CredentialInput>`
     * and would need a cast. This mirrors how `role` reaches the callback for
     * dev-bypass, keeping the "validated in `authorize`" invariant structural.
     *
     * These are inputs to the exchange, never tokens: no secret material and
     * nothing derived from a session lives here, and none of it reaches the
     * browser.
     */
    signInKind?: "otp" | "password";
    email?: string | null;
    otpCode?: string;
    password?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpiresAt?: number;
    user?: AuthSessionUser;
    error?: string;
  }
}
