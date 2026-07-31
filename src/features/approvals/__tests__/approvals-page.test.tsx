// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApprovalRow, ApprovalsPage as ApprovalsPageData } from "@/domain/maintenance/approval";
import { BffError } from "@/features/_shared/api/bff-fetch";

// Radix (the quick-sheet) needs these in jsdom.
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
});

const bffFetchMock = vi.fn();
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (...args: unknown[]) => bffFetchMock(...args) };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// Pin the zone: useTimezone resolves to UTC only after mount, and the suite
// runs under TZ=Asia/Nicosia, so an unpinned hook would make window text
// depend on render timing.
vi.mock("@/features/_shared/timezone/use-timezone", () => ({
  useTimezone: () => ({ zone: "UTC", ready: true }),
}));

import { ApprovalsPage } from "../approvals-page";

beforeEach(() => {
  bffFetchMock.mockReset();
});
afterEach(cleanup);

function approval(overrides: Partial<ApprovalRow> = {}): ApprovalRow {
  return {
    id: "m-1",
    title: "Cluster upgrade",
    start: "2026-08-01T10:00:00Z",
    end: "2026-08-01T12:00:00Z",
    scope: "resource",
    impact: "partial_outage",
    created_by: "Ivan Petrov",
    created_at: "2026-07-30T09:15:00Z",
    ...overrides,
  };
}

function page(rows: ApprovalRow[], total = rows.length): ApprovalsPageData {
  return { items: rows, total, limit: 50, offset: 0 };
}

/** Route by path, and throw loudly on anything unexpected — a silent undefined
 *  would surface as an unrelated render failure much later. */
function serve(data: ApprovalsPageData, detail?: unknown) {
  bffFetchMock.mockImplementation(async (path: string) => {
    if (path.startsWith("/api/approvals")) return data;
    if (path.startsWith("/api/maintenance/")) {
      if (detail) return detail;
      throw new BffError(404, "not found");
    }
    if (path === "/api/me") return { id: "u-1", email: "me@example.com", roles: ["reviewer"] };
    throw new Error(`unexpected bffFetch: ${path}`);
  });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ApprovalsPage />
    </QueryClientProvider>,
  );
}

const bodyRows = () => Array.from(document.querySelectorAll("tbody tr"));
const headers = () => Array.from(document.querySelectorAll("thead th")).map((th) => th.textContent?.trim());

describe("ApprovalsPage — table", () => {
  it("renders one row per queued maintenance", async () => {
    serve(page([approval({ id: "a" }), approval({ id: "b", title: "DB failover" })]));
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    expect(screen.getByText("Cluster upgrade")).toBeTruthy();
    expect(screen.getByText("DB failover")).toBeTruthy();
  });

  it("has no status column", async () => {
    // The backend omits status because the listing is drafts by definition.
    // A column here would mean inventing a value the response never carried.
    serve(page([approval()]));
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    expect(headers()).not.toContain("Status");
  });

  it("shows the author, and falls back when the backend could not resolve one", async () => {
    serve(page([approval({ id: "named" }), approval({ id: "anon", created_by: undefined })]));
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    expect(screen.getByText("Ivan Petrov")).toBeTruthy();
    // The row must still be there — hiding it would hide work from its approver.
    expect(screen.getByText("Unknown user")).toBeTruthy();
  });
});

describe("ApprovalsPage — open-ended windows (AC-05 render half)", () => {
  it("labels an open-ended window instead of printing a year-1 date", async () => {
    serve(page([approval({ id: "open", end: undefined }), approval({ id: "bounded" })]));
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    expect(screen.getByText(/open-ended/)).toBeTruthy();
    // The failure this guards against renders the Go zero value as a real
    // date, so assert the year cannot appear anywhere on the page.
    expect(screen.queryByText(/0001/)).toBeNull();
    expect(document.body.textContent).not.toContain("0001");
  });
});

