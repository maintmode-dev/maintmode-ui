import { NextResponse } from "next/server";
import { z } from "zod";

import { ROLES } from "@/domain/admin/models/role";
import { assignRole } from "@/server/backend/admin/admin-service";
import { BffValidationError, routeErrorResponse } from "@/server/backend/errors/bff-error";
import { requireAdminSession } from "@/server/auth/require-admin";

const roleMutationSchema = z.object({
  user_id: z.string().trim().min(1, "user_id is required"),
  role: z.enum(ROLES),
});

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const body = await readJsonBody(request);
    const parsed = roleMutationSchema.safeParse(body);
    if (!parsed.success) {
      throw new BffValidationError(
        parsed.error.issues.map((issue) => ({
          field: issue.path.join(".") || "_root",
          message: issue.message,
        })),
      );
    }

    await assignRole(parsed.data);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
