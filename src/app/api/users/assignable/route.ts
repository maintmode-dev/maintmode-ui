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

    // A body without a `users` ARRAY is a broken response, not an empty roster —
    // the distinction RUK-270 exists to restore. The previous `?? []` normalised
    // `{}` and `{"users": null}` into a well-formed `{users: [], total: 0}`, so
    // the picker said "No people found." — a claim about the company rather than
    // about a failed load, and one no hook-level guard could undo, because by
    // then the malformed shape was already gone (SPEC §1).
    //
    // Rejecting this cannot break a legitimately empty roster: the backend's
    // `users` tag carries no `omitempty` and its handler maps through `lo.Map`,
    // which returns a non-nil empty slice, so "nobody" serialises as
    // `{"users": []}` (SPEC §1.1, measured against the backend source).
    if (!Array.isArray(dto?.users)) {
      throw new Error("Backend returned no `users` array for GET /api/v1/users/assignable");
    }

    const users: AssignableUser[] = dto.users.map(mapAssignableUser);
    return NextResponse.json({ users, total: dto.total ?? users.length });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
