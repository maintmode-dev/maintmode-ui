import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import type { BackendMaintenanceViewResponseDto } from "@/server/backend/contracts/maintenance.contracts";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { normalizeMaintenanceView } from "@/server/backend/maintenance/adapters";
import { buildMaintenanceWritePayload } from "@/server/backend/maintenance/write-payload";
import { loadResources } from "@/server/backend/resources/resources-service";

type MaintenanceRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: MaintenanceRouteContext) {
  try {
    const { id } = await context.params;
    const detailResponse = await authenticatedBackendRequest<BackendMaintenanceViewResponseDto>({
      method: "GET",
      path: `/ui/v1/maintenances/${encodeURIComponent(id)}`,
    });

    return NextResponse.json(normalizeMaintenanceView(detailResponse));
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: MaintenanceRouteContext) {
  try {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    const payload = await buildMaintenanceWritePayload(body, () => loadResources());

    await authenticatedBackendRequest<void>({
      method: "POST",
      path: `/api/v1/maintenances/${encodeURIComponent(id)}/edit`,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
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

export const PUT = PATCH;

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
