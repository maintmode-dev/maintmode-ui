import "server-only";

import { forwardedForHeader } from "@/server/backend/client/forwarded-for";
import { readMaintmodeBackendConfig, resolveBackendUrl } from "@/server/backend/config";
import { BackendAuthError, type BackendMeResponse, type BackendTokenPair } from "@/server/auth/contracts";

const EXCHANGE_GOOGLE_PATH = "/api/v1/login/oauth/exchange/google";
const DANCE_CODE_EXCHANGE_PATH = "/api/v1/login/oauth/code/exchange";
const ACCEPT_INVITATION_PASSWORD_PATH = "/api/v1/users/invitations/accept/password";
const REFRESH_PATH = "/api/v1/refresh";
const LOGOUT_PATH = "/api/v1/logout";
const LOGOUT_ALL_PATH = "/api/v1/logout/all";
const ME_PATH = "/api/v1/me";
const OTP_REQUEST_PATH = "/api/v1/login/otp/request";
const OTP_VERIFY_PATH = "/api/v1/login/otp/verify";
const PASSWORD_LOGIN_PATH = "/api/v1/login/password";
const BREAK_GLASS_LOGIN_PATH = "/api/v1/login/break-glass";
const PASSWORD_RESET_REQUEST_PATH = "/api/v1/password/reset/request";
const PASSWORD_RESET_CONFIRM_PATH = "/api/v1/password/reset/confirm";
const CHANGE_PASSWORD_PATH = "/api/v1/me/password";

/**
 * BFF-owned OAuth.
 *
 * NOT a live sign-in path since RUK-292. The frontend stopped being an OAuth
 * client, so nothing here ever holds a real provider `id_token` any more; the
 * live path is `redeemOAuthDanceCode`. The ONLY remaining caller is the dev-only
 * bypass provider, which passes the literal string "dev-bypass" and relies on
 * the backend accepting it in non-production.
 *
 * Kept rather than deleted for exactly that reason. Deleting the backend route
 * without moving the dev stub with it breaks the project's role-switching tool.
 *
 * Real route mounted at `/api/v1/login/oauth/exchange/google` (the swagger
 * `summary` lists `/api/v1/auth/exchange/google` — that is a doc bug; the
 * canonical mount lives under `loginOAuthGr` in the backend router).
 *
 * The backend gates this endpoint with the `NotAllowedInProd` middleware, so it
 * is reachable only in dev/staging — which is all the dev bypass needs.
 *
 * `testRoles` (dev-only) seeds the `X-Test-Roles` header so a freshly created
 * dev user gets the given roles (comma-separated, e.g. `admin,editor`). The
 * only caller that passes it is `signInWithDevBypass`, which refuses to run
 * unless `devAuthBypassEnabled` (off in production) — so the header can never ship in a prod build. We only send it
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
 * Accepts an invitation by setting a password — no identity provider involved.
 *
 * Public and unauthenticated: the invitation token is the credential. The
 * backend creates the user with the invited address, sets the password, claims
 * the invitation and grants its roles in one transaction, then issues a token
 * pair shaped like password sign-in's.
 *
 * Unlike `loginWithPassword`, its failures are distinct (`invalid`,
 * `method_disabled`, `seats_limit_exceeded`, `conflict`, a policy 400, 429) and
 * the caller maps them; they are carried on `BackendAuthError` untouched.
 */
