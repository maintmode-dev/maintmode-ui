import "server-only";

import { backendRequest, type BackendRequestOptions } from "@/server/backend/client/backend-client";
import { BackendUnauthorizedError } from "@/server/backend/errors/backend-request-error";
import { readActiveSession, forceSessionRefresh } from "@/server/auth/session-token";

/**
 * Authenticated backend request used by every BFF route handler outside
 * `src/app/api/auth/**`.
 *
 * Behavior:
 *  - Reads the active NextAuth session server-side and attaches the backend
 *    `access_token` as `Authorization: Bearer ...`.
 *  - When the backend responds with `401`, attempts exactly one
 *    refresh-and-retry pass via `forceSessionRefresh`. Concurrent BFF
 *    calls share a single in-flight refresh promise (see
 *    `session-token.ts`) so we do not hammer the backend `/refresh`
 *    endpoint.
 *  - The retry is skipped when `forceSessionRefresh` returned the same
 *    access token we already failed with (refresh stampede / token reuse
 *    guard) — without this guard a transient backend bug could lock both
 *    callers in a hot retry loop on an unchanged token.
 *  - When there is no session, or the refresh still yields `401`, throws
 *    `BackendUnauthorizedError` so `routeErrorResponse` returns a
 *    normalized `{ status: 401, code: "AUTH_REQUIRED" }` payload.
 */
export async function authenticatedBackendRequest<TResponse>(
  options: Omit<BackendRequestOptions, "accessToken">,
): Promise<TResponse> {
  const session = await readActiveSession();
  if (!session) {
    throw new BackendUnauthorizedError("no active session");
  }

  try {
    return await backendRequest<TResponse>({ ...options, accessToken: session.accessToken });
  } catch (error) {
    if (!(error instanceof BackendUnauthorizedError)) {
      throw error;
    }
    const refreshed = await forceSessionRefresh();
    if (!refreshed) {
      throw error;
    }
    if (refreshed.accessToken === session.accessToken) {
      // Refresh produced the same token we already failed with. Retrying is
      // pointless and only amplifies load against the backend.
      throw new BackendUnauthorizedError("refresh returned the same access token");
    }
    return backendRequest<TResponse>({ ...options, accessToken: refreshed.accessToken });
  }
}
