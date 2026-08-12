import { describe, expect, it, vi } from "vitest";

import { createBackendMock, readWireFixture } from "./_harness";

import type { AuditLogDto, AuditLogResponseDto } from "@/server/backend/contracts/maintmode-dto";

/**
 * Contract test — `GET /api/maintenance/{id}/audit`. RUK-254, SPEC §4.1/§4.5.
 *
 * Perf remediation B1: the route returns `{ events, reference, title }`,
 * deriving `title` from the audit rows it already holds so the audit page needs
 * no maintenance-detail request.
 *
 * These also pin the documented `limit=100` + client-side `entity_id` filter
 * workaround, which the title derivation must not disturb.
 *
 * ## What the fixture can and cannot anchor here
 *
 * Rows are built on a RECORDED audit row (`tests/fixtures/wire/audit-log.json`),
 * so the envelope every case relies on — `id`, `created_at`, `action`,
 * `entity_type`, `entity_id`, `metadata` — is present because the backend sends
 * it, not because it was typed here.
 *
 * The MAINTENANCE-specific values are still explicit, and that is a finding
 * rather than a shortcut: the capture contains only `login.success` and
 * `roles.changed` rows on `user` entities, so it carries no `maint_title` and
 * no `maintenance.*` action at all. This endpoint's title derivation therefore
 * runs against a row shape the fixture cannot prove exists — recorded in
 * `docs/contract-gaps.md` as an unproven capture rather than papered over. The
 * honest statement is: the envelope is wire-anchored, the maintenance payload
 * is not, and seeding a maintenance-audit row would close that.
 */

const wire = readWireFixture<AuditLogResponseDto>("audit-log.json");

// No default response: each case builds the rows it needs from `row()` below.
const backendRequest = createBackendMock<AuditLogResponseDto>();
vi.mock("@/server/backend/client/authenticated-backend-request", () => ({
  authenticatedBackendRequest: (opts: { path: string }) => backendRequest(opts),
}));

const { GET } = await import("@/app/api/maintenance/[id]/audit/route");

/**
 * One audit row: the recorded envelope, re-pointed at a maintenance entity.
 *
 * `maint_title` is the title snapshot the page heads with. It is supplied here
 * because the capture has no maintenance rows to take it from (see header).
 */
function row(overrides: Record<string, unknown> = {}): AuditLogDto {
  const [recorded] = wire.logs ?? [];
  if (!recorded) throw new Error("audit-log.json recorded no rows — refresh the fixture");
  return {
    ...recorded,
    id: "e-1",
    action: "maintenance.updated",
    entity_type: "maintenance",
    entity_id: "m-1",
    metadata: { maint_title: "Core switch upgrade" },
    ...overrides,
  } as AuditLogDto;
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