export async function acceptInvitationWithPassword(args: {
  invitationToken: string;
  password: string;
}): Promise<BackendTokenPair> {
  return postBackendJson<BackendTokenPair>(
    ACCEPT_INVITATION_PASSWORD_PATH,
    { invitation_token: args.invitationToken, password: args.password },
    // BOTH tokens, as for every call that mints a session: a pair with no
    // refresh token signs the person in and dies at the first rotation.
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
 * Every failure is ONE 401 `unauthorized` — wrong code, expired, attempts
 * exhausted, a nonce that does not match — plus 429 from the limiter. The
 * backend used to answer a nonce mismatch with its own `otp_session_mismatch`
 * and withdrew it (BUG-2, v0.2.0-rc): telling it apart revealed whether an
 * account exists. A mismatched nonce no longer spends an attempt either.
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
 * Break-glass sign-in: the server's emergency administrator, by PASSWORD ALONE.
 *
 * Its own endpoint since the backend split it from `/login/password`, which now
 * serves personal passwords only and answers a break-glass password with 401.
 * There is no email: the account is a fixed service identity
 * (`break-glass@maintmode.invalid`), so asking for an address would only add a
 * way to get it wrong.
 *
 * Every refusal — wrong password, break-glass not configured, the account
 * blocked, a malformed body — is one uniform 401 by contract, so that from
 * outside this endpoint cannot tell an instance with an emergency entrance from
 * one without. Kept that way here.
 */
export async function loginWithBreakGlass(password: string): Promise<BackendTokenPair> {
  return postBackendJson<BackendTokenPair>(BREAK_GLASS_LOGIN_PATH, { password }, (parsed) =>
    // BOTH tokens, as for every call that mints a session.
    Boolean(parsed?.access_token && parsed?.refresh_token),
  );
}

/**
 * Redeems the one-time code the backend's OAuth callback put in the redirect
 * (RUK-292).
 *
 * The code is a bearer credential with a 60-second life and one use. Every
 * redemption failure — unknown, expired, already redeemed, malformed — answers
 * the same 401 by design, so a caller cannot learn which of its guesses was
 * closer; this function does not try to tell them apart either.
 *
 * 401 is not the only non-2xx. The route sits behind a rate limiter whose bucket
 * is keyed on client IP with no route component, so it is shared with password
 * sign-in, OTP, password reset and invitations alike: a burst on any of those
 * can answer a redemption with 429 and burn a live code. `BackendAuthError`
 * carries the status either way, which is what lets the caller log the two apart
 * while telling the user the same thing.
 */
export async function redeemOAuthDanceCode(code: string, bindingProof: string): Promise<BackendTokenPair> {
  // `binding_proof` is the nonce from this browser's binding cookie
  // (`oauth-binding-cookie.ts`). Without the right one the backend answers the
  // same 401 as for a bad code, and burns the code either way.
  return postBackendJson<BackendTokenPair>(
    DANCE_CODE_EXCHANGE_PATH,
    { code, binding_proof: bindingProof },
    (parsed) =>
      // BOTH tokens, matching every other call that mints a session. Accepting a
      // pair with no refresh token signs the user in and then kills the session at
      // the first rotation — the `jwt` callback has nothing to rotate with and
      // marks it `RefreshAccessTokenError`. That lands minutes later, mid-work,
      // and points nowhere near this function.
      Boolean(parsed?.access_token && parsed?.refresh_token),
  );
}

/**
 * Password reset, step one: ask the backend to mail a code.
 *
 * Shaped exactly like `requestOtpCode` because it IS the same mechanism — the
 * backend routes both through one OTP issuer. It answers 202 with a session
 * nonce for every outcome, including an address with no account and a malformed
 * body (a placeholder nonce), so nothing here may branch on the result.
 *
 * Note the consequence the caller must not paper over: because the two flows
 * share one OTP record per user, asking for a reset code consumes any live
 * sign-in code. Separate cookies keep the two BINDINGS apart; they cannot keep
 * the codes apart.
 */
export async function requestPasswordResetCode(email: string): Promise<{ session_nonce: string }> {
  return postBackendJson<{ session_nonce: string }>(
    PASSWORD_RESET_REQUEST_PATH,
    { email },
    (value): value is { session_nonce: string } =>
      typeof value === "object" &&
      value !== null &&
      typeof (value as { session_nonce?: unknown }).session_nonce === "string",
  );
}

/**
 * Password reset, step two: redeem the code and install the new password.
 *
 * Answers **204 with an empty body** — no token pair — and revokes every
 * session, so the caller signs in again afterwards. It cannot go through
 * `postBackendJson`, which requires a JSON payload it can shape-check.
 *
 * Failures collapse into one 401 "authentication failed" with no exception —
 * the distinct `otp_session_mismatch` was withdrawn (see `verifyOtpCode`). A
 * password that
 * breaks the length policy is INSIDE that collapse and is reported as a wrong
 * code — which is why the client checks the length before calling this.
 */
export async function confirmPasswordReset(args: {
  email: string;
  code: string;
  sessionNonce: string;
  newPassword: string;
}): Promise<void> {
  return backendFetch(
    PASSWORD_RESET_CONFIRM_PATH,
    {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        email: args.email,
        code: args.code,
        session_nonce: args.sessionNonce,
        new_password: args.newPassword,
      }),
    },
    async (response) => {
      if (!response.ok) {
        throw new BackendAuthError(response.status, (await response.text()) || response.statusText);
      }
    },
  );
}

