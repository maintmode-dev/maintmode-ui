import { describe, expect, it, vi } from "vitest";

import { createBackendMock, readWireFixture, backendQuery } from "./_harness";

import type { ListApprovalsResponseDto } from "@/server/backend/contracts/approvals-dto";

/**
 * Contract test — `GET /api/approvals`. RUK-254, SPEC-RUK-254.md §4.1/§4.5.
 *
 * ## What this file deliberately does NOT do
 *
 * The recorded capture is `{"maintenances": [], "total": 0, "limit": 20,
 * "offset": 0}` — an EMPTY queue, which the manifest flags as
 * `provesNothing: ["maintenances"]`. An empty collection pins no field of a
 * row, so this fixture cannot testify to the shape of an approval row at all.
 *
 * The tempting move is to write row assertions anyway, driving them with a
 * hand-built row so the file looks like the others. That would be worse than no
 * test: it would report coverage for the row shape while proving only that a
 * literal typed in this file round-trips through the mapper — precisely the
 * self-agreement SPEC §4.1 point 4 exists to forbid, and precisely how RUK-256
 * stayed green while the resource filter was dead.
 *
 * So the split here is explicit:
 *
 *  - The ENVELOPE (`maintenances`/`total`/`limit`/`offset`) is wire-anchored —
 *    those keys are present in the capture and are asserted against it.
 *  - The ROW SHAPE is NOT asserted, and is recorded in `docs/contract-gaps.md`
 *    as an unproven capture. Closing it needs seed data with a maintenance
 *    awaiting approval, not a cleverer test.
 *  - Request forwarding and error handling are fully covered: neither depends
 *    on rows existing.
 *
 * The paging assertions carry their own weight regardless. This route does not
 * forward the caller's `limit` — it pins `PAGE_SIZE` server-side — so the thing
 * worth pinning is that a client CANNOT widen the page, which is an authz-ish
 * property rather than a passthrough one.
 */

const wire = readWireFixture<ListApprovalsResponseDto>("approvals.json");

const backendRequest = createBackendMock(wire);
vi.mock("@/server/backend/client/authenticated-backend-request", () => ({
  authenticatedBackendRequest: (opts: { path: string }) => backendRequest(opts),
}));

const { GET } = await import("@/app/api/approvals/route");

async function backendQueryFor(query = ""): Promise<URLSearchParams> {
  await GET(new Request(`http://localhost/api/approvals${query ? `?${query}` : ""}`));
  return backendQuery(backendRequest);
}

describe("GET /api/approvals — request forwarding", () => {
  it("sets the page size itself rather than letting the caller choose", async () => {
    // The backend coerces anything over 200 back down to 50, so a
    // client-supplied `limit` would make the cache key lie about what was
    // actually requested. Pinned as an independent literal: a route that
    // started forwarding the caller's value fails here.
    const query = await backendQueryFor("limit=999");

    expect(query.get("limit")).toBe("50");
  });

  it("forwards a valid `offset` so paging reaches the second page", async () => {
    const query = await backendQueryFor("offset=50");

    expect(query.get("offset")).toBe("50");
  });

  it("falls back to the first page for a malformed or out-of-range `offset`", async () => {
    // Not merely defensive: forwarding a 400-digit offset would splice it into
    // the backend's query string. Out-of-range degrades to page one, matching
    // the backend's own coercion rather than erroring.
    for (const raw of ["abc", "-5", "999999999", "1e9"]) {
      backendRequest.mockClear();
      const query = await backendQueryFor(`offset=${raw}`);
      expect(`${raw} -> ${query.get("offset")}`).toBe(`${raw} -> 0`);
    }
  });

  it("never sends an approver identity — the backend takes it from the token", async () => {
    // There is no parameter for whose queue to fetch, and there must not be:
    // one would turn a personal review list into an arbitrary-user read.
    const query = await backendQueryFor("user_id=someone-else&approver=someone-else");

    expect(query.has("user_id")).toBe(false);
    expect(query.has("approver")).toBe(false);
    expect([...query.keys()].sort()).toEqual(["limit", "offset"]);
  });
});

describe("GET /api/approvals — the recorded envelope (rows prove nothing here)", () => {
  it("carries the four envelope keys the queue pages on", () => {
    // Independent literals, asserted against the capture. These four are all
    // this fixture can testify to.
    for (const key of ["maintenances", "total", "limit", "offset"] as const) {
      expect(`${key}: ${key in wire ? "present" : "MISSING"}`).toBe(`${key}: present`);
    }
  });

  it("records `maintenances` as an array — empty, and therefore pinning no row", () => {
    // This assertion is a STATEMENT OF THE GAP, not of coverage. It is inverted
    // on purpose: the day the capture contains a row, this fails, and the
    // failure message says what to do about it. That is the only way an
    // "unproven capture" entry in the registry can expire on its own instead of
    // sitting there being wrong.
    const rows = wire.maintenances ?? [];

    expect(Array.isArray(rows)).toBe(true);
    expect(
      rows.length === 0
        ? "approvals capture is EMPTY — row shape unproven (docs/contract-gaps.md)"
        : `approvals capture now has ${rows.length} row(s) — seed data reached this endpoint. ` +
            `Assert the row shape here and delete the "unproven capture" row from docs/contract-gaps.md.`,
    ).toBe("approvals capture is EMPTY — row shape unproven (docs/contract-gaps.md)");
  });
});

describe("GET /api/approvals — response pass-through", () => {
  it("passes the envelope through to the client", async () => {
    const body = await (await GET(new Request("http://localhost/api/approvals"))).json();

    // Domain-side names are independent literals. Note `mapApprovalsResponse`
    // returns the WHOLE envelope, so a route that wrapped it again would nest
    // `items` and fail here.
    expect(Object.keys(body).sort()).toEqual(["items", "limit", "offset", "total"]);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.total).toBe(wire.total);
  });

  it("reports `total` from the backend, not from the row count", async () => {
    // With rows absent from the capture, this is the one pass-through that can
    // still be proven: a total the fixture does not carry can only arrive by
    // being forwarded.
    backendRequest.mockResolvedValue({ ...wire, total: 137 });

    const body = await (await GET(new Request("http://localhost/api/approvals"))).json();

    expect(body.total).toBe(137);
  });
});

describe("GET /api/approvals — errors must not degrade into an empty queue", () => {
  it("answers with an error status when the backend fails", async () => {
    // The degradation that matters most on this screen: an empty approvals
    // queue reads as "nothing needs your approval", so a reviewer closes the
    // tab. A 403 (editor/guest reach this route) must not look like an empty
    // queue — it is the approver-picker P0 with the roles reversed.
    backendRequest.mockRejectedValue(new Error("forbidden"));

    const response = await GET(new Request("http://localhost/api/approvals"));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await response.json()).items).toBeUndefined();
  });
});
