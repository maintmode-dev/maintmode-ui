import { handleChannelLifecycle } from "../archive-action";

/** POST /api/notifications/channels/{id}/archive — proxy to backend archive. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleChannelLifecycle(request, id, "archive");
}
