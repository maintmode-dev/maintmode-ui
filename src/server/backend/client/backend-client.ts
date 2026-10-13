import "server-only";

import { forwardedClientHeaders } from "@/server/backend/client/forwarded-for";
import { applyBackendS2SHeaders, reportRejectedClientCredential } from "@/server/backend/client/s2s-headers";
import { readMaintmodeBackendConfig, resolveBackendUrl } from "@/server/backend/config";
import {
  BackendRequestError,
  BackendUnauthorizedError,
  BackendUnavailableError,
} from "@/server/backend/errors/backend-request-error";

export type BackendRequestOptions = RequestInit & {
  path: string;
  /**
   * Optional access token. When provided, the request gains an
   * `Authorization: Bearer <accessToken>` header. The authenticated wrapper
   * in `authenticated-backend-request.ts` is responsible for sourcing the
   * token from the active session.
   */
  accessToken?: string;
  /**
   * When `true`, resolves `path` against `authApiBaseUrl` instead of the
   * default `apiBaseUrl`. Used by admin/audit BFF routes whose endpoints live
   * under the auth-service prefix (e.g. `/auth/api/v1/roles`).
   */
  useAuthBase?: boolean;
};

export async function backendRequest<TResponse>({
  path,
  accessToken,
  useAuthBase,
  ...init
}: BackendRequestOptions): Promise<TResponse> {
  const config = readMaintmodeBackendConfig();
  const baseUrl = useAuthBase ? config.authApiBaseUrl : config.apiBaseUrl;
  const target = resolveBackendUrl(baseUrl, path);
  const forwardedClient = await forwardedClientHeaders();
  const headers = new Headers({
    ...forwardedClient,
    accept: "application/json",
    ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
  });
  new Headers(init.headers).forEach((value, name) => headers.set(name, value));
  // The BFF's client credential goes to the auth base only — every request
  // there, not just the endpoints the backend checks today (RUK-311). Applied
  // last, so a caller's header of the same name cannot replace it.
  if (useAuthBase) {
    applyBackendS2SHeaders(headers);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    let response: Response;
    let body: string;

    try {
      response = await fetch(target, {
        ...init,
        // Combined, not overwritten. Spreading `...init` and then assigning
        // `signal` silently discarded any caller-supplied deadline, so a route
        // asking for a tighter bound than the shared default got the default
        // anyway — a fix that looked applied and did nothing.
        signal: init.signal
          ? AbortSignal.any([init.signal as AbortSignal, controller.signal])
          : controller.signal,
        headers,
      });
      body = await response.text();
    } catch (error) {
      if (isBackendTransportError(error)) {
        throw new BackendUnavailableError(error);
      }
      throw error;
    }

    if (response.status === 401) {
      if (useAuthBase) {
        reportRejectedClientCredential(path, body);
      }
      throw new BackendUnauthorizedError(body || response.statusText);
    }

    if (!response.ok) {
      throw new BackendRequestError(response.status, body || response.statusText);
    }

    if (!body) {
      return undefined as TResponse;
    }
    try {
      return JSON.parse(body) as TResponse;
    } catch {
      throw new BackendRequestError(response.status, body);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function isBackendTransportError(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TypeError");
}
