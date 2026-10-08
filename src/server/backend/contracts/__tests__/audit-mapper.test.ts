import { describe, expect, it } from "vitest";

import { mapAuditAction, mapAuditLog, mapAuditLogResponse } from "@/server/backend/contracts/audit-mapper";
import type { AuditLogResponseDto } from "@/server/backend/contracts/maintmode-dto";

describe("mapAuditAction", () => {
  it("passes a wire action through as-is, known or not", () => {
    // No allowlist here any more (RUK-297): an allowlist is what made five real
    // security events vanish between the wire and the screen.
    expect(mapAuditAction("login.success")).toBe("login.success");
    expect(mapAuditAction("password.changed")).toBe("password.changed");
    expect(mapAuditAction("something.new")).toBe("something.new");
    expect(mapAuditAction("  user.tags_changed  ")).toBe("user.tags_changed");
  });

  it("returns undefined only when there is no action at all", () => {
    expect(mapAuditAction("")).toBeUndefined();
    expect(mapAuditAction("   ")).toBeUndefined();
    expect(mapAuditAction(undefined)).toBeUndefined();
  });
});

describe("mapAuditLog", () => {
  it("maps a full row, keeping details as a string", () => {
    expect(
      mapAuditLog({
        id: "a-1",
        action: "maintenance.created",
        actor: "Alice",
        created_at: "2026-06-05T10:00:00Z",
        details: "revision=1",
        entity_type: "maintenance",
        entity_id: "m-1",
      }),
    ).toEqual({
      id: "a-1",
      action: "maintenance.created",
      actor: "Alice",
      created_at: "2026-06-05T10:00:00Z",
      details: "revision=1",
      entity_type: "maintenance",
      entity_id: "m-1",
    });
  });

  it("drops rows with no id or no action", () => {
    expect(mapAuditLog({ action: "roles.changed" })).toBeNull();
    expect(mapAuditLog({ id: "a-1" })).toBeNull();
    expect(mapAuditLog({ id: "a-1", action: "  " })).toBeNull();
  });

  it("keeps a row whose action the UI does not model, with its payload intact", () => {
    // Rendered as a neutral row under "All" — never dropped.
    expect(
      mapAuditLog({ id: "a-1", action: "something.new", actor: "a@b.test", details: "it happened" }),
    ).toEqual({
      id: "a-1",
      action: "something.new",
      actor: "a@b.test",
      details: "it happened",
      created_at: "",
    });
  });

  it("normalizes blank optional strings to undefined", () => {
    const event = mapAuditLog({ id: "a-1", action: "user.blocked", actor: "  ", details: "" });
    expect(event?.actor).toBeUndefined();
    expect(event?.details).toBeUndefined();
  });

  it("defaults a missing created_at to empty string", () => {
    expect(mapAuditLog({ id: "a-1", action: "login.success" })?.created_at).toBe("");
  });

  it("carries the actor display name and id", () => {
    const event = mapAuditLog({
      id: "a-1",
      action: "login.success",
      actor: "alice@corp.test",
      actor_display_name: "Alice Smith",
      actor_id: "u-1",
    });
    expect(event?.actor_display_name).toBe("Alice Smith");
    expect(event?.actor_id).toBe("u-1");
  });

  it("maps structured metadata, dropping empty fields and lists", () => {
    const event = mapAuditLog({
      id: "a-1",
      action: "login.success",
      metadata: {
        ip: "10.0.0.1",
        user_agent: "Mozilla/5.0",
        session_id: "s-1",
        roles_added: ["admin"],
        roles_removed: [],
        target_email: "  ",
      },
    });
    expect(event?.metadata).toEqual({
      ip: "10.0.0.1",
      user_agent: "Mozilla/5.0",
      session_id: "s-1",
      roles_added: ["admin"],
    });
  });

  it("maps maintenance metadata: maint_title and field changes", () => {
    const event = mapAuditLog({
      id: "a-1",
      action: "maintenance.updated",
      entity_type: "maintenance",
      entity_id: "m-1",
      metadata: {
        maint_title: "DB failover drill",
        changes: [
          { field: "title", old: "Old", new: "New" },
          // kept: only one side set (a value was added / cleared).
          { field: "description", old: "", new: "Added" },
          // dropped: no field name
          { old: "x", new: "y" },
          // dropped: both sides blank — the backend emits these no-op entries
          // for untouched fields; they must not become `∅ → ∅` diff rows.
          { field: "steps", old: "", new: "  " },
        ],
      },
    });
    expect(event?.metadata).toEqual({
      maint_title: "DB failover drill",
      changes: [
        { field: "title", old: "Old", new: "New" },
        { field: "description", old: undefined, new: "Added" },
      ],
    });
  });

  // S2 rework (backend b4a9e73): `integration.updated` names a replaced or
  // cleared secret with NEITHER side — the value is never recorded. The no-op
  // filter above must not eat it.
  it("keeps a secret-changed flag on an integration update, and its config diff", () => {
    const event = mapAuditLog({
      id: "a-2",
      action: "integration.updated",
      entity_type: "integration",
      entity_id: "notify/slack",
      metadata: {
        changes: [
          { field: "api_url", old: "https://a.test", new: "https://b.test" },
          { field: "enabled", old: "true", new: "false" },
          { field: "secrets.bot_token" },
          { field: "timeout", old: "", new: "" },
        ],
      },
    });
    expect(event?.metadata?.changes).toEqual([
      { field: "api_url", old: "https://a.test", new: "https://b.test" },
      { field: "enabled", old: "true", new: "false" },
      { field: "secrets.bot_token", old: undefined, new: undefined },
    ]);
  });

  it("keeps title-only maintenance metadata (no changes)", () => {
    const event = mapAuditLog({
      id: "a-1",
      action: "maintenance.started",
      entity_type: "maintenance",
      entity_id: "m-1",
      metadata: { maint_title: "DB failover drill" },
    });
    expect(event?.metadata).toEqual({ maint_title: "DB failover drill" });
  });

  it("collapses an all-empty metadata object to undefined", () => {
    const event = mapAuditLog({
      id: "a-1",
      action: "login.success",
      metadata: { ip: "", roles_removed: [], target_email: "  ", changes: [] },
    });
    expect(event?.metadata).toBeUndefined();
  });

  it("omits metadata when the backend sends none", () => {
    expect(mapAuditLog({ id: "a-1", action: "login.success" })?.metadata).toBeUndefined();
  });
});

