"use client";

import { useMemo } from "react";

import { useCalendarQuery } from "./use-calendar-query";

/**
 * The "Related maintenance" feed shared by the resource- and channel-detail
 * pages: a bounded calendar window filtered server-side by one entity id.
 *
 * This lives in a hook of its own so the detail pages can call it ABOVE their
 * early returns. Both pages return a skeleton while their own detail query is
 * pending; when the calendar query lived inside the related-section child
 * (rendered below that return, and additionally behind `mode === "view"`), the
 * hook did not mount until the detail fetch resolved. The two requests hit
 * unrelated endpoints and share no data dependency — the related feed needs
 * only the entity id, which the page already has in props — so the serialization
 * was pure waterfall: two double hops (browser → Next route handler → backend)
 * back to back instead of side by side.
 *
 * Keeping the window and the query together here is what makes that structural:
 * the caller gets one hook to place above its returns, and no future early
 * return can re-serialize the pair without deleting a visible line.
 */

/**
 * Window for the related feed. The calendar endpoint requires `from`/`to` AND
 * caps the interval at 90 days. The cap is checked AFTER the backend expands
 * `to` to end-of-day, so a span of exactly 90 calendar dates is ~90d+24h and
 * gets rejected (`invalid period interval: should be less or equal than 90
 * days`) — empirically the largest accepted `to − from` is **89 dates**. We
 * stay safely under it (59 + 30 = 89) and bias toward the recent past + near
 * future to surface just-finished and soon-upcoming maintenance — the two
 * cohorts the Active / Past tabs care about.
 *
 * NOTE: this is a bounded view, not "all maintenance ever" for the entity. A
 * wider history would need either a paginated per-entity endpoint or multiple
 * stitched ≤89-day calendar calls.
 */
const PAST_WINDOW_DAYS = 59;
const FUTURE_WINDOW_DAYS = 30;

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Filter for the related feed — exactly one of the calendar's entity filters.
 * Kept as a discriminated shape so a caller cannot accidentally request the
 * unfiltered calendar (which would be a much larger response) by omitting it.
 */
export type RelatedMaintenanceFilter =
  | { resourceId: string; channelId?: never }
  | { channelId: string; resourceId?: never };

export type RelatedMaintenanceFeed = ReturnType<typeof useRelatedMaintenanceQuery>;

export function useRelatedMaintenanceQuery(filter: RelatedMaintenanceFilter) {
  const { from, to } = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - PAST_WINDOW_DAYS);
    const end = new Date(now);
    end.setDate(end.getDate() + FUTURE_WINDOW_DAYS);
    return { from: toIsoDate(start), to: toIsoDate(end) };
  }, []);

  // Spread the entity filter into the same param shape the sections used before
  // the hoist, so `calendarKey` — and therefore the cache entry and the request
  // URL — is byte-for-byte unchanged.
  const query = useCalendarQuery({
    from,
    to,
    ...(filter.resourceId ? { resourceIds: [filter.resourceId] } : {}),
    ...(filter.channelId ? { channelIds: [filter.channelId] } : {}),
  });

  return { from, to, query };
}
