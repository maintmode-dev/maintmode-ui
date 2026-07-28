import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { buildUserTagsBody } from "@/server/backend/contracts/user-tags-body";
import { mapUser } from "@/server/backend/contracts/users-mapper";
import { readCappedJsonBody } from "@/server/backend/http/read-json-body";
import { requireAdminSession } from "@/server/auth/require-admin";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { isSameOriginRequest } from "@/server/backend/security/csrf";
import type { AuthUserDto } from "@/server/backend/contracts/users-dto";

// The body is two tags of at most 64 chars each. Cap the forwarded payload so a
// crafted request can't buffer arbitrary memory on the BFF before relaying it.
const MAX_BODY_BYTES = 4 * 1024;

/**
 * PATCH /api/admin/users/{id} — proxy to auth `PATCH /api/v1/users/{id}`
 * (admin-only, scenario `auth.users.manage`). Lets an admin fix ANOTHER user's
 * messenger tags (SPEC §1.3).
 *
 * The body is rebuilt by `buildUserTagsBody` rather than forwarded, so only
 * `telegram_tag`/`slack_tag` can ever reach the backend — `timezone` is
 * structurally unreachable (AC11). That matters because the backend has no
 * `DisallowUnknownFields` and would silently accept-and-ignore it.
 *
 * The 200 response is `apimodels.User` in its `omitempty` form — a cleared tag
 * comes back as an ABSENT key, not `null` (SPEC §1.1) — so it goes through
 * `mapUser` before being returned, making it spliceable into the admin list
 * cache.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  try {
    await requireAdminSession();
    const { id } = await params;
    const parsed = await readCappedJsonBody<unknown>(request, MAX_BODY_BYTES);
    const body = buildUserTagsBody(parsed);

    const data = await authenticatedBackendRequest<AuthUserDto>({
      path: `/api/v1/users/${encodeURIComponent(id)}`,
      method: "PATCH",
      useAuthBase: true,
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
    return NextResponse.json(mapUser(data ?? ({ id } as AuthUserDto)));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
