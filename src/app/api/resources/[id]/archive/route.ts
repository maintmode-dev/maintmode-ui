import { handleResourceLifecycle } from "../archive-action";

/** POST /api/resources/{id}/archive — proxy to `POST /api/v1/resource/{id}/archive`. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleResourceLifecycle(request, id, "archive");
}
