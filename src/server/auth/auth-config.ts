import "server-only";

import NextAuth, { type NextAuthConfig, CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import type { JWT } from "next-auth/jwt";

import { parseMaintmodeAuthConfig, type MaintmodeAuthConfig } from "@/shared/config/auth-config";
import {
  acceptInvitation,
  exchangeGoogleIdToken,
  fetchBackendMe,
  refreshBackendToken,
} from "@/server/auth/backend-token-exchange";
import { clearInvitationToken, readInvitationToken } from "@/server/auth/invitation-cookie";
import {
  AUTH_ERROR_CODES,
  BackendAuthError,
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

const DEV_BYPASS_PROVIDER_ID = "dev-bypass";

// Auth providers are resolved ONCE at module load. `devAuthBypassEnabled`
// already encodes the prod-safety decision (see parseMaintmodeAuthConfig:
// it returns false when NODE_ENV === "production"). No further runtime
// checks below — if the provider is registered, the bypass is on.
const providers: NextAuthConfig["providers"] = [
  Google({
    clientId: authConfig.googleClientId,
    clientSecret: authConfig.googleClientSecret,
    authorization: { params: { prompt: "select_account", access_type: "offline" } },
  }),
];

if (authConfig.devAuthBypassEnabled) {
  providers.push(
    Credentials({
      id: DEV_BYPASS_PROVIDER_ID,
      name: "Dev bypass",
      credentials: {},
      async authorize() {
        // Defer the actual backend exchange to the signIn callback so the
        // logic (and error mapping) lives in one place. We just need to
        // return a non-null user here for NextAuth to proceed.
        return { id: "dev-bypass" };
      },
    }),
  );
}

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
  providers,
  callbacks: {
    async signIn({ account }) {
      if (!account) {
        return false;
      }
      if (account.provider === "google") {
        const idToken = typeof account.id_token === "string" ? account.id_token : undefined;
        if (!idToken) {
          throw new BackendExchangeError(AUTH_ERROR_CODES.invalidIdToken);
        }
        // Public accept-invite flow: when an invitation token is
        // pending in the httpOnly cookie, this sign-in is claiming an invite,
        // not a normal login. Consume the cookie (single-use) and exchange via
        // the backend accept endpoint instead of the plain login exchange.
        const invitationToken = await readInvitationToken();
        if (invitationToken) {
          await clearInvitationToken();
          return runInvitationAccept(account, invitationToken, idToken);
        }
        return runBackendExchange(account, idToken);
      }
      if (account.provider === DEV_BYPASS_PROVIDER_ID) {
        // Provider is only registered in non-prod (see providers list above),
        // so reaching this branch implies the bypass is active. Backend in
        // non-prod accepts any id_token; the placeholder makes the bypass
        // auditable in backend logs.
        return runBackendExchange(account, "dev-bypass");
      }
      return false;
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

/**
 * Single source of truth for the dev-bypass flow. Resolved at module load
 * from env + NODE_ENV (see `parseMaintmodeAuthConfig`). Consumers (login
 * page, tests) should read this value, never re-derive from env.
 */
export const DEV_BYPASS_ENABLED = authConfig.devAuthBypassEnabled;

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

async function runBackendExchange(
  account: { maintmodeTokens?: BackendTokenPair; maintmodeUser?: AuthSessionUser },
  idToken: string,
): Promise<true> {
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
    const code = isIdentityLookupError(error)
      ? AUTH_ERROR_CODES.identityLookupFailed
      : AUTH_ERROR_CODES.oauthHandoffFailed;
    throw new BackendExchangeError(code);
  }
}

/**
 * Accept-invite counterpart of `runBackendExchange`. Trades the
 * invitation token + provider `id_token` for a backend token pair via the
 * public accept endpoint, then loads the freshly-created user's profile. The
 * resulting tokens are attached to the NextAuth account exactly like a normal
 * login, so the rest of the session machinery is unchanged — and the tokens
 * stay server-side.
 *
 * Every failure (invalid/expired/revoked invitation, email mismatch, OAuth
 * verify failure) collapses to a single sign-in error code; the backend
 * already strips detail, so nothing about the invitation leaks to `/login`.
 */
async function runInvitationAccept(
  account: { maintmodeTokens?: BackendTokenPair; maintmodeUser?: AuthSessionUser },
  invitationToken: string,
  idToken: string,
): Promise<true> {
  try {
    const tokens = await acceptInvitation({ invitationToken, provider: "google", idToken });
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
    // `email_mismatch` is the one accept failure surfaced distinctly: the
    // signed-in account isn't the invited one (a fact about the user's own
    // account, not the invitation). Every other accept failure stays generic
    // so nothing about the invitation leaks (anti-enumeration).
    if (backendErrorCode(error) === "email_mismatch") {
      throw new BackendExchangeError(AUTH_ERROR_CODES.emailMismatch);
    }
    const code = isIdentityLookupError(error)
      ? AUTH_ERROR_CODES.identityLookupFailed
      : AUTH_ERROR_CODES.oauthHandoffFailed;
    throw new BackendExchangeError(code);
  }
}

/**
 * Best-effort extraction of the backend error `code` from a `BackendAuthError`
 * (whose `responseBody` carries the raw `{ code, message }` JSON). Returns
 * undefined when the error isn't a BackendAuthError or the body isn't parseable.
 */
function backendErrorCode(error: unknown): string | undefined {
  if (!(error instanceof BackendAuthError)) return undefined;
  try {
    const parsed = JSON.parse(error.responseBody) as { code?: unknown };
    return typeof parsed.code === "string" ? parsed.code : undefined;
  } catch {
    return undefined;
  }
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
