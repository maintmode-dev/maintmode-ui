import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { requireAdminSession } from "@/server/auth/require-admin";
import { isSameOriginRequest } from "@/server/backend/security/csrf";

const ALLOWED_STATUS = new Set(["pending", "expired", "accepted", "revoked"]);

// Invite payload is `{ email, roles[] }` — tiny. Cap the forwarded body so a
// crafted request can't buffer arbitrary memory on the BFF before relaying it.
const MAX_BODY_BYTES = 8 * 1024;

/**
 * GET /api/admin/invitations — proxy to auth backend
 * `GET /api/v1/users/invitations` (admin). Optional `?status=` filter
 * (`pending|expired|accepted|revoked`) is forwarded verbatim. The backend
 * returns `{ invitations: Invitation[] }` (BE-shaped), which the frontend
 * `useInvitationsQuery` consumes directly.
 */
export async function GET(request: Request) {
  try {
    await requireAdminSession();
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    if (status !== null && !ALLOWED_STATUS.has(status)) {
      return NextResponse.json(
        { error: "Unknown invitation status filter", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    const data = await authenticatedBackendRequest<unknown>({
      path: `/api/v1/users/invitations${qs}`,
      method: "GET",
      useAuthBase: true,
    });
    return NextResponse.json(data);
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/**
 * POST /api/admin/invitations — proxy to auth backend
 * `POST /api/v1/users/invite` (admin). Body `{ email, roles[] }`; backend
 * returns `201 CreateInvitationResponse`. A 409 (user exists / active-invite
 * conflict) propagates through `routeErrorResponse` to a toast in the hook.
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  try {
    await requireAdminSession();

    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Request body too large", code: "BODY_TOO_LARGE" }, { status: 413 });
    }
    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Request body too large", code: "BODY_TOO_LARGE" }, { status: 413 });
    }

    const data = await authenticatedBackendRequest<unknown>({
      path: "/api/v1/users/invite",
      method: "POST",
      useAuthBase: true,
      body: body.length ? body : undefined,
      headers: body.length ? { "content-type": "application/json" } : undefined,
    });
    return NextResponse.json(data ?? { ok: true }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
