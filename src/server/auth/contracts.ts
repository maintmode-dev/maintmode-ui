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
 * server page (`src/app/(public)/login/page.tsx`) reads `?code=` (falling back to
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
  // Built-in sign-in (RUK-288). The OTP browser binding is missing or does not
  // match: the tab that requested the code is gone, so the code cannot be
  // checked here. Surfaced distinctly and NOT as a wrong-code error, because a
  // user holding a correct code otherwise has no idea why it fails. Leaks
  // nothing: it names a fact about this browser, never about an account.
  otpSessionMismatch: "otp_session_mismatch",
  // Every other verify failure — wrong code, expired, attempts exhausted. The
  // backend collapses them into one 401 on purpose (anti-enumeration) and so do
  // we; the copy tells the user to re-check or request a new code.
  otpVerificationFailed: "otp_verification_failed",
  // Uniform password-login failure. Never says which field was wrong: naming
  // one would enumerate accounts.
  invalidCredentials: "invalid_credentials",
  // Rate limited, which is not a verdict on the code the user typed. Kept
  // separate so the copy does not tell someone to re-check a correct code and
  // send more requests into the limiter that is already refusing them.
  otpRateLimited: "otp_rate_limited",
  // Password reset (RUK-289). The reset flow's OWN mismatch code, deliberately
  // not a reuse of `otpSessionMismatch`: that one's copy sends the user back to
  // sign-in, which is the wrong destination when they are mid-reset and have
  // not chosen a new password yet. Leaks nothing, for the same reason its
  // sign-in twin leaks nothing — it names a fact about this browser.
  passwordResetSessionMismatch: "password_reset_session_mismatch",
  // Every other confirm failure: wrong code, expired, attempts exhausted, and —
  // because the backend deliberately hides it inside the same collapse — a
  // password that breaks the length policy. The client checks length before
  // sending precisely so a user never sees this code for that reason.
  passwordResetFailed: "password_reset_failed",
  // The new password failed the client-side policy check, so nothing was sent.
  // Distinct from every server answer: no attempt was spent and the binding is
  // still good, so the copy must not tell the user to request a new code.
  passwordPolicyViolation: "password_policy_violation",
  // The endpoint itself is unreachable or broken (404/5xx), which is a fact
  // about the SERVICE and not about an account — so saying so plainly leaks
  // nothing. Kept apart from the anti-enumeration collapse because folding it
  // in tells every user their input was wrong during an outage.
  passwordResetUnavailable: "password_reset_unavailable",
} as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];
