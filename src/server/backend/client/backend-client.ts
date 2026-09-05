import "server-only";

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
   * token from the active NextAuth session.
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
        headers: {
          accept: "application/json",
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
          ...init.headers,
        },
      });
      body = await response.text();
    } catch (error) {
      if (isBackendTransportError(error)) {
        throw new BackendUnavailableError(error);
      }
      throw error;
    }

    if (response.status === 401) {
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
