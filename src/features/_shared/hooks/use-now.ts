"use client";

import { useEffect, useState } from "react";

/**
 * A clock that advances on a fixed cadence, owned by the component that reads it.
 *
 * Exists so a live clock costs a re-render of its CONSUMER rather than of the
 * whole page (RUK-265). The calendar previously held `now` in page state and
 * passed it to the sidebar, so a tick re-rendered the grid too — which is not
 * `memo`ised, so its body ran end to end once a minute for a value it never read.
 *
 * The initial value is produced lazily DURING render, not in an effect: an
 * effect-initialised clock renders once with a placeholder and then corrects
 * itself, which is a visible flash on first paint. Callers that server-render
 * must therefore keep in mind that this reads the client clock — today's only
 * consumer (the calendar sidebar) never server-renders, since it sits behind a
 * query gated on `hydrated`.
 *
 * The cadence is measured from mount, NOT aligned to wall-clock boundaries: a
 * 60_000 ms tick started at 12:00:30 fires at 12:01:30, not 12:01:00. Consumers
 * showing minute-granular text will therefore lag by up to one interval. That
 * matches the behaviour this replaced; drift here is not a bug to hunt.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const handle = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(handle);
  }, [intervalMs]);

  return now;
}
