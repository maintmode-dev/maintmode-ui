import "server-only";

import { isRole } from "@/domain/auth/permissions";
import { isWellFormedOtpCode } from "@/domain/auth/sign-in-method";
import { exchangeGoogleIdToken, fetchBackendMe } from "@/server/auth/backend-token-exchange";
import { BuiltInSignInError, runBuiltInSignIn } from "@/server/auth/built-in-sign-in";
import {
  AUTH_ERROR_CODES,
  BackendAuthError,
  type AuthSessionUser,
  type BackendTokenPair,
} from "@/server/auth/contracts";
import { DEV_BYPASS_ENABLED } from "@/server/auth/dev-bypass";
import { OAuthDanceError, runDanceRedemption } from "@/server/auth/oauth-dance-redemption";
import { establishSession } from "@/server/auth/session-token";

/**
 * Establishing a session — the part of sign-in that used to run inside Auth.js
 * (its Credentials providers' `authorize` and the `signIn`/`jwt` callbacks).
 *
 * Each function validates the shape of what it was given, runs the backend
 * exchange, and writes the session cookie. It does NOT redirect: the calling
 * server action decides where the browser goes, so success and failure are
 * both ordinary control flow instead of a thrown `NEXT_REDIRECT` that every
 * caller had to tell apart from an error.
 *
 * Failures throw `SignInError` with a code from `AUTH_ERROR_CODES` (or
 * `"credentials"` for input that never reached the backend), read structurally
 * as `.code` by the actions — the same shape `CredentialsSignin` had, so their
 * error mapping is unchanged.
 */
export class SignInError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "SignInError";
    this.code = code;
  }
}

/** Input that never reached the backend: the actions map it to their flow's generic failure. */
const MALFORMED = "credentials";

type Account = { maintmodeTokens?: BackendTokenPair; maintmodeUser?: AuthSessionUser };

export type BackendLoginCredentials = {
  kind: string;
  email?: string;
  code?: string;
  password?: string;
  invitation?: string;
};

/**
 * Built-in sign-in: email code, email + password, accepting an invitation with
 * a password, break-glass. Shape checks first, so a malformed code never
 * spends one of the backend's five attempts.
 */
export async function signInWithBackendLogin(credentials: BackendLoginCredentials): Promise<void> {
  const account: Account = {};
  try {
    await runBuiltInSignIn(account, builtInUser(credentials));
  } catch (error) {
    if (error instanceof BuiltInSignInError) throw new SignInError(error.code);
    throw error;
  }
  await startSession(account);
}

function builtInUser(credentials: BackendLoginCredentials) {
  const password = credentials.password ?? "";

  // Accepting an invitation by setting a password. No email: the backend takes
  // the address from the invitation.
  if (credentials.kind === "invite") {
    const invitationToken = credentials.invitation ?? "";
    if (!invitationToken || !password) throw new SignInError(MALFORMED);
    return { signInKind: "invite" as const, invitationToken, password };
  }

  // Break-glass signs in by password alone: a fixed service identity.
  if (credentials.kind === "break-glass") {
    if (!password) throw new SignInError(MALFORMED);
    return { signInKind: "break-glass" as const, password };
  }

  const email = (credentials.email ?? "").trim();
  if (!email) throw new SignInError(MALFORMED);

  if (credentials.kind === "otp") {
    const code = (credentials.code ?? "").trim();
    // Shared with the client form so the two cannot drift.
    if (!isWellFormedOtpCode(code)) throw new SignInError(MALFORMED);
    return { signInKind: "otp" as const, email, otpCode: code };
  }

  if (credentials.kind === "password") {
    if (!password) throw new SignInError(MALFORMED);
    return { signInKind: "password" as const, email, password };
  }

  throw new SignInError(MALFORMED);
}

/**
 * Redeems the one-time code the backend's OAuth dance came back with (RUK-292),
 * with this browser's binding nonce as proof (backend L1).
 */
export async function signInWithDanceCode(code: string, proof: string): Promise<void> {
  if (!code.trim() || !proof) throw new SignInError(AUTH_ERROR_CODES.oauthHandoffFailed);
  const account: Account = {};
  try {
    await runDanceRedemption(account, code.trim(), proof);
  } catch (error) {
    if (error instanceof OAuthDanceError) throw new SignInError(error.code);
    throw error;
  }
  await startSession(account);
}

/**
 * Dev-only "Login as {role}". The backend's stub exchange accepts the literal
 * id_token "dev-bypass" and, given `X-Test-Roles`, mints a fresh user with that
 * role. Refused outright unless the bypass is on, which it never is in a
 * production build (`parseMaintmodeAuthConfig`).
 */
export async function signInWithDevBypass(role: string): Promise<void> {
  if (!DEV_BYPASS_ENABLED || !isRole(role)) throw new SignInError(MALFORMED);

  // The exchange and the profile load are caught separately so the failure is
  // attributed to the stage that actually failed.
  let tokens: BackendTokenPair;
  try {
    tokens = await exchangeGoogleIdToken("dev-bypass", role);
  } catch (error) {
    // Signup closed (403 `signup_disabled`): surfaced distinctly so /login can
    // tell the user an invitation is required.
    throw new SignInError(
      backendErrorCode(error) === "signup_disabled"
        ? AUTH_ERROR_CODES.signupDisabled
        : AUTH_ERROR_CODES.oauthHandoffFailed,
    );
  }

  const account: Account = {};
  try {
    const me = await fetchBackendMe(tokens.access_token);
    account.maintmodeTokens = tokens;
    account.maintmodeUser = { id: me.id, email: me.email, displayName: me.display_name, roles: me.roles };
  } catch {
    throw new SignInError(AUTH_ERROR_CODES.identityLookupFailed);
  }
  await startSession(account);
}

/**
 * Writes the session the exchange produced. A pair that cannot sustain one —
 * no refresh token, no expiry — is refused here instead of yielding a session
 * that dies at its first rotation; the user is told the sign-in did not
 * complete rather than being bounced between `/` and `/login`.
 */
async function startSession(account: Account): Promise<void> {
  if (!account.maintmodeTokens || !account.maintmodeUser) {
    throw new SignInError(AUTH_ERROR_CODES.identityLookupFailed);
  }
  try {
    await establishSession(account.maintmodeTokens, account.maintmodeUser);
  } catch {
    throw new SignInError(AUTH_ERROR_CODES.identityLookupFailed);
  }
}

/** The backend's error `code` from a `BackendAuthError` body, when it has one. */
function backendErrorCode(error: unknown): string | undefined {
  if (!(error instanceof BackendAuthError)) return undefined;
  try {
    const parsed = JSON.parse(error.responseBody) as { code?: unknown };
    return typeof parsed.code === "string" ? parsed.code : undefined;
  } catch {
    return undefined;
  }
}
