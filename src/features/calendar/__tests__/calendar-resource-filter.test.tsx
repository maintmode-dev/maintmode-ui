// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * The resource filter reaches the SERVER (RUK-256).
 *
 * The defect this replaces: the sidebar filtered client-side on
 * `event.resources`, a field `GET /ui/v1/calendar` has never sent, so the picker
 * was always empty and any selection would have matched nothing. The backend
 * answered that the endpoint already accepts repeated `resource_ids` — so the
 * selection has to travel as a query param, not as a local predicate.
 *
 * Asserted at `bffFetch` rather than on rendered rows: what is being fixed is
 * which REQUEST goes out. A test that checked the grid would pass just as well
 * against a client-side filter, which is the thing being removed.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};

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

vi.mock("@/features/_shared/queries/use-me-query", () => ({
  useMeQuery: () => ({ data: undefined }),
}));
vi.mock("@/features/_shared/timezone/use-timezone", () => ({
  useTimezone: () => ({ zone: "UTC", ready: true }),
}));

const RESOURCE = { id: "res-42", name: "postgres-primary", status: "active" };

const bffFetchMock = vi.fn(async (path: unknown, ..._rest: unknown[]) => {
  if (String(path).includes("/api/resources")) {
    return { resources: [RESOURCE], total: 1, limit: 20, offset: 0 };
  }
  return { items: [] };
});
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (path: unknown, ...rest: unknown[]) => bffFetchMock(path, ...rest) };
});

import { CalendarPage } from "../calendar-page";

const paths = () => bffFetchMock.mock.calls.map((call) => String(call[0]));
const calendarPaths = () => paths().filter((p) => p.includes("/api/calendar"));
const resourceIdsOf = (path: string) => new URL(path, "http://localhost").searchParams.getAll("resource_ids");

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  bffFetchMock.mockClear();
  storageStore.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Type into the sidebar's resource search and pick the single returned match. */
async function selectResource() {
  const search = await screen.findByLabelText("Search resources");
  fireEvent.change(search, { target: { value: "postg" } });

  // The catalogue request is debounced; the option only exists once it lands.
  const option = await screen.findByRole("button", { name: RESOURCE.name }, { timeout: 3000 });
  fireEvent.click(option);
}

