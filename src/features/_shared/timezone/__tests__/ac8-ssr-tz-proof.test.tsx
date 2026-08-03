// @vitest-environment node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AppProviders } from "@/app/providers";
import { useTimezone } from "@/features/_shared/timezone/use-timezone";
import { formatDateTime } from "@/shared/ui/lib/format";

/**
 * RUK-233 invariant: the FIRST server-rendered frame must already be in the
 * viewer's zone, not UTC.
 *
 * This existed as a manual `curl` check only, which is why the layout split
 * (T12) was the plan's highest-risk step: nothing in the suite would have caught
 * a partial regression, and a screenshot cannot catch one either — it is taken
 * after hydration, when the client has re-rendered in the right zone regardless.
 * `renderToString` is the cheap way to look at the server frame specifically.
 *
 * Two halves, and BOTH are needed:
 *   1. the provider converts (below), and
 *   2. `(app)/layout.tsx` actually feeds it the cookie — asserted at the bottom,
 *      because half 1 keeps passing happily if the layout stops passing the prop.
 */

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/features/_shared/queries/use-me-query", () => ({
  useMeQuery: () => ({ data: undefined, isPending: false }),
}));

/**
 * 00:30 UTC is chosen deliberately: it is the PREVIOUS day in New York and 09:30
 * the same day in Tokyo, so a zone that silently falls back to UTC shows up as a
 * changed date, not merely a shifted hour.
 */
const ISO = "2026-08-03T00:30:00Z";

function Probe() {
  const { zone } = useTimezone();
  return <output>{formatDateTime(ISO, zone)}</output>;
}

/** Mirrors what `(app)/layout.tsx` renders around every authenticated page. */
function renderFirstFrame(serverZone: string | null) {
  return renderToString(
    <AppProviders serverZone={serverZone}>
      <Probe />
    </AppProviders>,
  );
}

describe("AC-8: the first server frame renders in the viewer's zone (RUK-233)", () => {
  it("renders UTC+9 for Asia/Tokyo", () => {
    expect(renderFirstFrame("Asia/Tokyo")).toContain("Aug 03, 2026, 09:30");
  });

  it("renders UTC-4 for America/New_York — the previous day, so UTC cannot pass by luck", () => {
    expect(renderFirstFrame("America/New_York")).toContain("Aug 02, 2026, 20:30");
  });

  it("falls back to the UTC placeholder when the server has no zone", () => {
    // Also the documented one-line rollback for the whole feature
    // (`serverZone={null}`), so this pins the rollback path's behavior too.
    expect(renderFirstFrame(null)).toContain("Aug 03, 2026, 00:30");
  });

  it("is not vacuous: the three zones really do produce three different frames", () => {
    const frames = [
      renderFirstFrame("Asia/Tokyo"),
      renderFirstFrame("America/New_York"),
      renderFirstFrame(null),
    ];
    expect(new Set(frames).size).toBe(3);
  });

  it("`(app)/layout.tsx` reads the tz cookie and passes it to AppProviders", async () => {
    // Without this the assertions above would keep passing even if the layout
    // stopped supplying `serverZone` — the exact regression T12 could introduce
    // by moving the cookie read to the wrong place.
    const here = dirname(fileURLToPath(import.meta.url));
    const layout = await readFile(resolve(here, "../../../../app/(app)/layout.tsx"), "utf8");

    expect(layout).toMatch(/cookies\(\)/);
    expect(layout).toMatch(/TZ_COOKIE/);
    expect(layout).toMatch(/isValidZone/);
    expect(layout).toMatch(/<AppProviders\s+serverZone=\{serverZone\}/);
  });

  it("the tz-seeding script stays in the ROOT layout, above the route groups", async () => {
    // `TzInitScript` seeds `mm.tz` on a first visit, and for most users the first
    // page ever loaded is `/login` — a PUBLIC route. If it were moved into
    // `(app)`, the cookie would only be seeded after sign-in and the first
    // authenticated frame would render in UTC: a partial RUK-233 regression
    // visible only to new users. `ThemeInitScript` must stay for the same
    // structural reason (only the root renders `<head>`).
    const here = dirname(fileURLToPath(import.meta.url));
    const root = await readFile(resolve(here, "../../../../app/layout.tsx"), "utf8");

    expect(root).toMatch(/<TzInitScript\s*\/>/);
    expect(root).toMatch(/<ThemeInitScript\s*\/>/);
  });
});
