// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SeatsUsage } from "@/domain/admin/seats";
import { BffError } from "@/features/_shared/api/bff-fetch";

import { useSeatsQuery } from "../queries/use-users-queries";
import { SeatsIndicator } from "../seats-indicator";

const bffFetchMock = vi.fn();
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (...args: unknown[]) => bffFetchMock(...args) };
});

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a) } }));

beforeEach(() => {
  bffFetchMock.mockReset();
  toastError.mockReset();
});
afterEach(cleanup);

function seats(overrides: Partial<SeatsUsage> = {}): SeatsUsage {
  return {
    seats_purchased: 5,
    seats_used: 4,
    seats_pending: 1,
    seats_occupied: 5,
    unlimited: false,
    ...overrides,
  };
}

function renderIndicator() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SeatsIndicator />
    </QueryClientProvider>,
  );
}

/**
 * Renders "settled" once the seats query has resolved or failed.
 *
 * Needed because `bffFetch` is called synchronously on the first render, so
 * `waitFor(() => expect(bffFetchMock).toHaveBeenCalled())` is already true on
 * the frame *before* any data exists. Asserting "the indicator is absent"
 * against that frame passes no matter what the component does — the block is
 * absent because nothing has loaded yet. Every hidden-state test needs a lower
 * bound that only a finished request can satisfy.
 */
function SeatsProbe() {
  const { isSuccess, isError } = useSeatsQuery();
  return <span data-testid="seats-probe">{isSuccess || isError ? "settled" : "loading"}</span>;
}

/** Renders the indicator alongside the settle probe, and waits for the probe. */
async function renderSettled() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <SeatsIndicator />
      <SeatsProbe />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("seats-probe").textContent).toBe("settled"));
  return view;
}

/** Everything rendered except the probe — so "empty" means the indicator is absent. */
function contentWithoutProbe(container: HTMLElement): string {
  return (container.textContent ?? "").replace(/settled|loading/g, "").trim();
}

/**
 * Asserts the component rendered *nothing at all* — no text and no reserved
 * line. Text alone is not enough: the loading placeholder is also textless, so
 * a component that never collapsed it would satisfy a textContent check while
 * leaving a blank row in the header of every self-hosted install forever.
 */
function expectFullyCollapsed(container: HTMLElement) {
  expect(contentWithoutProbe(container)).toBe("");
  expect(container.querySelector("p.caption")).toBeNull();
}

