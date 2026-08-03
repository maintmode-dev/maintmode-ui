import { describe, expect, it, vi, beforeEach } from "vitest";

import type { AuditLogResponseDto } from "@/server/backend/contracts/maintmode-dto";

/**
 * Perf remediation B1: `GET /api/maintenance/{id}/audit` returns
 * `{ events, reference, title }`, deriving `title` from the audit rows it
 * already holds so the audit page needs no maintenance-detail request.
 *
 * These also pin the documented `limit=100` + client-side `entity_id` filter
 * workaround, which the title derivation must not disturb.
 */

const backendRequest = vi.fn<(opts: { path: string }) => Promise<AuditLogResponseDto>>();
vi.mock("@/server/backend/client/authenticated-backend-request", () => ({
  authenticatedBackendRequest: (opts: { path: string }) => backendRequest(opts),
}));

import { GET } from "../route";

beforeEach(() => {
  // Both calls are required: under vitest 4, `mockReset()` alone leaves a
  // queued-but-unconsumed `...Once` implementation in place, which then fires
  // inside whichever test runs next as an uncaught error. Same fix as
  // resolve-invitation-preview.test.ts.
  backendRequest.mockReset();
  backendRequest.mockClear();
});

/** One wire-shaped audit row. `maint_title` is the title snapshot the page heads with. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "e-1",
    created_at: "2026-06-01T10:00:00Z",
    action: "maintenance.updated",
    entity_type: "maintenance",
    entity_id: "m-1",
    metadata: { maint_title: "Core switch upgrade" },
    ...overrides,
  };
}

function call(id: string) {
  return GET(new Request(`http://localhost/api/maintenance/${id}/audit`), {
    params: Promise.resolve({ id }),
  });
}

describe("GET /api/maintenance/{id}/audit envelope (perf B1)", () => {
  it("derives `title` from the matching row's maint_title", async () => {
    backendRequest.mockResolvedValue({ logs: [row()] } as AuditLogResponseDto);
    const body = await (await call("m-1")).json();
    expect(body.title).toBe("Core switch upgrade");
    expect(body.events).toHaveLength(1);
  });

  it("takes the NEWEST snapshot so a renamed maintenance heads with its current name", async () => {
    backendRequest.mockResolvedValue({
      logs: [
        row({ id: "e-2", metadata: { maint_title: "Renamed switch upgrade" } }),
        row({ id: "e-1", metadata: { maint_title: "Original title" } }),
      ],
    } as AuditLogResponseDto);
    const body = await (await call("m-1")).json();
    expect(body.title).toBe("Renamed switch upgrade");
  });

  it("skips rows carrying no snapshot rather than heading with undefined", async () => {
    backendRequest.mockResolvedValue({
      logs: [row({ id: "e-2", metadata: {} }), row({ id: "e-1" })],
    } as AuditLogResponseDto);
    const body = await (await call("m-1")).json();
    expect(body.title).toBe("Core switch upgrade");
  });

  it("omits `title` when no row carries a snapshot", async () => {
    backendRequest.mockResolvedValue({
      logs: [row({ metadata: {} })],
    } as AuditLogResponseDto);
    const body = await (await call("m-1")).json();
    expect(body.title).toBeUndefined();
  });

  it("never derives a title from another maintenance's rows", async () => {
    backendRequest.mockResolvedValue({
      logs: [
        row({ id: "e-9", entity_id: "m-OTHER", metadata: { maint_title: "Someone else's title" } }),
        row(),
      ],
    } as AuditLogResponseDto);
    const body = await (await call("m-1")).json();
    // The foreign row is newest; deriving before the entity_id filter would take it.
    expect(body.title).toBe("Core switch upgrade");
    expect(body.events).toHaveLength(1);
  });

  it("preserves the documented limit=100 + entity_id filter workaround", async () => {
    backendRequest.mockResolvedValue({
      logs: [row(), row({ id: "e-2", entity_id: "m-OTHER" })],
    } as AuditLogResponseDto);
    const body = await (await call("m-1")).json();
    expect(backendRequest.mock.calls[0][0].path).toContain("limit=100");
    expect(body.events).toHaveLength(1);
    expect(body.events[0].entity_id).toBe("m-1");
  });

  /**
   * Error and empty-id paths, both previously unreachable by this suite: every
   * other case here resolves the backend, so replacing the `catch` with a 200
   * returning an empty envelope left the suite green. A backend 403/500 would
   * have degraded silently into "no audit events" — an empty history reads as
   * "nothing ever happened", which is the wrong thing to tell an operator
   * reading an audit trail.
   */
  it("surfaces a backend failure instead of rendering an empty history", async () => {
    backendRequest.mockRejectedValue(new Error("backend exploded"));

    const response = await call("m-1");

    expect(response.status).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body.events).toBeUndefined();
  });

  it("short-circuits an empty id without calling the backend", async () => {
    const body = await (await call("")).json();

    expect(backendRequest).not.toHaveBeenCalled();
    expect(body.events).toEqual([]);
  });
});
