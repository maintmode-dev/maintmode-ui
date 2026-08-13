"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Quiet period before a new calendar window reaches the query key.
 *
 * Chosen on a trade-off, not as a round number. It has to clear the interval
 * inside a burst (~150-200 ms between clicks) or it collapses nothing; and every
 * millisecond of it is paid by the *single deliberate* step, which now waits
 * this long before its request even starts. Single steps outnumber bursts, so
 * the number stays small. The repo debounces search at 300 ms
 * (`users-management-page.tsx`); stepping should feel tighter than typing.
 *
 * Honest limitation: methodical stepping at ~300-400 ms intervals is slower than
 * this threshold, so it collapses nothing and pays the delay. Accepted — and
 * tunable here alone if a real INP measurement (RUK-257) says otherwise.
 */
export const STEP_DEBOUNCE_MS = 250;

/**
 * Hard cap on how long a window can be withheld.
 *
 * A pure trailing debounce has a pathology: clicks that keep arriving just under
 * the threshold postpone the request *forever*. That is not merely slow — with
 * `keepPreviousData` the previous window stays on screen and `isPending` is
 * false, so the operator reads a header for one date over events from another
 * with no loading indicator at all. The cap bounds that divergence.
 *
 * It re-arms after each flush rather than firing once: a one-shot cap would let
 * the starvation resume immediately after the first flush, which is the very
 * thing it exists to prevent. The cost is bounded and stated — ten seconds of
 * unbroken stepping yields ~10 requests, against ~50 for one-per-click.
 */
export const MAX_WAIT_MS = 1000;

export interface CalendarWindow {
  from: string;
  to: string;
}

/**
 * Whether two windows name the same range.
 *
 * Field-wise, never by identity: `CalendarWindow`s are rebuilt on every render
 * from `viewRange`, so two objects for the same range are routinely different
 * objects. Callers use this to ask "has anything actually changed?", and
 * identity would answer that question wrong.
 */
export function sameWindow(a: CalendarWindow, b: CalendarWindow): boolean {
  return a.from === b.from && a.to === b.to;
}

/**
 * The window that drives the calendar query, decoupled from the window the page
 * renders.
 *
 * Only the request is debounced. The anchor, the header title and the grid keep
 * updating synchronously from the click, because debouncing those would trade a
 * request problem for a perceived-latency one — the operator would see the
 * chevron lag, which is worse than what we set out to fix.
 *
 * Values are the `YYYY-MM-DD` strings, never `Date`s: the effect below compares
 * dependencies with `Object.is`, and two `Date`s for the same day are different
 * objects, so a `Date`-typed window would restart its own timer on unrelated
 * re-renders and could starve the fetch. Strings also make the timer depend on
 * exactly what the cache key depends on.
 *
 * ### The latch
 *
 * The first window is published immediately; only later changes wait. This is
 * not a nicety — it is what keeps the cold start at one request. `CalendarPage`
 * adopts its stored view and opens the query gate (`enabled: hydrated`) in the
 * SAME mount effect, so for an operator with a stored Week/Month view the first
 * real window arrives as a *change*. A plain trailing debounce would still be
 * holding the default Day window when the gate opens, fire a request for a
 * window that is discarded a moment later, then fire the real one — which is
 * precisely the double request `calendar-hydration-gate.test.tsx` exists to
 * forbid. (Confirmed by probe rather than assumed: the seed does reach a commit
 * where the gate is open.)
 *
 * The latch closes on the first **live** window — the first one the caller says
 * is actually going to be requested — and never reopens.
 *
 * `live` is what makes this correct rather than approximately correct. The page
 * gates its query on `hydrated`, and it adopts the stored view in the very same
 * mount effect that flips `hydrated`; every window before that point is a
 * provisional value nobody fetches. So the latch must not close on "the first
 * window I saw" (that is the throwaway Day default) nor on a timer (whether the
 * mount effect lands inside some fixed interval is a race, and a real cold start
 * is slower than a fake-timer one). Closing on the first window that the caller
 * will actually request is the boundary that holds in both worlds.
 *
 * Pass `live: false` while the caller's window is still provisional; the hook
 * mirrors the window through untouched during that time.
 */
export function useCalendarWindow(window: CalendarWindow, live = true): CalendarWindow {
  // Both halves are STATE, not refs, because the latch is read during render
  // (see below) and a ref read during render is neither safe nor allowed.
  // Adjusting state during render is the sanctioned React pattern for exactly
  // this: deriving a value from props without waiting for an effect.
  const [published, setPublished] = useState(window);
  const [latchClosed, setLatchClosed] = useState(false);

  // When the current run of un-published changes began — the origin the cap is
  // measured from. A ref is right here: it is only ever touched inside effects.
  const withheldSince = useRef<number | null>(null);

  // While the latch is open the window passes through DURING RENDER rather than
  // from an effect. That is the whole point: the caller enables its query in the
  // same commit that delivers the real window, so a value published one effect
  // later is already too late — the query fires once for the provisional window
  // and again for the real one, the double request on cold load that
  // `calendar-hydration-gate.test.tsx` forbids. (Measured, not assumed: that
  // intermediate commit reads `hydrated === true` alongside the stale window.)
  let current = published;
  if (!latchClosed && !sameWindow(window, published)) {
    current = window;
    setPublished(window);
  }
  if (!latchClosed && live) setLatchClosed(true);

  // Destructured into primitives on purpose: the effect below must depend on the
  // published range's VALUES, not on the identity of the object holding them.
  // `viewRange` returns a fresh object every render, so an object dependency
  // would restart the timer on unrelated re-renders and could starve the fetch.
  const { from: currentFrom, to: currentTo } = current;

  useEffect(() => {
    if (!latchClosed) {
      withheldSince.current = null;
      return;
    }

    if (window.from === currentFrom && window.to === currentTo) {
      // Nothing outstanding — a re-render, not a change.
      withheldSince.current = null;
      return;
    }

    const now = Date.now();
    withheldSince.current ??= now;
    const waited = now - withheldSince.current;
    const delay = Math.max(0, Math.min(STEP_DEBOUNCE_MS, MAX_WAIT_MS - waited));

    const handle = setTimeout(() => {
      withheldSince.current = null;
      setPublished(window);
    }, delay);
    return () => clearTimeout(handle);
  }, [window, latchClosed, currentFrom, currentTo]);

  return current;
}
