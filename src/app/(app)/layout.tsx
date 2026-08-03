import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { AppProviders } from "@/app/providers";
import { TZ_COOKIE } from "@/features/_shared/timezone/tz-cookie";
import { isValidZone } from "@/features/_shared/timezone/convert";

/**
 * Provider tree for every authenticated route, including `/suspended` — which
 * is reached only from a browser that already has a session (a 403
 * `organization_suspended`), so it belongs here despite rendering no chrome.
 * `/dev/showcase` is here too, simply because it needs the full stack and 404s
 * in production anyway.
 */
export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Display timezone for the FIRST frame (RUK-233). Without it every screen
  // rendered event times in UTC until mount, then re-rendered in the viewer's
  // zone — a visible 3-hour jump for an operator in UTC+3.
  //
  // `isValidZone` is not optional: `mm.tz` is deliberately not httpOnly (the
  // browser writes it), so its value is untrusted input. A forged or stale zone
  // degrades to `null` = "the server doesn't know", yielding the UTC placeholder.
  //
  // Reading the cookie here is what makes this subtree render dynamically; that
  // cost is accepted and measured (see the spec's build baseline). It now sits
  // in the `(app)` layout rather than the root, so the public routes no longer
  // pay for it — but the SCRIPT that seeds this cookie stays in the root
  // `<head>`, because most users' first-ever page load is `/login`. Seeding it
  // only from here would leave the first authenticated frame in UTC.
  const cookieZone = (await cookies()).get(TZ_COOKIE)?.value;
  const serverZone = isValidZone(cookieZone) ? cookieZone : null;

  return <AppProviders serverZone={serverZone}>{children}</AppProviders>;
}
