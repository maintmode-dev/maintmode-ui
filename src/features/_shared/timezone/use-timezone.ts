"use client";

import { useEffect, useState } from "react";

import { useMeQuery } from "@/features/_shared/queries/use-me-query";
import { isValidZone } from "./convert";

/**
 * The IANA zone used for rendering and converting event **windows** across the
 * app (RUK-201). Everything that shows or accepts a maintenance window time must
 * read its zone from here — never `Intl…resolvedOptions()` ad-hoc at a call
 * site — so the whole product agrees on one zone and "18 = 18" holds.
 *
 * NOTE: this is for event *windows* only. Identity/audit stamps (`formatUtc`)
 * stay in UTC and must NOT consume this hook.
 */

/** Last-resort zone when nothing else is known (matches the SSR container). */
export const FALLBACK_ZONE = "UTC";

/**
 * The browser's autodetected IANA zone, or {@link FALLBACK_ZONE} if the runtime
 * can't report one. Call only on the client (it reads `Intl`), which is why the
 * hook below defers it to an effect.
 */
export function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_ZONE;
  } catch {
    return FALLBACK_ZONE;
  }
}

export interface ResolvedTimezone {
  /** IANA zone to render/convert in. */
  zone: string;
  /**
   * `false` during SSR and the first client render (zone is still the
   * hydration-safe `FALLBACK_ZONE`); `true` once the real zone is resolved
   * post-mount. Gate any localStorage/DOM-affecting use on this, exactly like
   * the calendar page gates its stored view/filters, to avoid a React #418
   * hydration mismatch.
   */
  ready: boolean;
}

/**
 * Resolve the display/conversion zone with a hydration-safe handoff:
 *
 *   1. SSR + first client render → `FALLBACK_ZONE` (`UTC`), `ready: false`.
 *      The server has no way to know the viewer's zone (no cookie yet — see the
 *      RUK-201 spec's deferred SSR-cookie item), so it must render something
 *      deterministic that the first client render reproduces exactly.
 *   2. After mount → the real zone, `ready: true`. Preference order:
 *        user's saved zone (`me.timezone`, from RUK-202) → browser autodetect.
 *
 * When RUK-202 ships and `me.timezone` is populated, this hook picks it up with
 * no other change; until then it transparently falls back to browser autodetect.
 */
export function useTimezone(): ResolvedTimezone {
  const meQuery = useMeQuery();
  // Only trust a saved zone the runtime can actually resolve — a bad value from
  // the backend must degrade to autodetect, never flow into the converters.
  const savedZone = isValidZone(meQuery.data?.timezone) ? meQuery.data.timezone : null;

  // Deferred to an effect so SSR and the first client render both see the
  // fallback; adopting the resolved zone here (once mounted) is the canonical
  // hydration-safe pattern this codebase already uses for calendar prefs.
  const [resolved, setResolved] = useState<string | null>(null);
  useEffect(() => {
    // Mount-time adoption of a client-only value (the resolved zone) — the same
    // hydration-safe pattern calendar-page uses for stored view/filters, so the
    // synchronous setState here is intentional (SSR + first render use the
    // fallback, then we adopt the real zone once).
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setResolved(savedZone || browserZone());
  }, [savedZone]);

  return resolved === null ? { zone: FALLBACK_ZONE, ready: false } : { zone: resolved, ready: true };
}
