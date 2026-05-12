import "server-only";

import NextAuth, { type NextAuthConfig, CredentialsSignin } from "next-auth";
import Google from "next-auth/providers/google";
import type { JWT } from "next-auth/jwt";

import { parseMaintmodeAuthConfig, type MaintmodeAuthConfig } from "@/shared/config/auth-config";
import {
  exchangeGoogleIdToken,
  fetchBackendMe,
  refreshBackendToken,
} from "@/server/auth/backend-token-exchange";
import {
  AUTH_ERROR_CODES,
  type AuthSessionUser,
  type BackendTokenPair,
} from "@/server/auth/contracts";

const REFRESH_LEEWAY_MS = 60_000;

let cachedAuthConfig: MaintmodeAuthConfig | null = null;
function getAuthConfig(): MaintmodeAuthConfig {
  if (!cachedAuthConfig) {
    cachedAuthConfig = parseMaintmodeAuthConfig(process.env);
  }
  return cachedAuthConfig;
}

const authConfig = getAuthConfig();

/**
 * Typed sign-in failure. NextAuth maps `CredentialsSignin.code` to
 * `?code=<code>` on the configured `pages.error` URL, so the login page can
 * render a precise message instead of the generic "AccessDenied".
 *
 * NOTE: NextAuth always also sets `?error=CredentialsSignin`. The login
 * page must read `?code=` first and fall back to `?error=`.
 */
class BackendExchangeError extends CredentialsSignin {
  constructor(code: (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES]) {
    super(code);
    this.code = code;
  }
}

export const config = {
  secret: authConfig.authSecret,
  trustHost: true, // self-host: nginx must enforce the Host header.
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Google({
      clientId: authConfig.googleClientId,
      clientSecret: authConfig.googleClientSecret,
      authorization: { params: { prompt: "select_account", access_type: "offline" } },
    }),
  ],
  callbacks: {
    async signIn({ account }) {
      if (!account || account.provider !== "google") {
        return false;
      }
      const idToken = typeof account.id_token === "string" ? account.id_token : undefined;
      if (!idToken) {
        throw new BackendExchangeError(AUTH_ERROR_CODES.invalidIdToken);
      }
      try {
        const tokens = await exchangeGoogleIdToken(idToken);
        const me = await fetchBackendMe(tokens.access_token);
        account.maintmodeTokens = tokens;
        account.maintmodeUser = {
          id: me.id,
          email: me.email,
          displayName: me.display_name,
          roles: me.roles,
        };
        return true;
      } catch (error) {
        // Tag the failure with a stable code so `/login?error=...` shows a
        // precise message. Backend response bodies stay out of telemetry.
        const code = isIdentityLookupError(error)
          ? AUTH_ERROR_CODES.identityLookupFailed
          : AUTH_ERROR_CODES.oauthHandoffFailed;
        throw new BackendExchangeError(code);
      }
    },
    async jwt({ token, account }) {
      // First call after a successful `signIn` carries the freshly enriched
      // account.  Persist backend tokens + user identity on the JWT.
      if (account?.maintmodeTokens && account.maintmodeUser) {
        return enrichTokenWithPair(token, account.maintmodeTokens, account.maintmodeUser);
      }

      // Subsequent calls: refresh the backend access token before it
      // expires.  A failure marks the session for forced re-login.
      const expiresAt = readNumber(token.accessTokenExpiresAt);
      if (!expiresAt || Date.now() < expiresAt - REFRESH_LEEWAY_MS) {
        return token;
      }
      const refreshToken = readString(token.refreshToken);
      if (!refreshToken) {
        return { ...token, error: "RefreshAccessTokenError" };
      }
      try {
        const refreshed = await refreshBackendToken(refreshToken);
        const user = token.user ?? null;
        if (!user) {
          return { ...token, error: "RefreshAccessTokenError" };
        }
        return enrichTokenWithPair(token, refreshed, user);
      } catch {
        return { ...token, error: "RefreshAccessTokenError" };
      }
    },
    async session({ session, token }) {
      if (token.error) {
        session.error = token.error;
      }
      if (token.user) {
        session.user = {
          ...session.user,
          id: token.user.id,
          email: token.user.email,
          displayName: token.user.displayName,
          roles: token.user.roles,
        };
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(config);

function enrichTokenWithPair(token: JWT, pair: BackendTokenPair, user: AuthSessionUser): JWT {
  const expiresIn =
    typeof pair.expires_in === "number" && Number.isFinite(pair.expires_in) && pair.expires_in > 0
      ? pair.expires_in
      : 0;
  if (!expiresIn) {
    return { ...token, error: "RefreshAccessTokenError" };
  }
  return {
    ...token,
    accessToken: pair.access_token,
    refreshToken: pair.refresh_token,
    accessTokenExpiresAt: Date.now() + expiresIn * 1000,
    user,
    error: undefined,
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isIdentityLookupError(error: unknown): boolean {
  // BackendAuthError thrown by `fetchBackendMe` after a successful
  // `exchangeGoogleIdToken` is treated as an identity-lookup problem; all
  // other failures map to the generic OAuth-handoff code.
  if (error && typeof error === "object" && "name" in error) {
    return (error as { name: unknown }).name === "BackendAuthError";
  }
  return false;
}
