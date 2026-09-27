/**
 * Timing facts of the backend's one-time codes, shared by the browser flows and
 * the server actions that bind a code to a browser. Two copies of either would
 * drift, and each drift has a concrete failure — see the constants.
 */

/**
 * The backend's `auth.otp_reissue_cooldown`: the least time between two codes
 * for one user. Inside it a new request answers 202 as always, sends NO email,
 * and returns a fresh `session_nonce` that matches nothing — the live code
 * keeps the nonce it was issued with.
 *
 * So inside this window a second request must neither be offered as "send me
 * a new code" (the resend button waits it out) nor be allowed to replace the
 * browser's binding (the one code the user has would then never verify). Both
 * were real before this constant existed: the resend waited 30s against the
 * backend's 60s, and every request overwrote the binding.
 */
export const OTP_REISSUE_COOLDOWN_SECONDS = 60;