describe("the calendar sends the resource selection to the backend", () => {
  it("issues a request carrying `resource_ids` once a resource is picked", async () => {
    render(<CalendarPage />, { wrapper });
    await waitFor(() => expect(calendarPaths().length).toBeGreaterThan(0));

    // Before any selection: no filter on this axis. Not merely "not res-42" —
    // an empty selection must send NO param at all, or the backend would read
    // it as a filter matching nothing.
    expect(resourceIdsOf(calendarPaths()[0])).toEqual([]);

    await selectResource();

    await waitFor(() => {
      const latest = calendarPaths().at(-1);
      expect(latest && resourceIdsOf(latest)).toEqual([RESOURCE.id]);
    });
  });

  it("returns to the unfiltered window when the last chip is removed", async () => {
    render(<CalendarPage />, { wrapper });
    await waitFor(() => expect(calendarPaths().length).toBeGreaterThan(0));

    await selectResource();
    await waitFor(() => expect(resourceIdsOf(calendarPaths().at(-1)!)).toEqual([RESOURCE.id]));

    fireEvent.click(await screen.findByLabelText(`Remove ${RESOURCE.name}`));

    // The chip is gone, so the page is back on the unfiltered query key.
    await waitFor(() => expect(screen.queryByLabelText(`Remove ${RESOURCE.name}`)).toBeNull());

    // Deliberately NOT asserting "the last request carries no resource_ids":
    // the unfiltered window is already in cache from the first load, so
    // TanStack serves it without a refetch and the last request on the wire
    // stays the filtered one. Asserting on request order here would pin
    // caching behaviour, not the filter. What matters is that no request was
    // issued that still carries the removed id after this point.
    const beforeSettle = calendarPaths().length;
    await new Promise((r) => setTimeout(r, 350));
    const issuedAfterRemoval = calendarPaths().slice(beforeSettle);

    expect(issuedAfterRemoval.filter((p) => resourceIdsOf(p).length > 0)).toEqual([]);
  });

  it("keeps the chip's label after the search box is cleared", async () => {
    // The catalogue query is keyed on the search text, so its result cannot be
    // the source of truth for a chip's name. Clearing the box must not blank it.
    render(<CalendarPage />, { wrapper });
    await waitFor(() => expect(calendarPaths().length).toBeGreaterThan(0));

    await selectResource();
    expect(await screen.findByLabelText(`Remove ${RESOURCE.name}`)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search resources"), { target: { value: "" } });

    // The wait is what makes this test bite, and it is not padding: clearing the
    // box only re-keys the catalogue query after the 300 ms debounce, so an
    // assertion made straight away still sees the previous query's data and
    // passes even against an implementation that reads names from it. Measured:
    // without this wait, rewriting `selectedResources` to look names up in
    // `catalogue.data` — the exact bug the `Map` prevents — went undetected.
    await new Promise((r) => setTimeout(r, 500));

    expect(screen.getByLabelText(`Remove ${RESOURCE.name}`)).toBeTruthy();
  });
});

describe("an active filter that matches nothing keeps its escape hatch", () => {
  /**
   * With filtering moved server-side, a resource filter that matches nothing
   * comes back as an EMPTY `items` — indistinguishable, by the old test, from
   * "the backend has nothing scheduled this period".
   *
   * That branch renders "No maintenance is scheduled for this period" (a false
   * claim: work exists, it is filtered out) and offers only "New maintenance".
   * The "Reset filters" button lives in the other branch, so the one control
   * that undoes the filter disappears exactly when it is needed.
   *
   * Reverting this fix alone leaves the whole suite green, which is what makes
   * it a silent regression and this test worth its weight.
   */
  it("shows the filter-empty card, with Reset, rather than claiming the period is empty", async () => {
    render(<CalendarPage />, { wrapper });
    await waitFor(() => expect(calendarPaths().length).toBeGreaterThan(0));

    // The mock returns `items: []` for every calendar call, so the filtered
    // window is empty — the exact situation under test.
    await selectResource();
    await waitFor(() => expect(resourceIdsOf(calendarPaths().at(-1)!)).toEqual([RESOURCE.id]));

    expect(await screen.findByRole("button", { name: "Reset filters" })).toBeTruthy();
    expect(screen.queryByText(/No maintenance is scheduled for this period/i)).toBeNull();
  });

  it("still says the period is empty when no filter is active", async () => {
    // The other half of the branch: with default filters an empty window really
    // does mean nothing is scheduled, and offering "Reset filters" there would
    // be a control that changes nothing.
    render(<CalendarPage />, { wrapper });

    expect(await screen.findByText(/No maintenance scheduled for this period/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reset filters" })).toBeNull();
  });
});

describe("the resource picker reads the catalogue, not the loaded window", () => {
  it("issues no catalogue request while the search box is empty", async () => {
    render(<CalendarPage />, { wrapper });
    await waitFor(() => expect(calendarPaths().length).toBeGreaterThan(0));

    // Give a debounce window a chance to fire, so this asserts "never" rather
    // than "not yet".
    await new Promise((r) => setTimeout(r, 400));

    expect(paths().filter((p) => p.includes("/api/resources"))).toEqual([]);
  });

  it("requests the catalogue by name once the operator types", async () => {
    render(<CalendarPage />, { wrapper });
    await waitFor(() => expect(calendarPaths().length).toBeGreaterThan(0));

    fireEvent.change(await screen.findByLabelText("Search resources"), {
      target: { value: "postg" },
    });

    await waitFor(() => {
      const catalogue = paths().filter((p) => p.includes("/api/resources"));
      expect(catalogue.length).toBeGreaterThan(0);
      expect(new URL(catalogue.at(-1)!, "http://localhost").searchParams.get("name")).toBe("postg");
    });
  });
});

describe("a failed catalogue load never reads as 'no such resource'", () => {
  /**
   * The bug class #55-#57 fixed in three other pickers: a request that FAILED
   * rendered the same copy as a search that legitimately matched nothing, so
   * the operator concluded the resource did not exist and stopped looking.
   *
   * Worth stating why the `Record<ResourceStatus, …>` in the sidebar does not
   * already cover this. It makes *omitting* a state a compile error — but copy
   * is a value, not a key, and swapping one message for another type-checks
   * fine. Verified: replacing the error string with the empty-state string left
   * all 1168 unit tests green before this test existed.
   */
  const typeSearch = async () => {
    fireEvent.change(await screen.findByLabelText("Search resources"), {
      target: { value: "postg" },
    });
  };

  it("says the load failed, not that nothing matched", async () => {
    bffFetchMock.mockImplementation(async (path: unknown) => {
      if (String(path).includes("/api/resources")) throw new Error("boom");
      return { items: [] };
    });

    render(<CalendarPage />, { wrapper });
    await waitFor(() => expect(calendarPaths().length).toBeGreaterThan(0));
    await typeSearch();

    // Announced, because the operator caused it by typing — a silent failure
    // here is the half of this defect that screen-reader users would meet.
    const alert = await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(alert.textContent).toBe("Couldn't load resources.");
    expect(screen.queryByText("No resources found.")).toBeNull();
  });

  /**
   * No test for "pending outranks error", deliberately, and the reason is worth
   * recording because the absence looks like an oversight.
   *
   * The precedence guards a state this query cannot reach. Measured with a probe
   * against the real hook: during a retry after a first failure the flags are
   * `{isPending: true, isError: false, status: "pending"}` — TanStack keeps a
   * query with no prior data in `pending` for the whole retry sequence and only
   * flips `isError` once the retries are exhausted. Both flags are never true at
   * once here, so a test would assert the same thing whichever branch came
   * first — and indeed, swapping the branches leaves this file green.
   *
   * The ordering stays as the safe reading (it would matter if this query ever
   * gained `placeholderData` or a refetch over existing data), but a test that
   * cannot fail is worse than none: it reports coverage it does not provide.
   */
  it("says nothing matched when the catalogue genuinely returns none", async () => {
    bffFetchMock.mockImplementation(async (path: unknown) => {
      if (String(path).includes("/api/resources")) {
        return { resources: [], total: 0, limit: 20, offset: 0 };
      }
      return { items: [] };
    });

    render(<CalendarPage />, { wrapper });
    await waitFor(() => expect(calendarPaths().length).toBeGreaterThan(0));
    await typeSearch();

    // The mirror case. Asserting BOTH directions is what pins the pair: a single
    // test would pass just as well if the two messages were identical.
    expect(await screen.findByText("No resources found.", {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByText("Couldn't load resources.")).toBeNull();
  });
});
