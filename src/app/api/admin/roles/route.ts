import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { requireAdminSession } from "@/server/auth/require-admin";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { mapRolesList } from "@/server/backend/contracts/users-mapper";
import type { ListRolesResponseDto } from "@/server/backend/contracts/users-dto";

/**
 * GET /api/admin/roles — proxy to auth `GET /api/v1/roles`. Returns the
 * assignable role list as a plain `Role[]` (the wire `roles` is a string enum
 * array, whitelisted to `guest | editor | reviewer | admin` in the mapper).
 */
export async function GET() {
  try {
    await requireAdminSession();
    const data = await authenticatedBackendRequest<ListRolesResponseDto>({
      path: "/api/v1/roles",
      method: "GET",
      useAuthBase: true,
    });
    return NextResponse.json({ roles: mapRolesList(data ?? {}) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
