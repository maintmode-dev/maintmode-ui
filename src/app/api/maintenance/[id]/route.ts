import { notImplemented } from "@/app/api/_shared/not-implemented";

type MaintenanceRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: MaintenanceRouteContext) {
  const { id } = await context.params;

  return notImplemented(`/api/maintenance/${encodeURIComponent(id)}`);
}

export async function PATCH(_request: Request, context: MaintenanceRouteContext) {
  const { id } = await context.params;

  return notImplemented(`/api/maintenance/${encodeURIComponent(id)}`);
}
