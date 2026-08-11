import { describe, expect, it } from "vitest";

import { isUnreviewedConflict, type Conflict, type MaintenanceStatus } from "../maintenance";

/**
 * The rule behind the "Not seen at approval" marker (RUK-178).
 *
 * It lives here rather than in the two components that render it because it was
 * duplicated across both, and only one copy was covered: deleting the draft gate
 * from the quick sheet left all 1000 tests green. A rule enforced twice and
 * verified once is a rule that drifts.
 */

function conflict(over: Partial<Conflict> = {}): Conflict {
  return {
    maintenance_id: "m-1",
    title: "Neighbour",
    overlap_start: "2026-07-29T17:00:00Z",
    overlap_end: "2026-07-29T17:30:00Z",
    scope: "global",
    resources: [],
    known_at_approval: false,
    ...over,
  };
}

describe("isUnreviewedConflict", () => {
  it("flags a conflict the approver never saw", () => {
    expect(isUnreviewedConflict("planned", conflict({ known_at_approval: false }))).toBe(true);
  });

  it("leaves a conflict the approver saw alone", () => {
    expect(isUnreviewedConflict("planned", conflict({ known_at_approval: true }))).toBe(false);
  });

  it("flags nothing on a draft, where every conflict reads false", () => {
    // A draft has never been approved, so `false` there is structural rather
    // than a warning — without this gate every row on every draft gets marked.
    expect(isUnreviewedConflict("draft", conflict({ known_at_approval: false }))).toBe(false);
  });

  it("applies to every post-draft status, not just planned", () => {
    // in_progress / completed / canceled all have an approval behind them, so
    // an unreviewed conflict is just as much news there as on `planned`.
    const statuses: MaintenanceStatus[] = ["planned", "in_progress", "completed", "canceled"];
    for (const status of statuses) {
      expect(isUnreviewedConflict(status, conflict({ known_at_approval: false }))).toBe(true);
    }
  });
});
