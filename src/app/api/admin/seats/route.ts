import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { requireAdminSession } from "@/server/auth/require-admin";

/**
 * GET /api/admin/seats — proxy to auth backend `GET /api/v1/license/seats`
 * (admin). Returns the licensed-seat state BE-shaped —
 * `{ seats_purchased, seats_used, seats_pending, seats_occupied, unlimited }` —
 * which `useSeatsQuery` consumes directly.
 *
 * Read-only, so no CSRF gate: the handler has no side effects, and the body is
 * a flat JSON object rather than a top-level array, so there is no
 * JSON-hijacking surface. What stops a cross-origin read is the session
 * cookie's `SameSite=Lax` plus the absence of any CORS headers — note it is
 * *not* `bffFetch`'s `credentials: "same-origin"`, which constrains our own
 * client and not an attacker's, who would simply send `credentials: "include"`.
 * The reasoning is per-route rather than "GET never needs one": a GET with side
 * effects, or one echoing a top-level array, would need the gate.
 *
 * The backend gates this on `auth.users.read`, the same scenario as the users
 * list this page already renders, so an admin who can see the page can always
 * read the counters. It sits outside the license block gate on purpose: under a
 * blocked license an admin must still see what is going on with their seats.
 */
export async function GET() {
  try {
    await requireAdminSession();
    const data = await authenticatedBackendRequest<unknown>({
      path: "/api/v1/license/seats",
      method: "GET",
      // Auth-service prefix, like /api/v1/users/* — NOT the maintmode API base.
      useAuthBase: true,
    });
    return NextResponse.json(data);
  } catch (error) {
    return routeErrorResponse(error);
  }
}
