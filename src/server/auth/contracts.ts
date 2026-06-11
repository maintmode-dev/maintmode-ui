/**
 * Server-side auth contracts.
 *
 * These types model the production-ready backend OAuth contract finalized in RUK-34
 * (`docs/swagger.yaml`: `apiauthmodels.OAuthCallbackJSONResponse`,
 * `apiauthmodels.TokenPairResponse`, `apiauthmodels.MeResponse`). They are used only
 * inside `src/server/auth/**` and `src/app/api/auth/**`; browser code must not import them.
 */

export type BackendTokenPair = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

export type BackendOAuthCallbackJsonResponse = {
  token: BackendTokenPair;
  original_uri?: string;
};

export type BackendMeResponse = {
  id: string;
  email: string;
  display_name: string;
  oauth_provider: string;
  roles: string[];
};

export type AuthSessionUser = {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
};

export type AuthSessionTokens = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
};

export class BackendAuthError extends Error {
  constructor(
    readonly status: number,
    readonly responseBody: string,
    message?: string,
  ) {
    super(message ?? `Backend auth request failed with status ${status}`);
    this.name = "BackendAuthError";
  }
}

/**
 * Stable `error` codes the frontend uses on `/login?error=...` URLs after a
 * failed sign-in. Keep this enum in sync with the messages map in
 * `src/app/(auth)/login/page.tsx`.
 */
export const AUTH_ERROR_CODES = {
  oauthHandoffFailed: "oauth_handoff_failed",
  identityLookupFailed: "identity_lookup_failed",
  invalidIdToken: "invalid_id_token",
  sessionCreationFailed: "session_creation_failed",
  // Accept-invite only: the signed-in Google account's email differs from the
  // invited email. Surfaced distinctly (not the generic code) because it's a
  // fact about the user's OWN account, not about the invitation — so it leaks
  // nothing and lets the UI say "wrong account". Other accept failures stay
  // generic for anti-enumeration.
  emailMismatch: "email_mismatch",
} as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];
