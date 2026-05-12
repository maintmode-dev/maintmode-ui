import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import type { BackendMaintenanceViewResponseDto } from "@/server/backend/contracts/maintenance.contracts";
import { BffValidationError, routeErrorResponse } from "@/server/backend/errors/bff-error";
import { normalizeMaintenanceView } from "@/server/backend/maintenance/adapters";

type ActionRouteContext = {
  params: Promise<{
    id: string;
    action: string;
  }>;
};

const VALID_ACTIONS = ["approve", "start", "finish", "cancel"] as const;
type MaintenanceAction = (typeof VALID_ACTIONS)[number];

const VALID_CANCEL_REASONS = [
  "conflict",
  "incident",
  "business_decision",
  "rescheduled",
  "mistake",
] as const;
type CancelReason = (typeof VALID_CANCEL_REASONS)[number];

export async function POST(request: Request, context: ActionRouteContext) {
  try {
    const { id, action } = await context.params;
    if (!isValidAction(action)) {
      throw new BffValidationError([{ field: "action", message: "must be approve, start, finish, or cancel" }]);
    }
    const body = await readJsonBody(request);
    const backendBody = buildBackendActionBody(action, body);

    await authenticatedBackendRequest<void>({
      method: "POST",
      path: `/api/v1/maintenances/${encodeURIComponent(id)}/${action}`,
      headers: backendBody ? { "content-type": "application/json" } : undefined,
      body: backendBody ? JSON.stringify(backendBody) : undefined,
    });

    const detailResponse = await authenticatedBackendRequest<BackendMaintenanceViewResponseDto>({
      method: "GET",
      path: `/ui/v1/maintenances/${encodeURIComponent(id)}`,
    });

    return NextResponse.json(normalizeMaintenanceView(detailResponse));
  } catch (error) {
    return routeErrorResponse(error);
  }
}

function isValidAction(value: string): value is MaintenanceAction {
  return (VALID_ACTIONS as readonly string[]).includes(value);
}

const CANCEL_COMMENT_MAX_LENGTH = 2000;

function buildBackendActionBody(action: MaintenanceAction, body: Record<string, unknown>) {
  if (action === "cancel") {
    const reason = readString(body.reason);
    const comment = readString(body.comment) ?? "";
    if (!reason) {
      throw new BffValidationError([{ field: "reason", message: "is required for cancel" }]);
    }
    if (!isValidCancelReason(reason)) {
      throw new BffValidationError([
        { field: "reason", message: `must be one of ${VALID_CANCEL_REASONS.join(", ")}` },
      ]);
    }
    if (comment.length > CANCEL_COMMENT_MAX_LENGTH) {
      throw new BffValidationError([
        {
          field: "comment",
          message: `must be at most ${CANCEL_COMMENT_MAX_LENGTH} characters`,
        },
      ]);
    }
    return { reason, comment };
  }
  if (action === "approve") {
    const observedRevision = readNumber(body.observed_maint_revision ?? body.observedRevision);
    if (observedRevision === undefined) {
      throw new BffValidationError([
        { field: "observed_maint_revision", message: "is required for approve" },
      ]);
    }
    return {
      observed_maint_revision: observedRevision,
      conflicts_snapshot: Array.isArray(body.conflicts_snapshot) ? body.conflicts_snapshot : [],
    };
  }
  return undefined;
}

function isValidCancelReason(value: string): value is CancelReason {
  return (VALID_CANCEL_REASONS as readonly string[]).includes(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = (await request.json()) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}
