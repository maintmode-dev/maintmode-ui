import { handleInvitationAction } from "@/server/backend/invitations/lifecycle-action";

/**
 * POST /api/admin/invitations/{id}/revoke — proxy to auth backend
 * `POST /api/v1/users/invitations/{id}/revoke` (admin). Returns 204
 * (idempotent for already-revoked). A 409 means the invitation was already
 * accepted.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleInvitationAction(request, id, "revoke");
}
