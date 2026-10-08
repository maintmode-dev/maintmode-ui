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

/** RUK-297: the five actions the screen used to drop, and the unknown-action fallback. */
describe("AuditExpandedDetail — RUK-297 actions", () => {
  it("shows the before/after of a user.tags_changed row next to its target", () => {
    render(
      <AuditExpandedDetail
        event={{
          id: "a-2",
          created_at: "2026-10-08T10:00:00Z",
          actor: "admin@example.test",
          action: "user.tags_changed",
          entity_type: "user",
          details: "messenger tags of editor@example.test changed by admin@example.test",
          metadata: {
            target_email: "editor@example.test",
            changes: [{ field: "slack_tag", old: "@old", new: "@new" }],
          },
        }}
      />,
    );

    expect(screen.getByText("Target")).toBeTruthy();
    expect(screen.getByText("editor@example.test")).toBeTruthy();
    expect(screen.getByText("Changes")).toBeTruthy();
    expect(screen.getByText("@old")).toBeTruthy();
    expect(screen.getByText("@new")).toBeTruthy();
  });

  it("reads a refused provider link like a refused login: IP and reason", () => {
    render(
      <AuditExpandedDetail
        event={{
          id: "a-3",
          created_at: "2026-10-08T10:00:00Z",
          action: "provider.linked",
          entity_type: "user",
          details: "provider link refused: link ticket unusable",
          metadata: { ip: "<ip>", failure_reason: "link ticket unusable" },
        }}
      />,
    );

    expect(screen.getByText("IP")).toBeTruthy();
    expect(screen.getByText("Reason")).toBeTruthy();
    expect(screen.getByText("link ticket unusable")).toBeTruthy();
  });

  it("names the method a sign-in method toggle acted on", () => {
    render(
      <AuditExpandedDetail
        event={{
          id: "a-4",
          created_at: "2026-10-08T10:00:00Z",
          actor: "admin@example.test",
          action: "auth_method.toggled",
          entity_type: "auth_setting",
          entity_id: "email_otp",
          details: "sign-in method email_otp enabled by admin@example.test",
        }}
      />,
    );

    expect(screen.getByText("Method")).toBeTruthy();
    expect(screen.getByText("email_otp")).toBeTruthy();
  });

  it("renders an action the UI does not model with its details, instead of nothing", () => {
    render(
      <AuditExpandedDetail
        event={{
          id: "a-5",
          created_at: "2026-10-08T10:00:00Z",
          actor: "admin@example.test",
          action: "something.new",
          entity_id: "x-1",
          details: "something new happened",
        }}
      />,
    );

    expect(screen.getByText("something new happened")).toBeTruthy();
    expect(screen.getByText("x-1")).toBeTruthy();
  });
});

/** Invitation and catalog actions (backend 3c1609f): who/what was acted on. */
describe("AuditExpandedDetail — invitation and catalog actions", () => {
  it("names the invited address and the roles an invitation grants", () => {
    render(
      <AuditExpandedDetail
        event={{
          id: "a-6",
          created_at: "2026-10-09T10:00:00Z",
          actor: "admin@example.test",
          action: "invitation.created",
          entity_type: "invitation",
          entity_id: "0199c3a0-0000-7000-8000-000000000001",
          details: "invitation for new.hire@example.test created by admin@example.test",
          metadata: { target_email: "new.hire@example.test", roles: ["editor"] },
        }}
      />,
    );

    expect(screen.getByText("Target")).toBeTruthy();
    expect(screen.getByText("new.hire@example.test")).toBeTruthy();
    expect(screen.getByText("Roles")).toBeTruthy();
    expect(screen.getByText("editor")).toBeTruthy();
  });

  it("names the resource and shows what an update moved", () => {
    render(
      <AuditExpandedDetail
        event={{
          id: "a-7",
          created_at: "2026-10-09T10:00:00Z",
          actor: "admin@example.test",
          action: "resource.updated",
          entity_type: "resource",
          entity_id: "0199c3a0-0000-7000-8000-000000000002",
          details: 'resource "payments-db" updated by admin@example.test',
          metadata: {
            target_display_name: "payments-db",
            changes: [{ field: "description", old: "old text", new: "new text" }],
          },
        }}
      />,
    );

    expect(screen.getByText("Target")).toBeTruthy();
    expect(screen.getByText("payments-db")).toBeTruthy();
    expect(screen.getByText("old text")).toBeTruthy();
    expect(screen.getByText("new text")).toBeTruthy();
  });
});
