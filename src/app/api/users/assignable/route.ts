import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { mapAssignableUser } from "@/server/backend/contracts/maintenance-mapper";
import type { ListAssignableUsersResponseDto } from "@/server/backend/contracts/maintmode-dto";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import type { AssignableUser } from "@/domain/maintenance/maintenance";

/**
 * GET /api/users/assignable — proxy to backend `GET /api/v1/users/assignable`.
 *
 * Backs the approver picker on the maintenance create/edit form. Forwards the
 * optional `search`, repeated `roles`, `limit` and `offset` filters; the
 * backend answers `uimodels.ListAssignableUsersResponse`
 * (`{ users, limit, offset, total }`), which `mapAssignableUser` projects into
 * the domain `AssignableUser[]` the picker consumes under `{ users }`.
 *
 * Inputs are sanitized before forwarding: `limit`/`offset` must be
 * non-negative integers, and the repeated `roles` filter is capped so a
 * crafted request can't amplify into an unbounded backend query string.
 */
const MAX_FILTER_VALUES = 32;

function forwardInt(target: URLSearchParams, source: URLSearchParams, key: string): void {
  const raw = source.get(key);
  if (raw && /^\d+$/.test(raw)) target.set(key, raw);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const backendQuery = new URLSearchParams();

    const search = url.searchParams.get("search");
    if (search) backendQuery.set("search", search);
    for (const role of url.searchParams.getAll("roles").slice(0, MAX_FILTER_VALUES)) {
      if (role) backendQuery.append("roles", role);
    }
    forwardInt(backendQuery, url.searchParams, "limit");
    forwardInt(backendQuery, url.searchParams, "offset");

    const qs = backendQuery.toString();
    const dto = await authenticatedBackendRequest<ListAssignableUsersResponseDto>({
      path: `/api/v1/users/assignable${qs ? `?${qs}` : ""}`,
      method: "GET",
    });

    const users: AssignableUser[] = (dto.users ?? []).map(mapAssignableUser);
    return NextResponse.json({ users, total: dto.total ?? users.length });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
