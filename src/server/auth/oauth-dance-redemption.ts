import "server-only";

import { fetchBackendMe, redeemOAuthDanceCode } from "@/server/auth/backend-token-exchange";
import {
  AUTH_ERROR_CODES,
  BackendAuthError,
  type AuthErrorCode,
  type AuthSessionUser,
  type BackendTokenPair,
} from "@/server/auth/contracts";

/**
 * Typed failure, rewrapped into NextAuth's `CredentialsSignin` by the caller.
 *
 * Thrown rather than returned, and defined here rather than imported, for the
 * reason `built-in-sign-in.ts` gives for its own: this module must not import
 * NextAuth, or its runtime is pulled into everything that touches a redemption.
 */
export class OAuthDanceError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode) {
    super(code);
    this.name = "OAuthDanceError";
    this.code = code;
  }
}

/**
 * Trades the one-time dance code for a session (RUK-292).
 *
 * Extracted from the `signIn` callback rather than left inline, exactly as
 * `runBuiltInSignIn` was: inline, the only thing that could test it was a
 * source-text assertion, and a mutation deleting the `maintmodeUser` assignment
 * passed the whole suite while leaving every user with a session carrying no
 * id, no email and no roles — a failure that surfaces at the first role gate,
 * nowhere near here.
 *
 * Two stages caught separately, following the split `runBackendExchange`
 * carries: collapsing them mislabels every redemption failure as an
 * identity-lookup failure, which is the defect that split them there.
 *
 * The redemption stage cannot distinguish its own failures — the backend
 * answers a uniform 401 for unknown, expired, spent and malformed codes on
 * purpose, and a 429 from a limiter bucket it shares with password sign-in, OTP
 * and invitations. All of them are one thing to the user: the handoff did not
 * complete. The STATUS is logged so an operator can still tell a rate limit from
 * a dead code.
 */
export async function runDanceRedemption(
  account: { maintmodeTokens?: BackendTokenPair; maintmodeUser?: AuthSessionUser },
  code: string,
): Promise<true> {
  let tokens: BackendTokenPair;
  try {
    tokens = await redeemOAuthDanceCode(code);
  } catch (error) {
    // Logged, not surfaced. A spent code and a shared-bucket rate limit are
    // indistinguishable to the user and must stay that way, but an operator
    // debugging "sign-in is broken" has nothing else: a failure at `/start`
    // never reaches this process, being a browser navigation.
    console.error("oauth dance code redemption failed", {
      status: error instanceof BackendAuthError ? error.status : undefined,
    });
    throw new OAuthDanceError(AUTH_ERROR_CODES.oauthHandoffFailed);
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
    // Redemption succeeded but the profile load did not: the one genuine
    // identity-lookup failure.
    throw new OAuthDanceError(AUTH_ERROR_CODES.identityLookupFailed);
  }
}
