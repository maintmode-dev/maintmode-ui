import { describe, expect, it } from "vitest";

import { resolveDateWindow } from "../global-audit-log-page";

/**
 * The custom audit range is anchored to **UTC** calendar days (audit is a UTC
 * domain — stamps render via `formatUtc`, and the range chip shows the picked
 * dates with `formatDate(..., "UTC")`). The regression this guards: the window
 * was built with `new Date("2026-07-16T00:00:00")` (no `Z`), which parsed in the
 * machine's local zone, so the range SENT to the backend drifted from the range
 * SHOWN to the user by the machine offset. These assertions are absolute UTC
 * instants, so they fail on any machine whose local zone isn't UTC if the `Z`
 * anchoring regresses.
 */
describe("resolveDateWindow — custom range is UTC-day anchored", () => {
  it("anchors `from` to 00:00:00Z and `to` to end-of-day 23:59:59.999Z of the picked UTC days", () => {
    const { from, to } = resolveDateWindow("custom", { from: "2026-07-16", to: "2026-07-18" }, 0);
    expect(from).toBe("2026-07-16T00:00:00.000Z");
    expect(to).toBe("2026-07-18T23:59:59.999Z");
  });

  it("keeps a single-day range within that one UTC day (inclusive end-of-day)", () => {
    const { from, to } = resolveDateWindow("custom", { from: "2026-01-01", to: "2026-01-01" }, 0);
    expect(from).toBe("2026-01-01T00:00:00.000Z");
    expect(to).toBe("2026-01-01T23:59:59.999Z");
  });
});

describe("resolveDateWindow — presets", () => {
  it("resolves a bounded preset to a `from` offset from now, no `to`", () => {
    // 24h preset, now = 2026-07-16T12:00:00Z → from = 2026-07-15T12:00:00Z.
    const now = Date.UTC(2026, 6, 16, 12, 0, 0);
    const { from, to } = resolveDateWindow("24h", null, now);
    expect(from).toBe("2026-07-15T12:00:00.000Z");
    expect(to).toBeUndefined();
  });

  it("returns an open window for the all-time preset", () => {
    expect(resolveDateWindow("all", null, 0)).toEqual({});
  });
});
