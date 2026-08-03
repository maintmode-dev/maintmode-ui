// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuditEvent } from "@/domain/audit/audit-log";

/**
 * Perf remediation B1: the per-maintenance audit page heads itself from the
 * audit envelope (`{ events, reference, title }`) instead of fetching the whole
 * `MaintenanceViewResponse` for two strings.
 *
 * The load-bearing assertion is the NEGATIVE one — that no request to
 * `/api/maintenance/{id}` (the detail route) is issued. The heading assertions
 * alone would pass against the old implementation too, since it rendered the
 * same strings from the detail payload; only the call-path assertion
 * distinguishes the two.
 */

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const auditEnvelope = vi.fn<() => { events: AuditEvent[]; reference?: string; title?: string }>(() => ({
  events: [],
}));

// Typed as (path, ...rest) so `call[0]` is a known element rather than an index
// into an empty tuple — a bare `vi.fn(async () => …)` infers zero arity, which
// makes both the spread and the `call[0]` read fail `tsc`.
const bffFetchMock = vi.fn(async (path: unknown, ..._rest: unknown[]) => {
  const url = String(path);
  if (url.includes("/audit")) return auditEnvelope();
  // The detail route must never be reached. Returning a plausible payload (rather
  // than throwing) keeps this honest: if the page regressed to fetching detail,
  // it would still render correctly and ONLY the call-path assertion would fail.
  return { id: "m-1", title: "Detail-sourced title", reference: "MNT-9999" };
});
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (path: unknown, ...rest: unknown[]) => bffFetchMock(path, ...rest) };
});

import { MaintenanceAuditPage } from "../maintenance-audit-page";

/** Requests to the maintenance DETAIL route — `/api/maintenance/{id}` with no suffix. */
const detailRequests = () =>
  bffFetchMock.mock.calls.filter((call) => /\/api\/maintenance\/[^/]+$/.test(String(call[0])));

const auditRequests = () => bffFetchMock.mock.calls.filter((call) => String(call[0]).includes("/audit"));

function event(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: "e-1",
    created_at: "2026-06-01T10:00:00Z",
    action: "maintenance.updated",
    entity_type: "maintenance",
    entity_id: "m-1",
    ...overrides,
  } as AuditEvent;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MaintenanceAuditPage id="m-1" />
    </QueryClientProvider>,
  );
}

describe("MaintenanceAuditPage single-request heading (perf B1)", () => {
  it("never requests the maintenance detail route", async () => {
    auditEnvelope.mockReturnValue({ events: [event()], title: "Envelope title" });
    renderPage();
    await waitFor(() => expect(auditRequests()).toHaveLength(1));
    // Give a stray detail query the same chance to fire that the audit one got.
    await Promise.resolve();
    expect(detailRequests()).toHaveLength(0);
  });

  it("heads the page from the envelope title, not the detail payload", async () => {
    auditEnvelope.mockReturnValue({ events: [event()], title: "Envelope title" });
    renderPage();
    // "Detail-sourced title" is what the detail route would have supplied.
    expect(await screen.findByRole("heading", { level: 1, name: "Envelope title" })).toBeTruthy();
    expect(screen.queryByText("Detail-sourced title")).toBeNull();
  });

  it("renders the reference in the heading and back-label when present", async () => {
    auditEnvelope.mockReturnValue({
      events: [event()],
      reference: "MNT-1042",
      title: "Core switch upgrade",
    });
    renderPage();
    expect(await screen.findByRole("link", { name: /Back to MNT-1042/ })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Core switch upgrade" })).toBeTruthy();
    expect(screen.getAllByText("MNT-1042").length).toBeGreaterThan(0);
  });

  it("degrades to the neutral back-label and the raw id when both are absent", async () => {
    auditEnvelope.mockReturnValue({ events: [event()] });
    renderPage();
    expect(await screen.findByRole("link", { name: /Back to maintenance/ })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "m-1" })).toBeTruthy();
    expect(screen.queryByText(/MNT-/)).toBeNull();
  });
});
