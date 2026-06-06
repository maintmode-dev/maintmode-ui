import { handleRoleMutation } from "../role-mutation";

/** POST /api/admin/roles/assign — proxy to auth `POST /api/v1/roles/assign`. */
export async function POST(request: Request) {
  return handleRoleMutation(request, "assign");
}
