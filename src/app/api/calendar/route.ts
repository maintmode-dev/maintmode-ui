import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { mapCalendarResponse } from "@/server/backend/contracts/maintenance-mapper";
import type { CalendarViewMetaDto, CalendarViewResponseDto } from "@/server/backend/contracts/maintmode-dto";
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
 * `mapCalendarResponse` adapter projects into the domain `CalendarEvent[]` the
 * UI's `useCalendarQuery` expects under `{ items }`.
 *
 * `meta` (`{ count, truncated }`) is PROJECTED next to `items`, the same way
 * `mapCalendarResponse` projects `events` — the backend caps the calendar at
 * 1000 events and reports the cap there, so dropping it left the UI unable to
 * tell a truncated window from a complete one and silently hiding work past the
 * cap (RUK-252). It stays OPTIONAL: the field is omitted entirely when the
 * backend sends none, so `items` is unaffected.
 *
 * Projected rather than spread verbatim because `count` reaches the DOM (the
 * truncation notice renders the number), and this route is the boundary where
 * backend responses stop being trusted. `truncated` narrows to a real boolean
 * so an off-contract truthy value can't become a claim, and `count` is dropped
 * unless it is a finite number.
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

/**
 * Narrow the backend's `meta` to the two fields the UI reads, or `undefined`
 * when there is nothing trustworthy to report.
 *
 * The DTO types both fields as optional, but this is parsed JSON — the types
 * describe the contract, not what actually arrived. `truncated` becomes a real
 * boolean (`=== true`), so a string or a number can never reach the UI's
 * strict check and be mistaken for a claim; `count` survives only as a finite
 * number, since it is rendered into the notice's copy.
 */
function projectMeta(meta: CalendarViewMetaDto | undefined) {
  if (!meta) return undefined;
  const count = meta.count;
  return {
    truncated: meta.truncated === true,
    ...(typeof count === "number" && Number.isFinite(count) ? { count } : {}),
  };
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

    const meta = projectMeta(dto.meta);

    return NextResponse.json({
      items: mapCalendarResponse(dto),
      ...(meta ? { meta } : {}),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
