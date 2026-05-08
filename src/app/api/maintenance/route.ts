import { NextResponse } from "next/server";

import { backendRequest } from "@/server/backend/client/backend-client";
import type {
  BackendCalendarViewResponseDto,
  BackendCreateDraftMaintResponseDto,
  BackendMaintenanceViewResponseDto,
} from "@/server/backend/contracts/maintenance.contracts";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { normalizeCalendarResponse, normalizeMaintenanceView } from "@/server/backend/maintenance/adapters";
import { buildCalendarBackendQuery } from "@/server/backend/maintenance/calendar-query";
import { buildMaintenanceWritePayload } from "@/server/backend/maintenance/write-payload";
import { loadResources } from "@/server/backend/resources/resources-service";

export async function GET(request: Request) {
  try {
    const { path, scope } = buildCalendarBackendQuery(request.url);
    const [backendResponse, resources] = await Promise.all([
      backendRequest<BackendCalendarViewResponseDto>({
        method: "GET",
        path,
      }),
      loadResources(),
    ]);

    const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
    const normalized = normalizeCalendarResponse(backendResponse, resourcesById);
    const maintenances = scope
      ? normalized.maintenances.filter((maintenance) => maintenance.scope === scope)
      : normalized.maintenances;

    return NextResponse.json({
      maintenances,
      resources,
      meta: {
        ...normalized.meta,
        count: maintenances.length,
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const payload = await buildMaintenanceWritePayload(body, () => loadResources());
    const response = await backendRequest<BackendCreateDraftMaintResponseDto>({
      method: "POST",
      path: "/api/v1/maintenances/create",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const detailResponse = await backendRequest<BackendMaintenanceViewResponseDto>({
      method: "GET",
      path: `/ui/v1/maintenances/${encodeURIComponent(response.id)}`,
    });

    return NextResponse.json(normalizeMaintenanceView(detailResponse), { status: 201 });
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
