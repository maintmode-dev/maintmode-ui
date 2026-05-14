import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AUDIT_LIMIT_MAX,
  loadAuditLog,
} from "@/server/backend/audit/audit-service";
import { BffValidationError, routeErrorResponse } from "@/server/backend/errors/bff-error";
import { requireAdminSession } from "@/server/auth/require-admin";

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(AUDIT_LIMIT_MAX).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  action: z.string().trim().min(1).optional(),
  actor: z.string().trim().min(1).optional(),
  created_from: z.string().datetime({ offset: true }).optional(),
  created_to: z.string().datetime({ offset: true }).optional(),
});

export async function GET(request: Request) {
  try {
    await requireAdminSession();
    const { searchParams } = new URL(request.url);
    const raw = {
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
      action: searchParams.get("action") ?? undefined,
      actor: searchParams.get("actor") ?? undefined,
      created_from: searchParams.get("created_from") ?? undefined,
      created_to: searchParams.get("created_to") ?? undefined,
    };
    const parsed = auditQuerySchema.safeParse(raw);
    if (!parsed.success) {
      throw new BffValidationError(
        parsed.error.issues.map((issue) => ({
          field: issue.path.join(".") || "_root",
          message: issue.message,
        })),
      );
    }

    const logs = await loadAuditLog({
      limit: parsed.data.limit,
      offset: parsed.data.offset,
      action: parsed.data.action,
      actor: parsed.data.actor,
      createdFrom: parsed.data.created_from,
      createdTo: parsed.data.created_to,
    });

    return NextResponse.json({ logs });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
