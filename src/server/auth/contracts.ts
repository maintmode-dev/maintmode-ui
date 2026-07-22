/**
 * Server-side auth contracts.
 *
 * These types model the production-ready backend OAuth contract
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
 * Stable codes the frontend surfaces on `/login` after a failed sign-in. The
 * server page (`src/app/login/page.tsx`) reads `?code=` (falling back to
 * `?error=`) and the messages map lives in
 * `src/features/auth/login-page.tsx`. Keep this enum in sync with that map.
 */
export const AUTH_ERROR_CODES = {
  oauthHandoffFailed: "oauth_handoff_failed",
  identityLookupFailed: "identity_lookup_failed",
  invalidIdToken: "invalid_id_token",
  sessionCreationFailed: "session_creation_failed",
  // Login exchange only: the backend rejected sign-in because signup is closed
  // (HTTP 403, code `signup_disabled`) — the account isn't invited and open
  // signup is off. Surfaced distinctly so /login can say "invitation required"
  // instead of the generic failure. Leaks nothing: it's the same answer for any
  // uninvited account, invited-or-not.
  signupDisabled: "signup_disabled",
  // Accept-invite only: the signed-in Google account's email differs from the
  // invited email. Surfaced distinctly (not the generic code) because it's a
  // fact about the user's OWN account, not about the invitation — so it leaks
  // nothing and lets the UI say "wrong account". Other accept failures stay
  // generic for anti-enumeration.
  emailMismatch: "email_mismatch",
} as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];
