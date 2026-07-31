import { describe, expect, it } from "vitest";

import { mapApprovalsResponse } from "@/server/backend/contracts/approvals-mapper";
import type { ApprovalRowDto, ListApprovalsResponseDto } from "@/server/backend/contracts/approvals-dto";

/** A fully populated, ordinary row — the baseline the asymmetric cases differ from. */
function row(overrides: Partial<ApprovalRowDto> = {}): ApprovalRowDto {
  return {
    id: "m-1",
    title: "Cluster upgrade",
    start: "2026-08-01T10:00:00Z",
    end: "2026-08-01T12:00:00Z",
    scope: "resource",
    impact: "partial_outage",
    created_by: { id: "u-1", email: "ivan@example.com", display_name: "Ivan Petrov" },
    created_at: "2026-07-20T09:15:00Z",
    updated_at: "2026-07-28T14:02:00Z",
    ...overrides,
  };
}

describe("mapApprovalsResponse", () => {
  it("carries a fully populated row onto the domain shape", () => {
    const dto: ListApprovalsResponseDto = {
      maintenances: [row()],
      total: 7,
      limit: 50,
      offset: 0,
    };

    expect(mapApprovalsResponse(dto)).toEqual({
      items: [
        {
          id: "m-1",
          title: "Cluster upgrade",
          start: "2026-08-01T10:00:00Z",
          end: "2026-08-01T12:00:00Z",
          scope: "resource",
          impact: "partial_outage",
          created_by: "Ivan Petrov",
          created_at: "2026-07-20T09:15:00Z",
          updated_at: "2026-07-28T14:02:00Z",
        },
      ],
      total: 7,
      limit: 50,
      offset: 0,
    });
  });

  it("returns the whole envelope, not a bare array", () => {
    // Guards the trap the calendar route sets: `mapCalendarResponse` returns an
    // array and its route wraps it in `{ items }`. Copying that line here would
    // produce `{ items: { items, total, ... } }`.
    const mapped = mapApprovalsResponse({ maintenances: [], total: 0, limit: 50, offset: 0 });
    expect(Array.isArray(mapped.items)).toBe(true);
    expect(mapped).toMatchObject({ total: 0, limit: 50, offset: 0 });
  });

  describe("open-ended periods (zero-time)", () => {
    // ASYMMETRIC FIXTURE, on purpose. A page where every row has a real `end`
    // would stay green against both a working `isZeroTime` and no `isZeroTime`
    // at all. Both kinds of row must be present for the test to be able to fail.
    const dto: ListApprovalsResponseDto = {
      maintenances: [
        row({ id: "open", end: "0001-01-01T00:00:00Z" }),
        row({ id: "bounded", end: "2026-08-01T12:00:00Z" }),
      ],
      total: 2,
      limit: 50,
      offset: 0,
    };

    it("drops the Go zero value to undefined and leaves real ends alone", () => {
      const [open, bounded] = mapApprovalsResponse(dto).items;
      expect(open.end).toBeUndefined();
      expect(bounded.end).toBe("2026-08-01T12:00:00Z");
    });

    it("lets no year-1 timestamp survive into the domain", () => {
      // Negative assertion: the failure this defends against is a date formatter
      // rendering `0001-01-01` as a real date, so assert the substring is gone
      // from the mapped page entirely, not just from the field we happened to
      // check above.
      expect(JSON.stringify(mapApprovalsResponse(dto))).not.toContain("0001");
    });

    it("treats a zero-valued start the same way it treats end", () => {
      // The backend types `start` as a plain time.Time too. It should never be
      // zero in practice, but if it is, rendering year 1 is still the wrong
      // answer — and `start` is required, so it degrades to empty, not to a lie.
      const [only] = mapApprovalsResponse({
        maintenances: [row({ start: "0001-01-01T00:00:00Z" })],
      }).items;
      expect(only.start).toBe("");
    });
  });

  describe("unresolved authors", () => {
    // ASYMMETRIC again: a null author AND a resolved one in the same page.
    const dto: ListApprovalsResponseDto = {
      maintenances: [
        row({ id: "anon", created_by: null }),
        row({ id: "named", created_by: { id: "u-1", display_name: "Ivan Petrov" } }),
      ],
    };

    it("keeps the row and leaves created_by undefined", () => {
      const items = mapApprovalsResponse(dto).items;
      // The row must survive: the backend degrades authors rather than failing
      // the read, so dropping it here would hide work from its approver.
      expect(items).toHaveLength(2);
      expect(items[0].id).toBe("anon");
      expect(items[0].created_by).toBeUndefined();
      expect(items[1].created_by).toBe("Ivan Petrov");
    });

    it("passes the backend's own 'Unknown user' through verbatim", () => {
      const [only] = mapApprovalsResponse({
        maintenances: [row({ created_by: { id: "u-9", display_name: "Unknown user" } })],
      }).items;
      expect(only.created_by).toBe("Unknown user");
    });
  });

  describe("impact", () => {
    it("preserves the real outage levels", () => {
      // `approvals.go` documents `example:"degradation"`, which is a stale
      // annotation — no such value exists in the entity enum. The guard that
      // matters is the opposite direction: the two real outage levels must
      // survive, because `mapImpact` defaults unknowns to "none" and silently
      // relabelling an outage as harmless is the worst outcome on a page whose
      // whole job is judging risk before approval.
      const items = mapApprovalsResponse({
        maintenances: [
          row({ id: "partial", impact: "partial_outage" }),
          row({ id: "full", impact: "full_outage" }),
          row({ id: "none", impact: "none" }),
        ],
      }).items;
      expect(items.map((i) => i.impact)).toEqual(["partial_outage", "full_outage", "none"]);
    });

    it("falls back to none for a value outside the enum", () => {
      const [only] = mapApprovalsResponse({ maintenances: [row({ impact: "degradation" })] }).items;
      expect(only.impact).toBe("none");
    });
  });

  describe("defensive defaults", () => {
    it("treats a null maintenances array as an empty page", () => {
      expect(mapApprovalsResponse({ maintenances: null, total: 0 }).items).toEqual([]);
    });

    it("treats an absent maintenances array as an empty page", () => {
      expect(mapApprovalsResponse({}).items).toEqual([]);
    });

    it("defaults absent pagination scalars to zero", () => {
      expect(mapApprovalsResponse({})).toMatchObject({ total: 0, limit: 0, offset: 0 });
    });

    it("defaults an absent title and timestamps to empty strings", () => {
      const [only] = mapApprovalsResponse({ maintenances: [{ id: "bare" }] }).items;
      expect(only).toMatchObject({ id: "bare", title: "", start: "", created_at: "" });
      expect(only.end).toBeUndefined();
      expect(only.updated_at).toBeUndefined();
    });

    it("maps an unknown scope to global, per the shared mapScope", () => {
      const [only] = mapApprovalsResponse({ maintenances: [row({ scope: "nonsense" })] }).items;
      expect(only.scope).toBe("global");
    });

    it("normalizes a null updated_at to undefined", () => {
      const [only] = mapApprovalsResponse({ maintenances: [row({ updated_at: null })] }).items;
      expect(only.updated_at).toBeUndefined();
    });
  });
});
