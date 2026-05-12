import "next-auth";
import "next-auth/jwt";

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
