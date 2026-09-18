import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { requireAdminSession } from "@/server/auth/require-admin";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { BackendRequestError } from "@/server/backend/errors/backend-request-error";
import { isKnownAuthMethod } from "@/domain/auth/auth-method-settings";
import type { AuthMethodSettingsResponseDto } from "@/server/backend/contracts/auth-methods-dto";

/**
 * GET /api/admin/auth-methods — proxy to `GET /api/v1/auth/settings` on the
 * AUTH backend. Admin-only. Returns `{ methods: [...] }` verbatim.
 *
 * ## `useAuthBase: true` is load-bearing
 *
 * Without it `backendRequest` resolves against `MAINTMODE_API_BASE_URL` (the
 * maintmode backend), where this path does not exist — so the route would 404.
 * That symptom is indistinguishable from "the backend branch has not merged
 * yet", which this feature legitimately produces before its backend ships, so
 * the misconfiguration would ship looking like the expected state.
 *
 * ## No mapper, and no narrowing
 *
 * The wire shape is already the shape the screen renders, so the body is passed
 * through. In particular an unknown `method` is NOT filtered out: a row here is
 * a sign-in path already in force, and dropping it would hide it from the one
 * person who can turn it off. It is logged instead, because it means the
 * backend has learned a method this build has not.
 *
 * An empty `methods` array is also passed through untouched. The migration
 * seeds both rows, so an empty list is a fault — but it is the browser that
 * says so (the query throws); a route that second-guessed a 200 would be
 * inventing an error the backend did not report.
 */
export async function GET() {
  try {
    await requireAdminSession();
    const dto = await authenticatedBackendRequest<AuthMethodSettingsResponseDto>({
      path: "/api/v1/auth/settings",
      method: "GET",
      useAuthBase: true,
    });

    const methods = dto?.methods ?? [];
    const unknown = methods.filter((m) => !isKnownAuthMethod(m.method)).map((m) => m.method);
    if (unknown.length > 0) {
      // `warn`, not `error`: the route deliberately passes the row through, so
      // this is drift arriving rather than a failure. It fires per request
      // while the condition lasts, which on an admin-only screen is acceptable
      // noise for a signal that the backend has moved ahead of this build.
      console.warn("[auth-methods] backend listed methods this build does not know", { unknown });
    }

    return NextResponse.json(dto);
  } catch (error) {
    // A 404 here means the ENDPOINT is missing, not a method — the backend
    // predates this feature. Logged because the screen's copy for it is the
    // operator's only other clue, and it is easy to misread as a stale row.
    if (error instanceof BackendRequestError && error.status === 404) {
      console.error("[auth-methods] GET /api/v1/auth/settings is missing — backend not deployed");
    }
    return routeErrorResponse(error);
  }
}
