import { describe, expect, it } from "vitest";

import type { Conflict } from "@/domain/maintenance/maintenance";

import { approveBody } from "../queries/use-maintenance-actions";

/**
 * RUK-247. The approve request echoes back the conflict set the operator saw;
 * the backend re-computes it inside a serializable transaction and compares a
 * SHA-256 fingerprint. Omitting `scope` fails validation (400); sending the
 * wrong `resources` diverges the fingerprint (409).
 *
 * Fixtures here are deliberately asymmetric — mixed scopes, unsorted resource
 * ids — because a single-scope fixture passes against a hardcoded `scope` and a
 * pre-sorted one hides a client-side sort.
 */

function conflict(over: Partial<Conflict> = {}): Conflict {
  const base: Conflict = {
    maintenance_id: "m-1",
    title: "Neighbour",
    overlap_start: "2026-06-05T18:30:00Z",
    overlap_end: "2026-06-05T19:00:00Z",
    scope: "resource",
    resources: [],
    known_at_approval: false,
  };
  return { ...base, ...over };
}

function body(conflicts: Conflict[] | undefined, revision: number | undefined = 3) {
  return JSON.parse(approveBody(revision, conflicts)) as {
    observed_maint_revision: number;
    conflicts_snapshot: Array<{
      maintenance_id: string;
      scope: string;
      resources?: Array<{ id: string }>;
    }>;
  };
}

const MIXED: Conflict[] = [
  conflict({
    maintenance_id: "m-res",
    scope: "resource",
    // Out of order on purpose: the client must NOT sort. The backend sorts both
    // sides itself before hashing, so a client-side sort would be invisible in
    // production while quietly diverging from "send what the operator saw".
    resources: [
      { id: "r-2", name: "edge-eu" },
      { id: "r-1", name: "orders-db" },
    ],
  }),
  conflict({
    maintenance_id: "m-glob",
    scope: "global",
    resources: [{ id: "r-9", name: "shared-cache" }],
  }),
];

describe("approveBody", () => {
  it("sends scope for every conflict, echoing the wire value", () => {
    // AC-01. Asserting the VALUES (not just presence) is what fails a
    // hardcoded `scope: "resource"` implementation.
    expect(body(MIXED).conflicts_snapshot.map((c) => c.scope)).toEqual(["resource", "global"]);
  });

  it("sends resources in the order received, without sorting", () => {
    // AC-02.
    expect(body(MIXED).conflicts_snapshot[0].resources).toEqual([{ id: "r-2" }, { id: "r-1" }]);
  });

  it("sends a global conflict's resources too — the echo is unconditional", () => {
    // AC-03, and the whole point of SPEC §3.2.1: a `global` neighbour can carry
    // a non-empty resource intersection, and the backend fingerprints it
    // regardless of scope. Gating the echo on `scope === "resource"` sends an
    // empty set against a non-empty live one — a 409 that reads like someone
    // else edited the maintenance.
    expect(body(MIXED).conflicts_snapshot[1].resources).toEqual([{ id: "r-9" }]);
  });

  it("sends only resource ids, never names", () => {
    // The fingerprint hashes ids alone; `name` would double the payload against
    // the BFF's 16 KB cap for nothing.
    expect(body(MIXED).conflicts_snapshot[0].resources?.[0]).toEqual({ id: "r-2" });
  });

  it("emits an empty snapshot rather than throwing when there are no conflicts", () => {
    // AC-04.
    expect(body(undefined).conflicts_snapshot).toEqual([]);
    expect(body([]).conflicts_snapshot).toEqual([]);
  });

  it("sends the overlap bounds — the fingerprint hashes them too", () => {
    // Easy to forget because they predate this change, but the backend marks
    // both `validation.Required` and hashes them into the fingerprint: dropping
    // either is a 400. Without this the whole suite stays green if they vanish.
    expect(body(MIXED).conflicts_snapshot[0]).toMatchObject({
      overlap_start: "2026-06-05T18:30:00Z",
      overlap_end: "2026-06-05T19:00:00Z",
    });
  });

  it("survives a conflict missing scope/resources instead of throwing", () => {
    // Nothing renders either field, so a non-conformant producer — a hand-built
    // fixture, a stale cached object — would surface HERE and nowhere else, as
    // a `.map` of undefined inside the mutation. That reaches the operator as
    // the generic "Try again", the exact misdiagnosis this branch works to
    // avoid. An absent `scope` is worse still: it serializes as a missing key
    // and the backend rejects the body with a 400.
    const partial = { maintenance_id: "m-x", title: "Stale", overlap_start: "a", overlap_end: "b" };
    const snapshot = body([partial as Conflict]).conflicts_snapshot;

    expect(snapshot[0].resources).toEqual([]);
    expect(snapshot[0].scope).toBe("global");
  });

  it("carries the observed revision through", () => {
    expect(body(MIXED, 7).observed_maint_revision).toBe(7);
  });
});
