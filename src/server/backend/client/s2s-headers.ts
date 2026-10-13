import "server-only";

import { readBackendS2SToken } from "@/shared/config/backend-s2s-config";

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
