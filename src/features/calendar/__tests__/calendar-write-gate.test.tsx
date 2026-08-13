// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/domain/admin/user";
import type { Role } from "@/domain/auth/permissions";
import type { CalendarEvent } from "@/domain/maintenance/maintenance";

/**
 * RUK-213 render-level gate: the "New maintenance" create entry points are shown
 * to write-capable roles and hidden from guests. Automated tripwire for
 * over-restriction (writer loses the CTA) and under-restriction (guest sees it).
 */

// jsdom lacks the layout APIs some sidebar/portal children rely on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};

// The page reads/writes its view + filters through localStorage on mount; jsdom
// in this config doesn't provide a working store, so back it with an in-memory
// stub. Contents are irrelevant to the role gate — it just needs to not throw.
if (typeof window.localStorage?.getItem !== "function") {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const meData = vi.fn<() => Partial<User> | undefined>(() => undefined);
vi.mock("@/features/_shared/queries/use-me-query", () => ({
  useMeQuery: () => ({ data: meData() }),
}));

// Empty window → the page renders its empty state (no FullCalendar grid mount).
const calendarData = vi.fn<() => CalendarEvent[]>(() => []);
vi.mock("../queries/use-calendar-query", () => ({
  useCalendarQuery: () => ({
    data: calendarData(),
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
// Resolve the display zone synchronously so no QueryClient round-trip is needed
// for timezones — keeps the test focused on the role gate.
vi.mock("@/features/_shared/timezone/use-timezone", () => ({
  useTimezone: () => ({ zone: "UTC", ready: true }),
}));

import { CalendarPage } from "../calendar-page";

function renderPage(roles: Role[] | undefined) {
  meData.mockReturnValue(roles ? { roles } : undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CalendarPage />
    </QueryClientProvider>,
  );
}

const newMaintenanceLinks = () => screen.queryAllByRole("link", { name: /New maintenance/ });

describe("CalendarPage write gate (RUK-213)", () => {
  it("shows the New maintenance CTA to a writer (over-restriction tripwire)", () => {
    renderPage(["guest", "editor"]);
    // Header link + empty-state link both point at /maintenance/new.
    const links = newMaintenanceLinks();
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute("href")).toBe("/maintenance/new");
    }
  });

  it("hides every New maintenance CTA from a guest (under-restriction tripwire)", () => {
    renderPage(["guest"]);
    expect(newMaintenanceLinks()).toHaveLength(0);
  });

  it("shows a neutral empty-state caption and no create CTA for a guest", () => {
    renderPage(["guest"]);
    expect(newMaintenanceLinks()).toHaveLength(0);
    expect(screen.getByText("No maintenance is scheduled for this period.")).toBeTruthy();
  });
});
