import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { requireAdminSession } from "@/server/auth/require-admin";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { mapUsersPage } from "@/server/backend/contracts/users-mapper";
import type { ListUsersResponseDto } from "@/server/backend/contracts/users-dto";

/**
 * GET /api/admin/users — proxy to auth `GET /api/v1/users/list` (admin-only).
 *
 * Returns the reconciled domain `ListUsersPage` ({ users, limit, offset,
 * total }) so the browser never sees the wire `apimodels.User` shape (blocking
 * via nullable `blocked_at`, role strings whitelisted in the mapper).
 *
 * Forwards only the documented query params (search, roles, limit, offset,
 * active); `limit` is clamped to the backend max of 200.
 */
const ALLOWED_PARAMS = new Set(["search", "roles", "limit", "offset", "active"]);
const MAX_LIMIT = 200;

export async function GET(request: Request) {
  try {
    await requireAdminSession();

    const url = new URL(request.url);
    const forwarded = new URLSearchParams();
    for (const [key, value] of url.searchParams.entries()) {
      if (!ALLOWED_PARAMS.has(key) || value === "") {
        continue;
      }
      if (key === "limit") {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) {
          forwarded.set("limit", String(Math.min(Math.trunc(parsed), MAX_LIMIT)));
        }
        continue;
      }
      forwarded.append(key, value);
    }

    const qs = forwarded.toString();
    const data = await authenticatedBackendRequest<ListUsersResponseDto>({
      path: `/api/v1/users/list${qs ? `?${qs}` : ""}`,
      method: "GET",
      useAuthBase: true,
    });
    return NextResponse.json(mapUsersPage(data ?? {}));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
