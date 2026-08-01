"use client";

import { usePathname } from "next/navigation";
import { createContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { isPublicPath } from "@/domain/auth/public-paths";
import { useMeQuery } from "@/features/_shared/queries/use-me-query";
import { isValidZone } from "./convert";
import {
  browserZone,
  FALLBACK_ZONE,
  TZ_COOKIE,
  TZ_COOKIE_MAX_AGE,
  writeTzCookie,
  type ResolvedTimezone,
} from "./tz-cookie";

/**
 * Owns the display timezone for the whole document (RUK-233).
 *
 * A provider rather than the plain hook it replaces because resolving must
 * happen **once per document**: `useTimezone` is called from eight screens, so
 * eight hook instances meant eight copies of the state and eight cookie writes.
 * The zone arrives from the server as `serverZone` (read from the `mm.tz` cookie
 * in the root layout), which is what lets the first frame render in the viewer's
 * zone instead of the UTC placeholder.
 */

/**
 * `undefined` means "no provider in the tree" — a tree-assembly bug — and is
 * deliberately distinct from `serverZone`'s `null`, the legitimate domain state
 * "the server does not know the zone" (first visit, JS disabled). Telling them
 * apart lets the hook warn about a forgotten provider in dev without throwing
 * and taking down eight screens in prod, which is why the default is not a throw
 * like `useTheme`'s: a theme always has a value, "zone unknown" is valid here.
 */
export const TimezoneContext = createContext<ResolvedTimezone | undefined>(undefined);

interface TimezoneProviderProps {
  /** Zone from the `mm.tz` cookie, or `null` when the server had none. */
  serverZone: string | null;
  children: ReactNode;
}

export function TimezoneProvider({ serverZone, children }: TimezoneProviderProps) {
  // This provider is in the ROOT tree, so it also mounts on public pages where
  // there is no session. Asking `/api/me` there is not a harmless failed query:
  // `bffFetch` answers an `AUTH_REQUIRED` 401 by navigating to
  // `/login?next=<current path>`, and on `/login` that redirects to `/login`
  // again — an infinite refresh loop, each pass nesting `next=` one level deeper.
  // Observed live on the login page. So skip the query where it cannot succeed
  // and fall straight through to autodetect, which is the right answer for an
  // anonymous viewer anyway (there is no `me.timezone` to prefer).
  const pathname = usePathname();
  const authGated = !isPublicPath(pathname ?? "/");

  // NOTE: this calls `useMeQuery`, so the provider MUST be mounted INSIDE
  // `QueryClientProvider` (see `src/app/providers.tsx`). Outside it, React Query
  // throws "No QueryClient set" and the whole app hard-errors. No test catches
  // this — every suite mocks `useMeQuery` — so do not hoist this provider "for
  // cleanliness" without opening the app in a browser afterwards.
  const meQuery = useMeQuery({ enabled: authGated });
  // Only trust a saved zone the runtime can actually resolve — a bad value from
  // the backend must degrade to autodetect, never flow into the converters.
  const savedZone = isValidZone(meQuery.data?.timezone) ? meQuery.data.timezone : null;
  // `data === undefined` means BOTH "no saved zone" and "not loaded yet", and
  // conflating them corrupts the cookie: resolving to autodetect while `/me` is
  // in flight makes the sync effect below persist autodetect, and once the server
  // starts reading THAT cookie, `resolved === serverZone` holds forever and the
  // saved `me.timezone` never wins a first frame again. Observed live: with
  // `me.timezone: Asia/Tokyo` and a browser in Asia/Nicosia, the cookie stuck on
  // Nicosia and every document rendered in the wrong zone. So wait for the query
  // to settle — `isPending` is false once it has data OR has errored, and an
  // errored `/me` legitimately means "fall back to autodetect".
  //
  // A DISABLED query stays `isPending` forever, so it must not count as waiting —
  // otherwise `resolved` would never be set on a public page and `ready` would
  // never flip.
  const mePending = authGated && meQuery.isPending;

  // Hydration-safe handoff: SSR and the first client render see `null` and so
  // render `serverZone`, which the client reproduces byte-for-byte — that is what
  // keeps React #418 away — then the resolved zone is adopted post-mount. The
  // synchronous setState is the intended pattern for adopting a client-only value
  // (same as calendar-page does for stored view/filters).
  const [resolved, setResolved] = useState<string | null>(null);
  useEffect(() => {
    if (mePending) return;
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setResolved(savedZone || browserZone());
  }, [savedZone, mePending]);

  // Catch a lagging cookie up to the authoritative zone. The ONLY place an
  // existing cookie is updated — the head script below refuses to overwrite one,
  // on purpose. Also closes a hole a write in `timezone-card.tsx` would leave:
  // that card skips the mutation when the picked zone equals the saved one, so a
  // lost or forged cookie would never be restored by re-picking the saved zone.
  // Comparing against `serverZone` restores it with no mutation involved.
  useEffect(() => {
    if (resolved && resolved !== serverZone) writeTzCookie(resolved);
  }, [resolved, serverZone]);

  // Pre-mount (`resolved === null`) the zone is the cookie's, else UTC, and
  // `ready` is false either way — see `ResolvedTimezone` for why the cookie does
  // not make it true. Memoized because `useMeQuery` re-renders this provider on
  // every refetch, and a fresh object each time would re-render all consumers.
  const value = useMemo<ResolvedTimezone>(
    () =>
      resolved === null
        ? { zone: serverZone ?? FALLBACK_ZONE, ready: false }
        : { zone: resolved, ready: true },
    [resolved, serverZone],
  );

  return <TimezoneContext.Provider value={value}>{children}</TimezoneContext.Provider>;
}

/**
 * Writes the `mm.tz` cookie on a first visit, before hydration. Constants are
 * interpolated (as `THEME_INIT_SCRIPT` does) so the name and lifetime cannot
 * drift from `tz-cookie.ts`. The name is matched on its boundary for the same
 * reason `readTzCookie` does it.
 *
 * The early return on an existing cookie is a **requirement, not an
 * optimization**: overwriting always would clobber the zone saved in settings
 * (`me.timezone`, higher priority) with the device's autodetect, so "show times
 * in Asia/Nicosia" would silently reset on every load from a laptop elsewhere.
 * Reconciling a disagreement is the provider's job — it knows the priorities;
 * this script only knows "no zone at all → put any".
 *
 * Mind the two escaping levels below. `\\s` sits directly in the template
 * literal and emits `\s`. The `.` escape is a plain string argument to `replace`
 * and needs only `"\\."` to emit `\.` — `"\\\\."` would emit `\\.`, i.e. "a
 * backslash then any char", matching no real cookie, so the script would
 * overwrite the cookie every load and clobber the saved zone. Invisible to the
 * eye, hence the emitted regex's behavior is asserted in the tests.
 */
const TZ_INIT_SCRIPT = `(function(){try{
if(/(?:^|;\\s*)${TZ_COOKIE.replace(".", "\\.")}=/.test(document.cookie))return;
var z=Intl.DateTimeFormat().resolvedOptions().timeZone;
if(!z)return;
document.cookie="${TZ_COOKIE}="+z+";path=/;max-age=${TZ_COOKIE_MAX_AGE};samesite=lax"+(location.protocol==="https:"?";secure":"");
}catch(e){}})()`;

/**
 * Renders the cookie-seeding script in the server layout's `<head>`, next to
 * `<ThemeInitScript />`, whose docblock explains the server/client `type` swap.
 *
 * What it does NOT do: fix the very first HTML of a brand-new browser. It runs
 * while the HTML is parsed, i.e. **after** the server rendered that frame, and no
 * frontend trick removes it — an HTTP request carries no timezone. What it buys
 * is that every subsequent full load (F5 included) is server-rendered in the
 * zone, making a UTC frame seen twice in a row a defect, not a normal state.
 */
export function TzInitScript() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: TZ_INIT_SCRIPT }}
    />
  );
}
