import { NextResponse } from "next/server";

import { loadUserRoles } from "@/server/backend/admin/admin-service";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { requireAdminSession } from "@/server/auth/require-admin";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminSession();
    const { id } = await context.params;
    const roles = await loadUserRoles(id);
    return NextResponse.json({ roles });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
