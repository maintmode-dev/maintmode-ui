import { handleInvitationAction } from "@/server/backend/invitations/lifecycle-action";

/**
 * POST /api/admin/invitations/{id}/resend — proxy to auth backend
 * `POST /api/v1/users/invitations/{id}/resend` (admin). Returns 204. A 409
 * means the invitation is not pending (expired/accepted/revoked).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleInvitationAction(request, id, "resend");
}