describe("ApprovalsPage — states", () => {
  it("shows the empty state rather than a bare table header", async () => {
    serve(page([], 0));
    renderPage();

    await waitFor(() => expect(screen.getByText(/Nothing is waiting for your approval/)).toBeTruthy());
    expect(document.querySelector("thead")).toBeNull();
  });

  it("offers Retry on a generic failure", async () => {
    bffFetchMock.mockImplementation(() => Promise.reject(new BffError(500, "boom")));
    renderPage();

    // Longer window than the other states on purpose: a 500 is retryable, so
    // the hook makes one more attempt (with backoff) before settling on error.
    // 403 and the success paths settle immediately and need no extra time.
    await waitFor(() => expect(screen.getByText(/Couldn't load approvals/)).toBeTruthy(), {
      timeout: 5000,
    });
    expect(screen.getByRole("button", { name: /Retry/ })).toBeTruthy();
  });

  it("shows the forbidden state without a Retry on 403", async () => {
    // Retrying cannot grant a role, so a Retry button here would be false advice.
    bffFetchMock.mockImplementation(() => Promise.reject(new BffError(403, "forbidden")));
    renderPage();

    await waitFor(() => expect(screen.getByText(/You don't have access/)).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Retry/ })).toBeNull();
  });
});

describe("ApprovalsPage — pagination", () => {
  it("is absent when the queue fits on one page", async () => {
    serve(page([approval()], 1));
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    expect(screen.queryByRole("button", { name: /Next/ })).toBeNull();
  });

  it("appears once the total exceeds the page size", async () => {
    serve(page([approval()], 51));
    renderPage();

    await waitFor(() => expect(screen.getByRole("button", { name: /Next/ })).toBeTruthy());
    // Previous is disabled on the first page rather than hidden, so the
    // control's position does not shift as the reviewer pages through.
    expect(screen.getByRole("button", { name: /Previous/ }).hasAttribute("disabled")).toBe(true);
  });

  it("requests the next page when Next is clicked", async () => {
    // Rendering the control is not the same as wiring it. Assert the offset
    // actually reaches the BFF, since the page size lives server-side and a
    // mis-stepped offset would silently skip or repeat rows.
    serve(page([approval()], 120));
    renderPage();

    await waitFor(() => expect(screen.getByRole("button", { name: /Next/ })).toBeTruthy());
    screen.getByRole("button", { name: /Next/ }).click();

    await waitFor(() =>
      expect(bffFetchMock.mock.calls.some(([p]) => String(p).includes("offset=50"))).toBe(true),
    );
  });

  it("walks back to the first page when Previous is clicked", async () => {
    serve(page([approval()], 120));
    renderPage();

    await waitFor(() => expect(screen.getByRole("button", { name: /Next/ })).toBeTruthy());
    screen.getByRole("button", { name: /Next/ }).click();
    await waitFor(() =>
      expect(bffFetchMock.mock.calls.some(([p]) => String(p).includes("offset=50"))).toBe(true),
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Previous/ }).hasAttribute("disabled")).toBe(false),
    );
    screen.getByRole("button", { name: /Previous/ }).click();

    // Assert the state we land in, not the number of fetches: page 0 is already
    // cached, so returning to it need not re-hit the network at all.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Previous/ }).hasAttribute("disabled")).toBe(true),
    );
    // Never a negative offset — the backend coerces it away silently, which
    // would look like the page simply repeating itself.
    expect(bffFetchMock.mock.calls.some(([p]) => String(p).includes("offset=-"))).toBe(false);
  });

  it("does not strand the reviewer on a page that emptied out", async () => {
    // The trap: approving the last row of page two (which the quick-sheet lets
    // you do without leaving the page) refetches into an empty page. If the
    // generic empty state wins, the pagination disappears with the table — and
    // since offset lives in useState rather than the URL, there is no way back
    // except a manual reload. The header would meanwhile still read "50 pending".
    // Page two is already empty when the reviewer arrives — the same state the
    // refetch lands in, reached deterministically.
    bffFetchMock.mockImplementation(async (path: string) => {
      if (path.includes("offset=50")) return page([], 50);
      if (path.startsWith("/api/approvals")) return page([approval()], 51);
      if (path === "/api/me") return { id: "u-1", email: "me@example.com", roles: ["reviewer"] };
      throw new Error(`unexpected bffFetch: ${path}`);
    });

    renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: /Next/ })).toBeTruthy());
    screen.getByRole("button", { name: /Next/ }).click();

    // Wait for the empty page to land — the table disappears with it.
    await waitFor(() => expect(document.querySelector("tbody")).toBeNull());
    // There must still be a way back to the rest of the queue: offset lives in
    // useState, so without a control the only escape is a manual reload.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Previous|first page|Back/i })).not.toBeNull(),
    );
  });

  it("labels the range from the rows on screen, never backwards", async () => {
    // A partially drained page holds fewer rows than it was sized for. Deriving
    // the range from offset + PAGE_SIZE then claims something like "51–50 of 60".
    bffFetchMock.mockImplementation(async (path: string) => {
      if (path.includes("offset=50")) return { items: [approval()], total: 60, limit: 50, offset: 50 };
      if (path.startsWith("/api/approvals")) return page([approval()], 60);
      if (path === "/api/me") return { id: "u-1", email: "me@example.com", roles: ["reviewer"] };
      throw new Error(`unexpected bffFetch: ${path}`);
    });

    renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: /Next/ })).toBeTruthy());
    screen.getByRole("button", { name: /Next/ }).click();

    await waitFor(() => expect(screen.getByText(/51–51 of 60/)).toBeTruthy());
  });

  it("disables Next on the final page", async () => {
    // total=51 means page two holds a single row; Next must not offer a third.
    serve(page([approval()], 51));
    renderPage();

    await waitFor(() => expect(screen.getByRole("button", { name: /Next/ })).toBeTruthy());
    screen.getByRole("button", { name: /Next/ }).click();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Next/ }).hasAttribute("disabled")).toBe(true),
    );
  });
});

describe("ApprovalsPage — row click", () => {
  it("opens the quick-sheet for the clicked maintenance", async () => {
    serve(page([approval({ id: "m-42", title: "Cluster upgrade" })]), {
      id: "m-42",
      title: "Cluster upgrade",
      status: "draft",
      impact: "partial_outage",
      scope: "resource",
      planned_period: { start: "2026-08-01T10:00:00Z", end: "2026-08-01T12:00:00Z" },
      resources: [],
      notify_targets: [],
      steps: [],
      conflicts: [],
      actions: {
        can_edit: false,
        can_cancel: false,
        can_approve: false,
        can_start: false,
        can_complete: false,
      },
      revision: 1,
      created_at: "2026-07-30T09:15:00Z",
    });
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    bodyRows()[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));

    // The sheet fetches the detail itself; seeing that request is what proves
    // the row wired through to it.
    await waitFor(() =>
      expect(bffFetchMock.mock.calls.some(([p]) => String(p).startsWith("/api/maintenance/m-42"))).toBe(true),
    );
  });
});