describe("mapAuditLogResponse", () => {
  it("maps the logs array, keeping unknown actions and dropping id-less rows", () => {
    const dto: AuditLogResponseDto = {
      logs: [
        { id: "a-1", action: "roles.changed" },
        { id: "a-2", action: "bogus" },
        { action: "user.blocked" },
        { id: "a-3", action: "user.blocked" },
      ],
      total: 3,
      facets: { all: 3, auth: 0, roles: 1, block: 1, maintenance: 0 },
    };
    const page = mapAuditLogResponse(dto);
    expect(page.events.map((e) => e.id)).toEqual(["a-1", "a-2", "a-3"]);
    expect(page.total).toBe(3);
    // `integration` is zero-filled here on purpose: the DTO above omits it, and
    // the mapper must still produce the full domain shape. The backend does send
    // it (RUK-254 found it being dropped before the field was declared).
    expect(page.facets).toEqual({ all: 3, auth: 0, roles: 1, block: 1, maintenance: 0, integration: 0 });
  });

  it("falls back to the row count when total is absent", () => {
    const page = mapAuditLogResponse({ logs: [{ id: "a-1", action: "user.blocked" }] });
    expect(page.total).toBe(1);
  });

  it("handles a missing logs array and zero-fills facets", () => {
    expect(mapAuditLogResponse({})).toEqual({
      events: [],
      total: 0,
      facets: { all: 0, auth: 0, roles: 0, block: 0, maintenance: 0, integration: 0 },
    });
  });
});
