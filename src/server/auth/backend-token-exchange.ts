import "server-only";

import { readMaintmodeBackendConfig, resolveBackendUrl } from "@/server/backend/config";
import { BackendAuthError, type BackendMeResponse, type BackendTokenPair } from "@/server/auth/contracts";

const EXCHANGE_GOOGLE_PATH = "/api/v1/login/oauth/exchange/google";
const ACCEPT_INVITATION_PATH = "/api/v1/users/invitations/accept";
const REFRESH_PATH = "/api/v1/refresh";
const LOGOUT_PATH = "/api/v1/logout";
const LOGOUT_ALL_PATH = "/api/v1/logout/all";
const ME_PATH = "/api/v1/me";
const OTP_REQUEST_PATH = "/api/v1/login/otp/request";
const OTP_VERIFY_PATH = "/api/v1/login/otp/verify";
const PASSWORD_LOGIN_PATH = "/api/v1/login/password";

/**
 * BFF-owned OAuth.
 *
 * The frontend runs the standard NextAuth Google provider. After Google's
 * `code` ↔ token exchange, NextAuth holds the Google `id_token`. We forward
 * that JWT to the maintmode backend, which verifies it against Google JWKS
 * and returns its own short-lived `TokenPairResponse`. The backend tokens
 * are persisted server-side in the NextAuth jwt cookie; the browser never
 * sees them.
 *
 * Real route mounted at `/api/v1/login/oauth/exchange/google` (the swagger
 * `summary` lists `/api/v1/auth/exchange/google` — that is a doc bug; the
 * canonical mount lives under `loginOAuthGr` in the backend router).
 *
 * The backend currently gates this endpoint with the `NotAllowedInProd`
 * middleware, so it is reachable only in dev/staging. Production rollout
 * is a separate backend follow-up.
 *
 * `testRoles` (dev-only) seeds the `X-Test-Roles` header so a freshly created
 * dev user gets the given roles (comma-separated, e.g. `admin,editor`). The
 * only caller that passes it is the dev-bypass branch of the NextAuth `signIn`
 * callback, which is registered solely under `devAuthBypassEnabled` (off in
 * production) — so the header can never ship in a prod build. We only send it
 * when the value is non-empty. The header is deliberately absent from the
 * public swagger, so it is added here in the fetch layer by hand.
 */
export async function exchangeGoogleIdToken(idToken: string, testRoles = ""): Promise<BackendTokenPair> {
  const headers = testRoles ? { "X-Test-Roles": testRoles } : undefined;
  return postBackendJson<BackendTokenPair>(
    EXCHANGE_GOOGLE_PATH,
    { id_token: idToken },
    (parsed) => Boolean(parsed?.access_token && parsed?.refresh_token),
    headers,
  );
}

/**
 * Public invitation accept.
 *
 * Completes an invitation by handing the backend the raw invitation token plus
 * the OAuth payload (provider + signed `id_token`). The backend verifies the
 * token, checks the OAuth email matches the invited email, creates the user
 * with the invitation's pre-assigned roles, and returns its own
 * `TokenPairResponse` — exactly like a normal login.
 *
 * Security: this runs server-side only (inside the NextAuth `signIn`
 * callback). The returned `access_token`/`refresh_token` are persisted in the
 * server-only JWT cookie and never reach the browser. The endpoint is public
 * (no Bearer), so we call the unauthenticated `backendRequest` directly.
 *
 * The backend collapses every accept failure into a bare `400` with code
 * `invalid` | `email_mismatch` and no message (anti-enumeration). On any
 * non-2xx this throws `BackendAuthError`, which the `signIn` callback maps to
 * a generic sign-in failure code — no invitation detail leaks to the UI.
 */
export async function acceptInvitation(args: {
  invitationToken: string;
  provider: string;
  idToken: string;
}): Promise<BackendTokenPair> {
  return postBackendJson<BackendTokenPair>(
    ACCEPT_INVITATION_PATH,
    {
      invitation_token: args.invitationToken,
      oauth_payload: { provider: args.provider, id_token: args.idToken },
    },
    (parsed) => Boolean(parsed?.access_token && parsed?.refresh_token),
  );
}

/**
 * Step one of the email OTP flow: ask the backend to mail a code (RUK-288).
 *
 * The backend answers 202 for EVERY outcome — unknown address, blocked account,
 * malformed body, burnt-code barrier — with a well-formed nonce either way, and
 * floors every response to ~300ms. That is deliberate anti-enumeration, so this
 * function reports success identically in all those cases and the UI must never
 * translate any of them into "no such account".
 *
 * The returned `session_nonce` is the browser binding. It is stored in an
 * httpOnly cookie by the caller and never returned to the browser.
 */
export async function requestOtpCode(email: string): Promise<{ session_nonce: string }> {
  return postBackendJson<{ session_nonce: string }>(
    OTP_REQUEST_PATH,
    { email },
    (value): value is { session_nonce: string } =>
      typeof value === "object" &&
      value !== null &&
      typeof (value as { session_nonce?: unknown }).session_nonce === "string",
  );
}

