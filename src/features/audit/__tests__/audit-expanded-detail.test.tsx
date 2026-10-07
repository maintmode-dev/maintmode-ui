// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { AuditExpandedDetail } from "@/features/audit/audit-expanded-detail";
import type { AuditEvent } from "@/domain/audit/audit-log";

afterEach(() => cleanup());

const UPDATED: AuditEvent = {
  id: "a-1",
  created_at: "2026-10-08T10:00:00Z",
  actor: "admin@example.test",
  action: "integration.updated",
  entity_type: "integration",
  entity_id: "notify/slack",
  details: 'integration "notify"/"slack" updated (enabled=true) by admin@example.test',
  metadata: {
    changes: [
      { field: "api_url", old: "https://slack.com/api/", new: "https://hooks.example.test/" },
      { field: "secrets.bot_token" },
    ],
  },
};

/**
 * S2 rework (backend b4a9e73): with no re-entry required, the audit row is the
 * record of who moved a stored secret's destination, from where to where.
 */
describe("AuditExpandedDetail — integration.updated", () => {
  it("names the integration and shows where its destination moved", () => {
    render(<AuditExpandedDetail event={UPDATED} />);

    expect(screen.getByText("Integration")).toBeTruthy();
    expect(screen.getByText("notify/slack")).toBeTruthy();
    expect(screen.getByText("https://slack.com/api/")).toBeTruthy();
    expect(screen.getByText("https://hooks.example.test/")).toBeTruthy();
  });

  it("says a secret changed, by name, with no before/after", () => {
    const { container } = render(<AuditExpandedDetail event={UPDATED} />);

    expect(screen.getByText("bot_token:")).toBeTruthy();
    expect(screen.getByText("secret changed")).toBeTruthy();
    // Not rendered as a `∅ → ∅` diff row, which would read as "nothing happened".
    expect(container.textContent).not.toMatch(/bot_token:\s*∅/);
  });
});
