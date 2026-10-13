import "server-only";

/**
 * The BFF's client credential for the auth backend (RUK-311).
 *
 * The BFF is a confidential client, and this is how it proves it: every request
 * to the auth backend carries it (see `server/backend/client/s2s-headers.ts`).
 * A refresh token that leaks at rest cannot be redeemed without it.
 *
 * `server-only` although the parsing is pure: this module hands the secret back,
 * and every caller of the auth config it feeds is server code today. A client
 * import has to fail the build rather than pull the env name and its reader
 * into a bundle.
 */
export const BACKEND_S2S_TOKEN_ENV = "MAINTMODE_BACKEND_S2S_TOKEN";

const MIN_TOKEN_LENGTH = 32;

/**
 * Printable ASCII, no whitespace — what `Headers` carries verbatim. Anything
 * else (CR/LF from a CRLF env file, non-Latin-1, surrounding spaces) is rejected
 * or altered by `Headers.set`, and that would surface per request as a
 * `TypeError` the backend client reads as "backend unreachable".
 */
const TOKEN_CHARSET = /^[\x21-\x7E]+$/;

export class BackendS2SConfigError extends Error {
  constructor(issue: string) {
    super(`${BACKEND_S2S_TOKEN_ENV} ${issue}`);
    this.name = "BackendS2SConfigError";
  }
}

/**
 * What is wrong with the configured value, in the wording the other config
 * issues use, or `undefined` when it is valid. Never includes the value.
 */
export function backendS2STokenIssue(env: Record<string, string | undefined>): string | undefined {
  const raw = env[BACKEND_S2S_TOKEN_ENV];
  if (!raw) {
    return "is required";
  }
  if (raw.length < MIN_TOKEN_LENGTH) {
    return `must be at least ${MIN_TOKEN_LENGTH} characters`;
  }
  if (!TOKEN_CHARSET.test(raw)) {
    return "must be printable ASCII without whitespace";
  }
  return undefined;
}

/**
 * The configured value. Throws `BackendS2SConfigError` — deliberately not a
 * `TypeError`, which the backend client classifies as a transport failure.
 */
export function readBackendS2SToken(env: Record<string, string | undefined>): string {
  const issue = backendS2STokenIssue(env);
  if (issue) {
    throw new BackendS2SConfigError(issue);
  }
  return env[BACKEND_S2S_TOKEN_ENV] as string;
}