/**
 * Step two: trade the code plus its binding for a token pair.
 *
 * Two failures are distinguishable, both 401: `otp_session_mismatch` (the nonce
 * is missing or does not match — the tab that requested the code is gone) and
 * `unauthorized` (everything else: wrong code, expired, attempts exhausted).
 * The backend checks the nonce BEFORE the code, so a user who lost their tab
 * gets the actionable answer even if they also mistyped.
 */
export async function verifyOtpCode(args: {
  email: string;
  code: string;
  sessionNonce: string;
}): Promise<BackendTokenPair> {
  return postBackendJson<BackendTokenPair>(
    OTP_VERIFY_PATH,
    { email: args.email, code: args.code, session_nonce: args.sessionNonce },
    // `refresh_token` carries `omitempty` and may legitimately be absent, so —
    // unlike the Google path — it is not required here.
    (parsed) => Boolean(parsed?.access_token),
  );
}

/**
 * Email + password sign-in. Serves both the bootstrap break-glass admin and,
 * later, `email_password`; the backend decides internally and the frontend
 * cannot and need not tell them apart.
 *
 * Every failure is one uniform 401 — wrong password, blocked account, refused
 * signup, exhausted seats — deliberately not routed through the shared error
 * mapper, which would leak `signup_disabled` and `seats_limit_exceeded`.
 */
export async function loginWithPassword(args: {
  email: string;
  password: string;
}): Promise<BackendTokenPair> {
  return postBackendJson<BackendTokenPair>(
    PASSWORD_LOGIN_PATH,
    { email: args.email, password: args.password },
    (parsed) => Boolean(parsed?.access_token),
  );
}

/**
 * Rotates the refresh token via `POST /api/v1/refresh`. Returns the new
 * `TokenPairResponse`.
 */
export async function refreshBackendToken(refreshToken: string): Promise<BackendTokenPair> {
  return postBackendJson<BackendTokenPair>(REFRESH_PATH, { refresh_token: refreshToken }, (parsed) =>
    Boolean(parsed?.access_token && parsed?.refresh_token),
  );
}

/**
 * Revokes the current backend session via `POST /api/v1/logout`. The access
 * token goes in `Authorization` and the refresh token in the JSON body.
 */
export async function revokeBackendSession(accessToken: string, refreshToken: string): Promise<void> {
  const config = readMaintmodeBackendConfig();
  const target = resolveBackendUrl(config.authApiBaseUrl, LOGOUT_PATH);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const response = await fetch(target, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: controller.signal,
    });
    if (!response.ok && response.status !== 204) {
      const body = await response.text();
      throw new BackendAuthError(response.status, body || response.statusText);
    }
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Revokes every refresh token for the current user via `POST /api/v1/logout/all`
 * — signs the account out on all devices. Only the access token is needed
 * (`Authorization: Bearer`); there is no body.
 */
export async function revokeAllBackendSessions(accessToken: string): Promise<void> {
  const config = readMaintmodeBackendConfig();
  const target = resolveBackendUrl(config.authApiBaseUrl, LOGOUT_ALL_PATH);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const response = await fetch(target, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      signal: controller.signal,
    });
    if (!response.ok && response.status !== 204) {
      const body = await response.text();
      throw new BackendAuthError(response.status, body || response.statusText);
    }
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Loads the current user's profile via `GET /api/v1/me`.
 */
export async function fetchBackendMe(accessToken: string): Promise<BackendMeResponse> {
  const config = readMaintmodeBackendConfig();
  const target = resolveBackendUrl(config.authApiBaseUrl, ME_PATH);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const response = await fetch(target, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      signal: controller.signal,
    });
    const body = await response.text();
    if (!response.ok) {
      throw new BackendAuthError(response.status, body || response.statusText);
    }
    const parsed = safeJsonParse<BackendMeResponse>(body);
    if (!parsed?.id || !parsed.email) {
      throw new BackendAuthError(response.status, body, "Backend /me returned an unexpected payload");
    }
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

async function postBackendJson<TResponse>(
  path: string,
  body: Record<string, unknown>,
  isShapeValid: (parsed: TResponse | undefined) => boolean,
  extraHeaders?: Record<string, string>,
): Promise<TResponse> {
  const config = readMaintmodeBackendConfig();
  const target = resolveBackendUrl(config.authApiBaseUrl, path);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const response = await fetch(target, {
      method: "POST",
      headers: {
        // Spread extra headers first so the fixed accept/content-type below
        // always win — a caller can never override the JSON content contract.
        ...extraHeaders,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new BackendAuthError(response.status, text || response.statusText);
    }
    const parsed = safeJsonParse<TResponse>(text);
    if (!isShapeValid(parsed)) {
      throw new BackendAuthError(response.status, text, `Backend ${path} returned an unexpected payload`);
    }
    return parsed as TResponse;
  } finally {
    clearTimeout(timeout);
  }
}

function safeJsonParse<T>(text: string): T | undefined {
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}
