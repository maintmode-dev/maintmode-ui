import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { mapCalendarResponse } from "@/server/backend/contracts/maintenance-mapper";
import type { CalendarViewResponseDto } from "@/server/backend/contracts/maintmode-dto";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";

/**
 * GET /api/calendar — proxy to backend `GET /ui/v1/calendar`.
 *
 * The backend requires `from`/`to` as `YYYY-MM-DD` dates (not ISO datetimes),
 * as an inclusive day range (`to` is expanded to end-of-day server-side), and
 * optionally accepts repeated `statuses` / `resource_ids` / `channel_ids`
 * filters (the last powers the ChannelDetailPage "Related maintenance" section,
 * matched server-side by channel). It
 * answers with `uimodels.CalendarViewResponse` (`{ events, meta }`), which the
 * `mapCalendarResponse` adapter projects into the domain `Maintenance[]` the
 * UI's `useCalendarQuery` expects under `{ items }`.
 *
 * Inputs are sanitized before forwarding: `from`/`to` must match `YYYY-MM-DD`
 * (anything else is dropped, leaving the backend to apply its defaults), and
 * the repeated `statuses`/`resource_ids`/`channel_ids` filters are capped so a
 * crafted request can't amplify into an unbounded backend query string.
 */
const DATE_PARAM = /^\d{4}-\d{2}-\d{2}$/;
const MAX_FILTER_VALUES = 100;

function forwardFilter(target: URLSearchParams, key: string, values: string[]): void {
  for (const value of values.slice(0, MAX_FILTER_VALUES)) {
    if (value) target.append(key, value);
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const backendQuery = new URLSearchParams();

    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (from && DATE_PARAM.test(from)) backendQuery.set("from", from);
    if (to && DATE_PARAM.test(to)) backendQuery.set("to", to);
    forwardFilter(backendQuery, "statuses", url.searchParams.getAll("statuses"));
    forwardFilter(backendQuery, "resource_ids", url.searchParams.getAll("resource_ids"));
    forwardFilter(backendQuery, "channel_ids", url.searchParams.getAll("channel_ids"));

    const qs = backendQuery.toString();
    const dto = await authenticatedBackendRequest<CalendarViewResponseDto>({
      path: `/ui/v1/calendar${qs ? `?${qs}` : ""}`,
      method: "GET",
    });

    return NextResponse.json({ items: mapCalendarResponse(dto) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
