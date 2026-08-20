// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * Wave 2 / W2 (RUK-252): the calendar tells the operator when the backend
 * truncated the window at its 1000-event cap, and says nothing when it didn't.
 *
 * These drive the REAL `CalendarPage` against a stubbed `globalThis.fetch`, the
 * same way `calendar-hydration-gate.test.tsx` does, rather than mocking
 * `useCalendarQuery`. The behaviour under test is "what the operator sees for a
 * given backend response", so the `meta` has to travel the actual route the
 * production code reads it through — a mocked hook would only prove that a
 * prop was rendered.
 *
 * The third state is the one that matters. `meta` is `undefined` on EVERY
 * navigation, not just on failure: `keepPreviousData` holds the previous
 * window's `items` on screen while the next loads, but no cache entry exists
 * under the new key yet. So `undefined` means "we don't know" and must never be
 * rendered as either "truncated" (the banner would flicker on every prev/next)
 * or as a positive claim of completeness.
 */

// jsdom lacks the layout APIs the sidebar/portal children rely on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};

// jsdom in this config doesn't provide a working store; the page reads its view
// and filters from it on mount, so back it with an in-memory stub we control.
const storageStore = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => storageStore.get(k) ?? null,
    setItem: (k: string, v: string) => void storageStore.set(k, String(v)),
    removeItem: (k: string) => void storageStore.delete(k),
    clear: () => storageStore.clear(),
  },
});

// Keep these tests about the notice: resolve the role gate and display zone
// synchronously so neither needs a network round-trip.
vi.mock("@/features/_shared/queries/use-me-query", () => ({
  useMeQuery: () => ({ data: undefined }),
}));
vi.mock("@/features/_shared/timezone/use-timezone", () => ({
  useTimezone: () => ({ zone: "UTC", ready: true }),
}));

import { CalendarPage } from "../calendar-page";
import { CalendarTruncationNotice, isTruncated } from "../calendar-truncation-notice";

/**
 * The exact copy agreed with the owner (plan §6.1), pinned character for
 * character. The QUANTITY is interpolated from the response, so these are
 * written against a cap that is deliberately NOT 1000: a fixture echoing the
 * current cap would pass just as well against a hardcoded number, and prove
 * nothing about where the count came from.
 */
const expectedText = (count: number) =>
  `Showing the first ${count} maintenances — narrow your filters to see more`;
const EXPECTED_TEXT_NO_COUNT = "Showing a partial window — narrow your filters to see more";

/** Body of the next `/api/calendar` response. */
let calendarBody: unknown = { items: [] };

beforeEach(() => {
  storageStore.clear();
  calendarBody = { items: [] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("/api/calendar") ? calendarBody : {};
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/**
 * Wait until the page has left its loading state, so an assertion about the
 * notice being ABSENT can't pass merely because the skeleton is still up.
 */
async function renderSettled() {
  render(<CalendarPage />, { wrapper });
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
}

describe("CalendarPage — truncation notice (RUK-252)", () => {
  it("shows the notice, verbatim, when the backend reports truncated: true", async () => {
    // 500, not 1000: the number must come from THIS response. If the copy ever
    // goes back to a hardcoded cap, this fails instead of passing by coincidence.
    calendarBody = { items: [], meta: { count: 500, truncated: true } };

    await renderSettled();

    const notice = await screen.findByTestId("calendar-truncation-notice");
    // Exact copy, not a substring match: the wording was settled with the owner
    // and each clause is deliberate ("Showing the first" = a fact, not a failure;
    // "narrow your filters" = a concrete action that doesn't dictate one fix;
    // "to see more" not "to see them all" — narrowing isn't promised to be
    // sufficient).
    expect(notice.textContent).toBe(expectedText(500));
    expect(notice.textContent).not.toContain("1000");
    // Announced passively: it's present on load rather than raised by an action.
    expect(notice.getAttribute("role")).toBe("status");
  });

  it("claims no quantity when the backend flags truncation without a count", async () => {
    // Both meta fields are optional. Truncation is still worth reporting, but
    // "the first undefined maintenances" must never reach the operator.
    calendarBody = { items: [], meta: { truncated: true } };

    await renderSettled();

    const notice = await screen.findByTestId("calendar-truncation-notice");
    expect(notice.textContent).toBe(EXPECTED_TEXT_NO_COUNT);
    expect(notice.textContent).not.toMatch(/undefined|NaN/);
  });

  it("renders nothing when the backend reports truncated: false", async () => {
    calendarBody = { items: [], meta: { count: 434, truncated: false } };

    await renderSettled();

    expect(screen.queryByTestId("calendar-truncation-notice")).toBeNull();
    expect(document.body.textContent).not.toContain("Showing the first");
  });

  it("renders nothing when meta is absent — and does NOT treat that as 'complete'", async () => {
    // `undefined` is the state on every navigation while the next window loads.
    calendarBody = { items: [] };

    await renderSettled();

    // Nothing is shown, because we cannot claim the window IS truncated...
    expect(screen.queryByTestId("calendar-truncation-notice")).toBeNull();
    // ...but the absence must not be a positive claim of completeness either:
    // no "showing all" / "complete" reassurance is rendered anywhere.
    expect(document.body.textContent).not.toMatch(/show(?:ing|n)\s+all\b/i);
    expect(document.body.textContent).not.toMatch(/all\s+maintenances\s+(?:are\s+)?shown/i);
  });

  it("reserves no space when absent: the notice is the element, not a wrapper", () => {
    // Layout must not shift between windows. The guard is that the truthy check
    // returns null OUTRIGHT rather than rendering an empty spacer, so there is
    // no node to occupy a grid/flex slot.
    expect(CalendarTruncationNotice({ meta: undefined })).toBeNull();
    expect(CalendarTruncationNotice({ meta: { truncated: false } })).toBeNull();
    expect(CalendarTruncationNotice({ meta: { truncated: true } })).not.toBeNull();
  });

  it("treats only the literal `true` as truncated", () => {
    expect(isTruncated(undefined)).toBe(false);
    expect(isTruncated({})).toBe(false);
    expect(isTruncated({ truncated: false })).toBe(false);
    expect(isTruncated({ truncated: true })).toBe(true);

    // The cases above pass for a loose `!!meta?.truncated` too, so on their own
    // they do NOT prove strictness — mutation-checked, and they didn't fail.
    // These do: a backend drifting off the boolean contract (a count, a string)
    // must read as "unknown", never as "yes". `=== true` is the only check that
    // holds; `!!` would announce truncation off an arbitrary truthy value.
    const offContract = [1, "true", "false", {}, []] as const;
    for (const value of offContract) {
      expect(
        isTruncated({ truncated: value as unknown as boolean }),
        `truncated: ${JSON.stringify(value)} must not count as truncated`,
      ).toBe(false);
    }
    // And 0 / "" must not flip a `false` into anything else either.
    expect(isTruncated({ truncated: 0 as unknown as boolean })).toBe(false);
  });
});
