"use client";

import { useEffect, useState } from "react";

/**
 * Has `active` held continuously for at least `delayMs`?
 *
 * A threshold for conditions that are normal when brief and a problem when they
 * persist. The calendar uses it for "the grid is showing another window's
 * events": true on every single step for a few hundred ms, and worth telling the
 * operator about only once it lasts (RUK-267).
 *
 * ## Continuously
 *
 * The count restarts from zero whenever `active` goes false, rather than
 * accumulating active-time. That is the whole point of the hook: a condition
 * that flaps on and off is *recovering*, and a threshold that summed its active
 * periods would eventually fire on a system that is working. Only an unbroken
 * run means "this is stuck".
 *
 * Consequence worth knowing at the call site: a condition that flaps faster than
 * `delayMs` never trips this at all. That is deliberate — but it means the hook
 * answers "has it been stuck this long", not "has it been bad this often".
 *
 * Timing starts when `active` becomes true, not when the underlying event
 * happened. A caller whose condition is itself delayed (the calendar's is, by a
 * step debounce) must add the two to know the real latency.
 */
export function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    if (!active) return;

    // Recreated on every activation, and — because `active` is a dependency —
    // React always runs the cleanup below before re-running this. So a timer
    // from a previous run can never fire into a new one, and the count always
    // starts from zero. That is what makes the run CONTINUOUS rather than
    // cumulative, with no bookkeeping to track which run a completion belongs
    // to. (An earlier draft carried a run-id for exactly that; it was
    // unreachable by construction, and no test could bite it.)
    const handle = setTimeout(() => setElapsed(true), delayMs);

    // Clearing the timer is NOT enough — `elapsed` must be cleared too, or it
    // latches. Once a run completes it stays `true`, and the `active &&` guard
    // below only hides that while `active` is false; the next activation reads
    // the stale `true` and reports "elapsed" immediately, skipping the whole
    // threshold. Measured: after a completed 1000 ms run, a fresh 100 ms
    // activation returned `true`.
    //
    // This is a correction. An earlier version of this file removed the reset
    // and its comment claimed the guard made it redundant — that claim was
    // wrong, and the bite check that "proved" it only ever broke runs that had
    // never completed, which is exactly the case where the two are equivalent.
    return () => {
      clearTimeout(handle);
      setElapsed(false);
    };
  }, [active, delayMs]);

  // `active &&` still earns its place: effects are asynchronous to render, so on
  // the commit where `active` flips false the cleanup above has not run yet, and
  // without this the caller would see a stale `true` for that one commit — a
  // visible flash of a banner whose condition has already cleared.
  return active && elapsed;
}
