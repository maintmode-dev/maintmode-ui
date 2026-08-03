// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TimezoneCard } from "../timezone-card";

vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: vi.fn() };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// cmdk observes its list container and scrolls the active row into view;
// jsdom implements neither.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function () {};

const RealDateTimeFormat = Intl.DateTimeFormat;

/**
 * Counts `new Intl.DateTimeFormat(...)` constructions. The constructor is the
 * expensive part (see the `offsetLabels` comment in timezone-card), so the spy
 * count is what this asserts on — never elapsed time, which flakes on CI.
 */
function spyOnDateTimeFormat() {
  const spy = vi.fn();
  const Patched = function (this: unknown, ...args: unknown[]) {
    spy(...args);
    return new (RealDateTimeFormat as unknown as new (...a: unknown[]) => object)(...args);
  } as unknown as typeof Intl.DateTimeFormat;
  // Keep the statics (`supportedValuesOf`, `supportedLocalesOf`) reachable so
  // everything else touching Intl during render still works. The real
  // constructor is delegated to, so instances behave normally.
  Object.setPrototypeOf(Patched, RealDateTimeFormat);
  Intl.DateTimeFormat = Patched;
  return spy;
}

afterEach(() => {
  Intl.DateTimeFormat = RealDateTimeFormat;
  cleanup();
  vi.clearAllMocks();
  vi.resetModules();
});

function renderCard(Card: typeof TimezoneCard, savedZone: string | null = null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Card savedZone={savedZone} />
    </QueryClientProvider>,
  );
}

describe("TimezoneCard", () => {
  it("AC-6: does not construct a DateTimeFormat per zone while rendering", async () => {
    // Establish the premise: the runtime exposes a large zone list, so a
    // per-zone implementation would be plainly visible in the construction
    // count. Without this, the assertion could pass on an empty list.
    const zoneCount = Intl.supportedValuesOf("timeZone").length;
    expect(zoneCount).toBeGreaterThan(100);

    // Fresh module so the memoized offset map starts cold for this render.
    const { TimezoneCard: FreshCard } = await import("../timezone-card");
    const spy = spyOnDateTimeFormat();

    renderCard(FreshCard);

    // The picker is closed, so no option row has mounted and no offset label is
    // needed yet. A per-zone-at-build-time implementation constructs one
    // formatter per zone here (~418); this one should construct a small
    // constant number, independent of how many zones the runtime supports.
    expect(spy.mock.calls.length).toBeLessThan(20);
    expect(spy.mock.calls.length).toBeLessThan(zoneCount / 4);
  });

  it("shows correct offset sublines, including half-hour and DST zones", async () => {
    const { TimezoneCard: FreshCard } = await import("../timezone-card");
    renderCard(FreshCard);

    // The picker is behind `next/dynamic`, so the trigger replaces the loading
    // placeholder a tick after mount — find it rather than get it.
    fireEvent.click(await screen.findByRole("combobox", { name: "Timezone" }));

    // Read the label the eager implementation would have produced, straight
    // from the unpatched Intl, and require the rendered row to match it.
    const expected = (zone: string) => {
      const parts = new RealDateTimeFormat("en-US", {
        timeZone: zone,
        timeZoneName: "shortOffset",
      }).formatToParts(new Date());
      return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    };

    const zones = Intl.supportedValuesOf("timeZone");

    // The combobox does not virtualize, so every zone row mounts at once —
    // wait for the full list rather than an early partial render.
    const rows = await waitFor(() => {
      const options = screen.getAllByRole("option");
      if (options.length <= zones.length) throw new Error("zone rows have not all mounted yet");
      return options;
    });

    // Note: `supportedValuesOf` returns the runtime's canonical names, which
    // are the legacy spellings here (`Asia/Calcutta`, not `Asia/Kolkata`), so
    // these have to be zones the picker actually lists.
    for (const zone of [
      "Asia/Calcutta", // half-hour offset (GMT+5:30)
      "Asia/Katmandu", // three-quarter-hour offset (GMT+5:45)
      "Australia/Eucla", // three-quarter-hour offset (GMT+8:45)
      "America/New_York", // observes DST
      "Europe/Moscow", // whole hour
    ]) {
      expect(zones).toContain(zone);

      const text = zone.replace(/_/g, " ");
      const row = rows.find((el) => el.textContent?.startsWith(text));
      expect(row, `no option row for ${zone}`).toBeTruthy();

      const label = expected(zone);
      expect(label).not.toBe("");
      // The row reads "<zone label><offset>", e.g. "Asia/KolkataGMT+5:30".
      expect(row!.textContent).toBe(`${text}${label}`);
    }
  });
});
