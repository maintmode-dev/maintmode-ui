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
  // OAuth dance: the person declined at the provider's consent screen (UX-10,
  // v0.2.0-rc). Split out of `access_denied` by the backend because it is a
  // fact about the person's own action, decided before the backend knows who
  // they are — so it reveals nothing about an account, and "ask for an
  // invitation" is the wrong advice for someone who simply clicked Cancel.
  consentCancelled: "consent_cancelled",
  // Every verify failure — wrong code, expired, attempts exhausted, a lost or
  // foreign browser binding. The backend collapses them into one 401 on purpose
  // (anti-enumeration) and so do we; the copy tells the user to re-check or
  // request a new code.
  //
  // There used to be a distinct `otp_session_mismatch` for the binding case. It
  // was withdrawn from the backend contract because it revealed whether an
  // account exists (BUG-2, v0.2.0-rc), and this frontend's local binding check
  // answers with this code too, so it cannot become a second copy of that signal.
  otpVerificationFailed: "otp_verification_failed",
  // Uniform password-login failure. Never says which field was wrong: naming
  // one would enumerate accounts.
  invalidCredentials: "invalid_credentials",
  // A one-time code (sign-in verify, password-reset request/confirm) was
  // rate limited, which is not a verdict on the code the user typed. Kept
  // separate so the copy does not tell someone to re-check a correct one and
  // send more requests into the limiter already refusing them.
  otpRateLimited: "otp_rate_limited",
  // Password sign-in was rate limited. Same reasoning as `otpRateLimited` —
  // a 429 says nothing about the password — but a password form has no code,
  // so it gets the flow-neutral name. The backend's 429 carries no code of its
  // own (it is echo's limiter answer); this name is ours.
  rateLimited: "rate_limited",
  // Every confirm failure — wrong code, expired, attempts exhausted, a lost
  // browser binding (see `otpVerificationFailed` for why that is not its own
  // code any more), and —
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
  // Accepting an invitation by setting a password. The backend answers this
  // path with distinct codes, and unlike password SIGN-IN they reveal nothing a
  // stranger could use: the caller holds the invitation, which already names
  // the address.
  //
  // The invitation is unknown, expired, revoked or already claimed — one 400
  // `invalid` for all four, and kept as one.
  invitationInvalid: "invitation_invalid",
  // Password sign-in (`email_password`) is switched off on this instance, so an
  // invitation cannot be accepted with a password.
  signInMethodDisabled: "method_disabled",
  // No free seat for the roles the invitation grants.
  seatsLimitExceeded: "seats_limit_exceeded",
  // An account with the invited address already exists. The backend does NOT
  // set a password on it — the person should sign in instead.
  accountExists: "account_exists",
  // The invitation endpoints' per-IP limiter refused the request.
  inviteRateLimited: "invite_rate_limited",
  // Anything else on the accept-with-password path: transport, 5xx, a payload
  // without both tokens.
  inviteAcceptFailed: "invite_accept_failed",
} as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];
