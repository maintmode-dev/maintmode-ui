import "server-only";

import { logError } from "@/server/observability/error-log";
import { BACKEND_S2S_TOKEN_ENV, readBackendS2SToken } from "@/shared/config/backend-s2s-config";

/**
 * The BFF's client credential on requests to the auth backend (RUK-311).
 *
 * The BFF is a confidential client; this is how the backend tells it apart
 * from anyone else holding a refresh token. The scheme is the backend's own
 * pre-monolith s2s middleware revived (`RequireS2SToken`): an app name that
 * selects the expected secret, and the secret. Switching to `private_key_jwt`
 * later keeps both headers and changes only what `X-S2S-TOKEN` holds.
 *
 * Attached to EVERY request resolved against the auth base, not just the
 * endpoints the backend checks today: the backend can widen its protected set
 * without a frontend release, and paths it does not check ignore the headers.
 *
 * It does NOT protect against a stolen session cookie — that is replayed
 * through this same BFF, which adds the credential itself.
 */
export const S2S_APPNAME_HEADER = "x-s2s-appname";
export const S2S_TOKEN_HEADER = "x-s2s-token";
export const S2S_APPNAME = "maintmode-ui";

/**
 * Sets both headers, replacing any same-named header a caller passed in any
 * letter case — `Headers` is case-insensitive, so `set` overwrites where a
 * plain-object spread would have kept both and sent a combined value.
 * Call it last.
 */
export function applyBackendS2SHeaders(headers: Headers): void {
  headers.set(S2S_APPNAME_HEADER, S2S_APPNAME);
  headers.set(S2S_TOKEN_HEADER, readBackendS2SToken(process.env));
}

/**
 * Logs a `401` whose body says the backend refused THIS client — not the
 * user's token or credentials (`invalid_client`, the same envelope for every
 * cause). That is a deployment misconfiguration that signs everyone out at
 * their next refresh and fails every sign-in as "wrong credentials", so it has
 * to be loud and name what to fix. The token is never logged; the path is
 * logged without its query string (an invitation preview carries a bearer
 * token there). The entry's own `path` field is left unset: in the log store it
 * means the inbound BFF request.
 *
 * Best-effort and never throws: it runs inside the caller's error handling,
 * and a throw there would change how the 401 is classified (`session-token.ts`
 * reads any non-`BackendAuthError` as transient and keeps the session).
 */
export function reportRejectedClientCredential(path: string, bodyText: string): void {
  try {
    const parsed: unknown = JSON.parse(bodyText);
    if ((parsed as { code?: unknown } | null)?.code !== "invalid_client") {
      return;
    }
    logError({
      level: "ERROR",
      // `invalid_client` covers every cause the backend's s2s check has: wrong
      // secret, unknown app name, or a path not allowed for this app.
      msg: `auth backend refused the BFF client credential (wrong ${BACKEND_S2S_TOKEN_ENV}, app name, or a path not allowed for ${S2S_APPNAME}); check that ${BACKEND_S2S_TOKEN_ENV} equals the backend's s2s secret for ${S2S_APPNAME}`,
      err: `invalid_client on ${path.split(/[?#]/, 1)[0]}`,
    });
  } catch {
    // Not JSON, or nothing to report: the caller's handling is all that matters.
  }
}
