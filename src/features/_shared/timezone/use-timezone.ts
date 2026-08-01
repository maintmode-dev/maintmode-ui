"use client";

import { useContext } from "react";

import { TimezoneContext } from "./timezone-provider";
import { FALLBACK_ZONE, type ResolvedTimezone } from "./tz-cookie";

/**
 * The IANA zone used for rendering and converting event **windows** across the
 * app (RUK-201). Everything that shows or accepts a maintenance window time must
 * read its zone from here — never `Intl…resolvedOptions()` ad-hoc at a call
 * site — so the whole product agrees on one zone and "18 = 18" holds.
 *
 * NOTE: this is for event *windows* only. Identity/audit stamps (`formatUtc`)
 * stay in UTC and must NOT consume this hook.
 */

/**
 * Re-exported for `settings/timezone-card.tsx`, which imports `browserZone` from
 * here. It lives in `tz-cookie.ts` because the provider needs it too and
 * importing it back from this file would create a cycle — see `tz-cookie.ts`.
 * Anything else from that module is imported from it directly (as
 * `app/layout.tsx` does with `TZ_COOKIE`).
 */
export { browserZone, type ResolvedTimezone } from "./tz-cookie";

/**
 * Read the display/conversion zone resolved once per document by
 * `TimezoneProvider` (RUK-233). Priority order is `me.timezone` → cookie →
 * browser autodetect: the provider's post-mount zone always overrides the
 * cookie's.
 *
 * With no provider in the tree we degrade to UTC instead of throwing (`useTheme`
 * throws; the difference is explained on `TimezoneContext`). In dev a missing
 * provider is almost always a mistake, so it warns; in tests rendering a consumer
 * bare is normal and the UTC fallback is what they expect.
 */
export function useTimezone(): ResolvedTimezone {
  const ctx = useContext(TimezoneContext);
  if (ctx === undefined) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("useTimezone: no TimezoneProvider; falling back to UTC");
    }
    return { zone: FALLBACK_ZONE, ready: false };
  }
  return ctx;
}