/**
 * The outcome of a change-password call, classified WITHOUT reading any prose.
 *
 * The backend's three 400s all carry `code: "invalid request"` and differ only
 * in free text, so branching on the message would be a contract that breaks on
 * a reword. What the caller knows instead is what it sent, which is enough.
 */
export type ChangePasswordOutcome =
  | { ok: true }
  /** Wrong `current_password` — the caller sent one and the backend refused. */
  | { ok: false; kind: "wrong-current-password" }
  /** The `refresh_token` was stale or foreign; NOTHING was changed. */
  | { ok: false; kind: "session-stale" }
  /** A 400: the wrong shape for this account's state, or a policy violation. */
  | { ok: false; kind: "rejected"; message: string }
  /**
   * A FIRST password needs a recent sign-in: the session must have started
   * within the last few minutes (security review M5), so a stolen session
   * cannot be turned into a permanent password. Nothing was changed.
   */
  | { ok: false; kind: "reauthentication-required" }
  | { ok: false; kind: "unavailable" };

/**
 * Sets the caller's own password.
 *
 * Deliberately NOT routed through `authenticatedBackendRequest`, for two
 * reasons that both end in "the user is signed out and their password is
 * unchanged":
 *
 *  - it retries the mutation after refreshing on a 401, and this endpoint takes
 *    a `refresh_token` in the BODY, so the retry would carry a token the
 *    refresh just superseded;
 *  - it collapses every 401 into one error type, losing the difference between
 *    a wrong current password and a dead session — which is the difference
 *    between a message in the form and a redirect to /login.
 *
 * `refreshToken` names the session to keep alive. Omitting it revokes every
 * session including the caller's, which is the honest fallback when the BFF has
 * no live refresh token to offer.
 */
export async function changeBackendPassword(args: {
  accessToken: string;
  currentPassword?: string;
  newPassword: string;
  refreshToken?: string;
}): Promise<ChangePasswordOutcome> {
  try {
    return await backendFetch(
      CHANGE_PASSWORD_PATH,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          authorization: `Bearer ${args.accessToken}`,
        },
        body: JSON.stringify({
          // Sent only when there is one. The backend rejects the field outright
          // for an account with no password, so an empty string is not the same
          // as absent.
          ...(args.currentPassword ? { current_password: args.currentPassword } : {}),
          new_password: args.newPassword,
          ...(args.refreshToken ? { refresh_token: args.refreshToken } : {}),
        }),
      },
      async (response): Promise<ChangePasswordOutcome> => {
        if (response.status === 204) {
          return { ok: true };
        }

        const body = await response.text();

        if (response.status === 401) {
          // The one classification, and it reads what the REQUEST carried rather
          // than what the response says. A 401 when a current password was sent is
          // that password being wrong; a 401 when none was sent is the
          // `refresh_token` having been superseded, and nothing the user typed.
          return { ok: false, kind: args.currentPassword ? "wrong-current-password" : "session-stale" };
        }
        if (response.status === 400) {
          // The `message` FIELD, not the raw envelope. `body` is the whole
          // response text, so passing it straight through put
          // `{"code":"invalid request","message":…}` verbatim into the
          // operator's form — and would paste a proxy's HTML error page in
          // whole. Read for DISPLAY only: §3.4 forbids branching on backend
          // prose, and the only behavioural branch remains the card's flip flag.
          const parsed = safeJsonParse<{ message?: string }>(body);
          return {
            ok: false,
            kind: "rejected",
            message: parsed?.message ?? "That password wasn't accepted.",
          };
        }
        if (response.status === 403) {
          // Branching on the code, not the status: a 403 is otherwise an
          // unexpected answer here and stays "unavailable". The code is a
          // literal agreed with the backend (M5).
          const parsed = safeJsonParse<{ code?: string }>(body);
          if (parsed?.code === "reauthentication_required") {
            return { ok: false, kind: "reauthentication-required" };
          }
        }
        return { ok: false, kind: "unavailable" };
      },
    );
  } catch {
    // Network failure, a malformed URL, or the abort above. This function
    // reports rather than throws, so every one of them is `unavailable`.
    return { ok: false, kind: "unavailable" };
  }
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
  return backendFetch(
    LOGOUT_PATH,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    },
    async (response) => {
      if (!response.ok && response.status !== 204) {
        const body = await response.text();
        throw new BackendAuthError(response.status, body || response.statusText);
      }
    },
  );
}

