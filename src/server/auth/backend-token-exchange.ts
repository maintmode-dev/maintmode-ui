import "server-only";

import { readMaintmodeBackendConfig, resolveBackendUrl } from "@/server/backend/config";
import { BackendAuthError, type BackendMeResponse, type BackendTokenPair } from "@/server/auth/contracts";

const EXCHANGE_GOOGLE_PATH = "/api/v1/login/oauth/exchange/google";
const ACCEPT_INVITATION_PATH = "/api/v1/users/invitations/accept";
const REFRESH_PATH = "/api/v1/refresh";
const LOGOUT_PATH = "/api/v1/logout";
const LOGOUT_ALL_PATH = "/api/v1/logout/all";
const ME_PATH = "/api/v1/me";

/**
 * BFF-owned OAuth (RUK-35).
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
 */
export async function exchangeGoogleIdToken(idToken: string): Promise<BackendTokenPair> {
  return postBackendJson<BackendTokenPair>(EXCHANGE_GOOGLE_PATH, { id_token: idToken }, (parsed) =>
    Boolean(parsed?.access_token && parsed?.refresh_token),
  );
}

/**
 * Public invitation accept (RUK-160).
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
): Promise<TResponse> {
  const config = readMaintmodeBackendConfig();
  const target = resolveBackendUrl(config.authApiBaseUrl, path);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const response = await fetch(target, {
      method: "POST",
      headers: {
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
