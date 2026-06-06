import { handleRoleMutation } from "../role-mutation";

/** POST /api/admin/roles/revoke — proxy to auth `POST /api/v1/roles/revoke`. */
export async function POST(request: Request) {
  return handleRoleMutation(request, "revoke");
}