/**
 * Revokes every refresh token for the current user via `POST /api/v1/logout/all`
 * — signs the account out on all devices. Only the access token is needed
 * (`Authorization: Bearer`); there is no body.
 */
export async function revokeAllBackendSessions(accessToken: string): Promise<void> {
  return backendFetch(
    LOGOUT_ALL_PATH,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
      },
    },
    async (response) => {
      if (!response.ok && response.status !== 204) {
        const body = await response.text();
        throw new BackendAuthError(response.status, body || response.statusText);
      }
    },
  );
}

/**
 * Loads the current user's profile via `GET /api/v1/me`.
 */
export async function fetchBackendMe(accessToken: string): Promise<BackendMeResponse> {
  return backendFetch(
    ME_PATH,
    {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
      },
    },
    async (response) => {
      const body = await response.text();
      if (!response.ok) {
        throw new BackendAuthError(response.status, body || response.statusText);
      }
      const parsed = safeJsonParse<BackendMeResponse>(body);
      if (!parsed?.id || !parsed.email) {
        throw new BackendAuthError(response.status, body, "Backend /me returned an unexpected payload");
      }
      return parsed;
    },
  );
}

/**
 * Resolves `path` against the auth base URL and runs one `fetch` under the
 * configured timeout.
 *
 * Owns the request scaffold ONLY — the URL, the abort timer and the browser's
 * forwarded address (see `forwardedForHeader`), identical at every call site. It deliberately does not touch the response:
 * these endpoints disagree about what a response even is (a shape-checked JSON
 * body, a bare 204, a 401 classified by what the REQUEST carried), and some
 * throw where others return a discriminated result. Folding that in would erase
 * the distinctions their callers exist to act on.
 *
 * `handleResponse` receives the response, and the timeout is cleared only once
 * it settles. That is why this takes a callback rather than returning the
 * `Response`: the timer has to outlive the body read. `fetch` resolves on the
 * response HEAD, so clearing it at that point would leave a stalled `.text()`
 * hanging forever — exactly the case the timeout exists for.
 */
async function backendFetch<T>(
  path: string,
  init: Omit<RequestInit, "signal">,
  handleResponse: (response: Response) => Promise<T>,
): Promise<T> {
  const config = readMaintmodeBackendConfig();
  const target = resolveBackendUrl(config.authApiBaseUrl, path);
  const forwardedFor = await forwardedForHeader();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    return await handleResponse(
      await fetch(target, {
        ...init,
        headers: { ...forwardedFor, ...init.headers },
        signal: controller.signal,
      }),
    );
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
  return backendFetch(
    path,
    {
      method: "POST",
      headers: {
        // Spread extra headers first so the fixed accept/content-type below
        // always win — a caller can never override the JSON content contract.
        ...extraHeaders,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
    async (response) => {
      const text = await response.text();
      if (!response.ok) {
        throw new BackendAuthError(response.status, text || response.statusText);
      }
      const parsed = safeJsonParse<TResponse>(text);
      if (!isShapeValid(parsed)) {
        throw new BackendAuthError(response.status, text, `Backend ${path} returned an unexpected payload`);
      }
      return parsed as TResponse;
    },
  );
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
