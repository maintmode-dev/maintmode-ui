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
import { isRole } from "@/domain/auth/permissions";
import { BuiltInSignInError, runBuiltInSignIn } from "@/server/auth/built-in-sign-in";
import {
  AUTH_ERROR_CODES,
  BackendAuthError,
  type AuthErrorCode,
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

/**
 * Built-in sign-in — email OTP and email+password (RUK-288).
 *
 * A Credentials provider rather than a BFF route because the session must be
 * established through NextAuth's jwt cookie: no route in this app forwards a
 * backend `Set-Cookie`, and the backend's contract is a JSON token pair. Doing
 * the exchange here means the tokens are born inside NextAuth and never cross a
 * route boundary, so "the browser never sees a token" holds by construction.
 */
const BACKEND_LOGIN_PROVIDER_ID = "backend-login";

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

providers.push(
  Credentials({
    id: BACKEND_LOGIN_PROVIDER_ID,
    name: "Email sign-in",
    credentials: { kind: {}, email: {}, code: {}, password: {} },
    /**
     * Shape validation ONLY — deliberately no network call. The exchange lives
     * in the `signIn` callback so the backend call and its error mapping stay in
     * one place, exactly as the dev-bypass provider defers to
     * `runBackendExchange`. Splitting them would mean verifying a 6-digit code
     * twice, and the backend allows five attempts per code before burning it.
     */
    async authorize(credentials) {
      const kind = typeof credentials?.kind === "string" ? credentials.kind : "";
      const email = typeof credentials?.email === "string" ? credentials.email.trim() : "";
      if (!email) {
        return null;
      }

      if (kind === "otp") {
        const code = typeof credentials?.code === "string" ? credentials.code.trim() : "";
        // The backend requires exactly six digits; rejecting anything else here
        // avoids spending one of the five attempts on a value that cannot win.
        if (!/^\d{6}$/.test(code)) {
          return null;
        }
        return { id: BACKEND_LOGIN_PROVIDER_ID, signInKind: "otp" as const, email, otpCode: code };
      }

      if (kind === "password") {
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!password) {
          return null;
        }
        return { id: BACKEND_LOGIN_PROVIDER_ID, signInKind: "password" as const, email, password };
      }

      return null;
    },
  }),
);

if (authConfig.devAuthBypassEnabled) {
  providers.push(
    Credentials({
      id: DEV_BYPASS_PROVIDER_ID,
      name: "Dev bypass",
      // The dev "Login as {role}" block posts the chosen role here; it seeds the
      // backend `X-Test-Roles` header so the stub OAuth creates a fresh user
      // with that role. Registered only under `devAuthBypassEnabled`.
      credentials: { role: {} },
      async authorize(credentials) {
        // Reject anything but the four assignable roles before it reaches the
        // backend (which would 400 on an unknown role). An absent/invalid role
        // fails the sign-in rather than silently logging in role-less.
        const role = typeof credentials?.role === "string" ? credentials.role : "";
        if (!isRole(role)) {
          return null;
        }
        // Defer the actual backend exchange to the signIn callback so the logic
        // (and error mapping) lives in one place. Carrying `role` on the
        // returned user hands it to that callback.
        return { id: "dev-bypass", role };
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
    async signIn({ account, user }) {
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
        // auditable in backend logs. `authorize` already validated the role, so
        // it seeds `X-Test-Roles` and the stub backend creates a fresh user
        // with it.
        const role = typeof user?.role === "string" ? user.role : "";
        return runBackendExchange(account, "dev-bypass", role);
      }
      if (account.provider === BACKEND_LOGIN_PROVIDER_ID) {
        try {
          return await runBuiltInSignIn(account, user);
        } catch (error) {
          // `built-in-sign-in.ts` deliberately does not import NextAuth, so its
          // failures arrive as a plain error and are rewrapped here. Without
          // this, the code would not reach `/login` as `?code=` and every
          // built-in sign-in failure would read as a generic one.
          if (error instanceof BuiltInSignInError) {
            throw new BackendExchangeError(error.code as AuthErrorCode);
          }
          throw error;
        }
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
  // Dev-only: the role picked in the "Login as" block, seeded onto the new user
  // via `X-Test-Roles`. Empty for real Google logins (no header sent). Only the
  // dev-bypass branch, gated by `devAuthBypassEnabled`, ever passes a value.
  testRoles = "",
): Promise<true> {
  // The exchange and the profile load are caught separately so the failure is
  // attributed to the stage that actually failed. Collapsing them into one
  // catch (and keying `identity_lookup_failed` off `error.name ===
  // "BackendAuthError"`) mislabeled every exchange-stage failure — e.g. a 403
  // `seats_limit_exceeded`, raised before `/me` is ever called — as an
  // identity-lookup failure.
  let tokens: BackendTokenPair;
  try {
    tokens = await exchangeGoogleIdToken(idToken, testRoles);
  } catch (error) {
    // Signup closed (403 `signup_disabled`): surfaced distinctly so /login can
    // tell the user an invitation is required, instead of the generic failure.
    if (backendErrorCode(error) === "signup_disabled") {
      throw new BackendExchangeError(AUTH_ERROR_CODES.signupDisabled);
    }
    // Any other exchange failure (network, 4xx/5xx, seat cap, bad payload) is
    // an OAuth-handoff problem — identity lookup never ran.
    throw new BackendExchangeError(AUTH_ERROR_CODES.oauthHandoffFailed);
  }

  try {
    const me = await fetchBackendMe(tokens.access_token);
    account.maintmodeTokens = tokens;
    account.maintmodeUser = {
      id: me.id,
      email: me.email,
      displayName: me.display_name,
      roles: me.roles,
    };
    return true;
  } catch {
    // Exchange succeeded but loading the profile did not: the one genuine
    // identity-lookup failure.
    throw new BackendExchangeError(AUTH_ERROR_CODES.identityLookupFailed);
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
  // Same stage-split as `runBackendExchange`: the accept exchange and the
  // profile load are caught separately so an accept-stage failure is never
  // mislabeled as an identity-lookup failure.
  let tokens: BackendTokenPair;
  try {
    tokens = await acceptInvitation({ invitationToken, provider: "google", idToken });
  } catch (error) {
    // `email_mismatch` is the one accept failure surfaced distinctly: the
    // signed-in account isn't the invited one (a fact about the user's own
    // account, not the invitation). Every other accept failure stays generic
    // so nothing about the invitation leaks (anti-enumeration).
    if (backendErrorCode(error) === "email_mismatch") {
      throw new BackendExchangeError(AUTH_ERROR_CODES.emailMismatch);
    }
    throw new BackendExchangeError(AUTH_ERROR_CODES.oauthHandoffFailed);
  }

  try {
    const me = await fetchBackendMe(tokens.access_token);
    account.maintmodeTokens = tokens;
    account.maintmodeUser = {
      id: me.id,
      email: me.email,
      displayName: me.display_name,
      roles: me.roles,
    };
    return true;
  } catch {
    // Accept succeeded but loading the profile did not: the one genuine
    // identity-lookup failure.
    throw new BackendExchangeError(AUTH_ERROR_CODES.identityLookupFailed);
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