/** Collapsed text of the indicator, or "" when it isn't rendered. */
function indicatorText(): string {
  const el = document.querySelector('[data-testid="seats-indicator"]');
  return el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

describe("SeatsIndicator", () => {
  it("shows used, pending and occupied against the ceiling (AC-01)", async () => {
    bffFetchMock.mockResolvedValue(seats({ seats_purchased: 10, seats_occupied: 5 }));
    renderIndicator();

    await waitFor(() => expect(indicatorText()).not.toBe(""));
    expect(indicatorText()).toMatch(/4 used/);
    expect(indicatorText()).toMatch(/1 pending/);
    expect(indicatorText()).toMatch(/5 of 10/);
    expect(indicatorText()).toMatch(/seats/);
  });

  // AC-02, the load-bearing test of this feature. The fixture is deliberately
  // IMPOSSIBLE against the real backend (there occupied == used + pending) —
  // do NOT "fix" it into consistency. Its whole job is to tell a component that
  // reads seats_occupied apart from one that sums the two halves, and on any
  // realistic fixture both spellings render identically.
  it("renders the server's seats_occupied, never used + pending (AC-02)", async () => {
    bffFetchMock.mockResolvedValue({
      seats_purchased: 10,
      seats_used: 4,
      seats_pending: 1,
      seats_occupied: 9,
      unlimited: false,
    } satisfies SeatsUsage);
    renderIndicator();

    await waitFor(() => expect(indicatorText()).not.toBe(""));
    expect(indicatorText()).toMatch(/9 of 10/);
    // The two ways to get this wrong:
    expect(indicatorText()).not.toMatch(/5 of 10/); // summed on the client
    expect(indicatorText()).not.toMatch(/4 of 10/); // used mistaken for occupied
  });

  it("renders nothing when unlimited, even with real counters (AC-03)", async () => {
    bffFetchMock.mockResolvedValue(
      seats({ unlimited: true, seats_purchased: null, seats_used: 4, seats_occupied: 5 }),
    );
    const { container } = await renderSettled();

    expect(indicatorText()).toBe("");
    expectFullyCollapsed(container);
  });

  // AC-03b: proves the second guard is not dead code a reviewer could delete.
  it.each([
    ["null ceiling while not unlimited", null],
    ["absent ceiling (unvalidated wire)", undefined],
  ])("stays hidden on a broken invariant: %s (AC-03b)", async (_label, purchased) => {
    bffFetchMock.mockResolvedValue({
      ...seats(),
      unlimited: false,
      seats_purchased: purchased as number | null,
    });
    const { container } = await renderSettled();

    expectFullyCollapsed(container);
    expect(container.textContent).not.toMatch(/null|undefined|NaN/);
  });

  it("accents at the cap and states it in the accessible name (AC-04)", async () => {
    bffFetchMock.mockResolvedValue(seats({ seats_purchased: 5, seats_occupied: 5 }));
    renderIndicator();

    await waitFor(() => expect(indicatorText()).not.toBe(""));
    // Not colour alone: the state has to survive into the accessible name.
    const label = screen.getByLabelText(/no seats left/i);
    expect(label).toBeTruthy();
  });

  // The visible line must state the condition, not leave it to be inferred from
  // "5 of 5". That inference is exactly what made the old one-line treatment
  // easy to miss: it looked like the passive caption above it.
  it("says 'No seats left' in the visible text at the cap (AC-04)", async () => {
    bffFetchMock.mockResolvedValue(seats({ seats_purchased: 5, seats_occupied: 5 }));
    renderIndicator();
    await waitFor(() => expect(indicatorText()).not.toBe(""));

    expect(indicatorText()).toMatch(/No seats left/);
    // …and the counts stay, so the admin sees both the verdict and the numbers.
    expect(indicatorText()).toMatch(/5 of 5 seats/);
  });

  it("says nothing of the sort below the cap (AC-04)", async () => {
    bffFetchMock.mockResolvedValue(seats({ seats_purchased: 10, seats_occupied: 5 }));
    renderIndicator();
    await waitFor(() => expect(indicatorText()).not.toBe(""));

    expect(indicatorText()).not.toMatch(/No seats left/i);
  });

  it("marks the at-cap state visually, not by colour alone (AC-04)", async () => {
    bffFetchMock.mockResolvedValue(seats({ seats_purchased: 5, seats_occupied: 5 }));
    renderIndicator();
    await waitFor(() => expect(indicatorText()).not.toBe(""));

    const root = document.querySelector('[data-testid="seats-indicator"]')!;
    expect(root.className).toMatch(/impact-partial-fg/);
    // An icon as well as the colour — the warning must not be carried by hue
    // alone for anyone who cannot distinguish it.
    expect(root.querySelector("svg")).toBeTruthy();
  });

  // Without this negative twin, painting the row warning-coloured *always*
  // would satisfy the test above.
  it("shows no accent and no icon below the cap (AC-04)", async () => {
    bffFetchMock.mockResolvedValue(seats({ seats_purchased: 10, seats_occupied: 5 }));
    renderIndicator();
    await waitFor(() => expect(indicatorText()).not.toBe(""));

    const root = document.querySelector('[data-testid="seats-indicator"]')!;
    expect(root.className).not.toMatch(/impact-partial-fg/);
    expect(root.querySelector("svg")).toBeNull();
  });

  it("puts every number into the accessible name (AC-04, §4.5)", async () => {
    bffFetchMock.mockResolvedValue(
      seats({ seats_purchased: 10, seats_used: 4, seats_pending: 1, seats_occupied: 9 }),
    );
    renderIndicator();
    await waitFor(() => expect(indicatorText()).not.toBe(""));

    // The visible span is aria-hidden, so this string is the only thing a
    // screen reader receives. Assert it whole rather than probing a fragment:
    // the numbers live nowhere else in the accessibility tree.
    const root = document.querySelector('[data-testid="seats-indicator"]')!;
    expect(root.getAttribute("aria-label")).toBe("Seats: 9 of 10 used, 4 active, 1 pending");

    // Pin the assumption the line above depends on. Without aria-hidden a
    // screen reader would read the label *and* the span, announcing every
    // number twice, the second time separated by "·" — which is exactly the
    // punctuation the label exists to avoid.
    expect(root.querySelector("span")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("omits the no-seats-left suffix below the cap (AC-04)", async () => {
    bffFetchMock.mockResolvedValue(seats({ seats_purchased: 10, seats_occupied: 5 }));
    renderIndicator();
    await waitFor(() => expect(indicatorText()).not.toBe(""));

    const label = document.querySelector('[data-testid="seats-indicator"]')!.getAttribute("aria-label");
    expect(label).not.toMatch(/no seats left/);
  });

  // AC-09, copy half. The header's own caption says "{n} active · {m} pending
  // invitations" with different semantics — it counts guests, seats_used does
  // not — so this line must not reuse "active" for a number that means
  // something else. The collision itself is asserted at page level, where both
  // strings exist in one DOM (see seats-at-cap-invite.test.tsx).
  it("labels seats_used 'used', never 'active' (AC-09)", async () => {
    bffFetchMock.mockResolvedValue(seats({ seats_purchased: 10, seats_occupied: 5 }));
    renderIndicator();
    await waitFor(() => expect(indicatorText()).not.toBe(""));

    expect(indicatorText()).toMatch(/\bused\b/);
    expect(indicatorText()).not.toMatch(/\bactive\b/);
    expect(indicatorText()).toMatch(/\bseats\b/);
  });

  it("reports overage honestly (AC-04)", async () => {
    bffFetchMock.mockResolvedValue(seats({ seats_purchased: 5, seats_used: 6, seats_occupied: 7 }));
    renderIndicator();

    await waitFor(() => expect(indicatorText()).not.toBe(""));
    expect(indicatorText()).toMatch(/7 of 5/);
  });

  // Rejects with a plain 500, NOT a 401: the real bffFetch never throws on a
  // 401 AUTH_REQUIRED — it redirects and returns a never-resolving promise — so
  // a 401 fixture would make this pass for a reason production never exercises.
  // Rejects with a plain 500, NOT a 401: the real bffFetch never throws on a
  // 401 AUTH_REQUIRED — it redirects and returns a never-resolving promise — so
  // a 401 fixture would make this pass for a reason production never exercises.
  //
  // The three shapes below all take the same `!data` path, which is the point:
  // the component keys off the absence of data, not off a status code.
  it.each([
    ["500", () => new BffError(500, "boom")],
    ["403 (not an admin)", () => new BffError(403, "forbidden")],
    ["a dropped connection", () => new TypeError("Failed to fetch")],
  ])("hides the block and stays quiet on %s (AC-05)", async (_label, makeError) => {
    bffFetchMock.mockRejectedValue(makeError());
    const { container } = await renderSettled();

    expectFullyCollapsed(container);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("replaces the placeholder rather than rendering both (AC-05b)", async () => {
    let resolve!: (v: SeatsUsage) => void;
    bffFetchMock.mockReturnValue(new Promise<SeatsUsage>((r) => (resolve = r)));
    const { container } = renderIndicator();

    // One reserved line while pending...
    expect(container.querySelectorAll("p.caption")).toHaveLength(1);

    resolve(seats({ seats_purchased: 10, seats_occupied: 5 }));
    await waitFor(() => expect(indicatorText()).not.toBe(""));

    // ...and still exactly one afterwards. A leftover placeholder beside the
    // real line is invisible to every other assertion in this file — they all
    // scope inside the indicator — while doubling the header's height, which is
    // the very layout bug the pending branch exists to prevent.
    expect(container.querySelectorAll("p.caption")).toHaveLength(1);
    expect(container.querySelector("p.caption")?.getAttribute("data-testid")).toBe("seats-indicator");
  });

  it("shows no text but reserves the line while the first request is in flight (AC-05b)", () => {
    bffFetchMock.mockReturnValue(new Promise(() => {}));
    const { container } = renderIndicator();

    // No numbers yet...
    expect(container.textContent).toBe("");
    // ...but the row occupies its height, so a late answer does not push the
    // page down. Measured on the live stack: the rendered indicator displaces
    // the table and the Invite button by 35px.
    const placeholder = container.querySelector("p.caption");
    expect(placeholder).toBeTruthy();
    expect(placeholder!.getAttribute("aria-hidden")).toBe("true");
    // It carries no accessible content — a screen reader must not announce an
    // empty line where a counter will appear.
    expect(placeholder!.getAttribute("data-testid")).toBeNull();
  });

  it("keeps the previous numbers visible while a refetch is in flight (AC-05b)", async () => {
    bffFetchMock.mockResolvedValue(seats({ seats_purchased: 10, seats_occupied: 5 }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SeatsIndicator />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(indicatorText()).toMatch(/5 of 10/));

    // Second load never settles: the component is now fetching *with* data.
    // Not awaited — `invalidateQueries` resolves only once the refetch it
    // triggers settles, and this one never does by design.
    bffFetchMock.mockReturnValue(new Promise(() => {}));
    void client.invalidateQueries({ queryKey: ["seats"] });
    await waitFor(() => expect(bffFetchMock).toHaveBeenCalledTimes(2));

    // No skeleton, no blank gap — otherwise the header would flicker after
    // every one of the ten invalidation sites.
    expect(indicatorText()).toMatch(/5 of 10/);
  });

  // A zero ceiling is an unprovisioned plan, not a filled one. Warning here
  // would fire on every fresh instance and after any downgrade to zero.
  it("does not cry 'no seats left' on a zero ceiling", async () => {
    bffFetchMock.mockResolvedValue(
      seats({ seats_purchased: 0, seats_used: 0, seats_pending: 0, seats_occupied: 0 }),
    );
    renderIndicator();
    await waitFor(() => expect(indicatorText()).not.toBe(""));

    const root = document.querySelector('[data-testid="seats-indicator"]')!;
    expect(root.getAttribute("aria-label")).not.toMatch(/no seats left/);
    expect(root.querySelector("svg")).toBeNull();
    expect(root.className).not.toMatch(/impact-partial-fg/);
  });

  // The ceiling guard existed from the start; the counters had none, so a
  // dropped or drifted key rendered "used · pending · of 10 seats" and leaked
  // "undefined" into the accessible name — the only text a screen reader gets.
  it.each([
    ["counters missing", { seats_purchased: 10, unlimited: false }],
    [
      "counters null",
      { seats_purchased: 10, seats_used: null, seats_pending: null, seats_occupied: null, unlimited: false },
    ],
    [
      "counters as strings",
      { seats_purchased: 10, seats_used: "4", seats_pending: "1", seats_occupied: "9", unlimited: false },
    ],
  ])("hides rather than render a malformed body: %s", async (_label, payload) => {
    bffFetchMock.mockResolvedValue(payload);
    const { container } = await renderSettled();

    expectFullyCollapsed(container);
    expect(container.textContent).not.toMatch(/undefined|null|NaN/);
  });
});
