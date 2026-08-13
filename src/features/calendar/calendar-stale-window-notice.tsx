import { RefreshCw, TriangleAlert } from "lucide-react";
import type { ReactElement } from "react";

import { Alert, AlertDescription } from "@/shared/ui/shadcn/alert";
import { Button } from "@/shared/ui/shadcn/button";

/**
 * The events on screen belong to a window the header no longer names.
 *
 * Stepping the calendar keeps the previous window's events on screen while the
 * next one loads (`keepPreviousData`, RUK-260) — the header, the anchor and the
 * grid all move on the click, but the DATA lags the request. For an ordinary
 * step that lasts a few hundred ms and is exactly what we want: no skeleton
 * flash. When it lasts, the operator is reading one period's dates over another
 * period's work, with nothing on screen saying so (RUK-267).
 *
 * The copy states only what the flags prove. `isPlaceholderData` says the shown
 * data came from a different query key; it does NOT say the new request failed —
 * it may simply be slow, and on a dead session it never settles at all
 * (`bff-fetch.ts` returns a promise that never resolves so the UI cannot flash
 * an error mid-redirect). So this says "still loading", not "couldn't load":
 * claiming a failure the system has not observed is the same class of lie as
 * showing the events without a warning.
 *
 * Deliberately NOT modelled on `CalendarError`. That one is a full-screen
 * `Stack` that replaces the view, which here would throw away the context the
 * operator stepped into — the whole reason this is a banner and not an error
 * state.
 */
const STALE_WINDOW_MESSAGE = "Still loading this period — showing the last loaded events.";

export interface CalendarStaleWindowNoticeProps {
  /**
   * Retry the window. The page owns what this means: a bare `refetch()` is a
   * no-op against a request that is still in flight, so the handler has to
   * cancel first (see `calendar-page.tsx`). This component stays unaware of
   * TanStack entirely.
   */
  onRetry: () => void;
}

export function CalendarStaleWindowNotice({ onRetry }: CalendarStaleWindowNoticeProps): ReactElement {
  return (
    <Alert
      data-testid="calendar-stale-window-notice"
      variant="warning"
      // `role="status"`, overriding Alert's default `role="alert"`. Same call as
      // the truncation notice: this reports a condition of the view rather than
      // an outcome of something the operator just did, and an assertive region
      // would talk over whatever the screen reader is working through.
      //
      // Known limit, accepted: a live region announces the node ARRIVING but not
      // its removal, so a screen-reader operator hears this appear and gets no
      // announcement when the window recovers.
      role="status"
      // Absolutely positioned so it does NOT take space in the flow. The grid
      // below is a fixed `calc(100vh-13rem)`; a banner added to the column would
      // push it down and give the page a scrollbar — 1.5s after the click, under
      // a cursor already aiming at the next chevron.
      //
      // `top-14`, not `top-2`: FullCalendar's day-header row (Mon 8/17, Tue
      // 8/18…) sits at the very top of the grid, and floating the banner there
      // covered it — measured in the browser, notice 140-182px against a header
      // row at 138-168px. A banner about which DATES the events belong to must
      // not be drawn over those dates. So it hangs just below the header, over
      // the scrollable body, where it obscures only event area — of which there
      // is a whole grid's worth, and which is stale anyway.
      className="absolute inset-x-2 top-14 z-10 flex items-center gap-3 px-3 py-2 text-xs shadow-md [&>svg]:size-3.5"
    >
      <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
      {/*
        `text-fg` rather than the variant's default description colour, which is
        `--fg-muted` and sits at 1.78:1 on the amber wash in dark mode. The
        variant is tuned for a description under a coloured title; this alert has
        no title. Same reasoning as the truncation notice.
      */}
      <AlertDescription className="text-xs text-fg">{STALE_WINDOW_MESSAGE}</AlertDescription>
      <Button variant="outline" size="sm" className="ml-auto h-6 shrink-0 px-2 text-xs" onClick={onRetry}>
        <RefreshCw className="size-3" aria-hidden="true" /> Retry
      </Button>
    </Alert>
  );
}
