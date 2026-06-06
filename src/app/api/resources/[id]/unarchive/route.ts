import { handleResourceLifecycle } from "../archive-action";

/** POST /api/resources/{id}/unarchive — proxy to `POST /api/v1/resource/{id}/unarchive`. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleResourceLifecycle(request, id, "unarchive");
}
