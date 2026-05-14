import { NextResponse } from "next/server";

import { loadRolesCatalog } from "@/server/backend/admin/admin-service";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { requireAdminSession } from "@/server/auth/require-admin";

export async function GET() {
  try {
    await requireAdminSession();
    const roles = await loadRolesCatalog();
    return NextResponse.json({ roles });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
