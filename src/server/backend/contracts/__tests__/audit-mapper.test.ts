import { describe, expect, it } from "vitest";

import { mapAuditAction, mapAuditLog, mapAuditLogResponse } from "@/server/backend/contracts/audit-mapper";
import type { AuditLogResponseDto } from "@/server/backend/contracts/maintmode-dto";

describe("mapAuditAction", () => {
  it("passes through every flat AuditAction enum value", () => {
    for (const action of [
      "login_success",
      "login_failed",
      "logout_success",
      "assigned",
      "revoked",
      "replaced",
      "blocked",
      "unblocked",
    ]) {
      expect(mapAuditAction(action)).toBe(action);
    }
  });

  it("returns undefined for unknown or missing actions", () => {
    expect(mapAuditAction("maintenance.created")).toBeUndefined();
    expect(mapAuditAction("")).toBeUndefined();
    expect(mapAuditAction(undefined)).toBeUndefined();
  });
});

describe("mapAuditLog", () => {
  it("maps a full row, keeping details as a string", () => {
    expect(
      mapAuditLog({
        id: "a-1",
        action: "assigned",
        actor: "Alice",
        created_at: "2026-06-05T10:00:00Z",
        details: "revision=1",
        entity_type: "maintenance",
        entity_id: "m-1",
        target_type: "user",
        target_id: "u-1",
      }),
    ).toEqual({
      id: "a-1",
      action: "assigned",
      actor: "Alice",
      created_at: "2026-06-05T10:00:00Z",
      details: "revision=1",
      entity_type: "maintenance",
      entity_id: "m-1",
      target_type: "user",
      target_id: "u-1",
    });
  });

  it("drops rows with no id or an unmapped action", () => {
    expect(mapAuditLog({ action: "assigned" })).toBeNull();
    expect(mapAuditLog({ id: "a-1", action: "maintenance.created" })).toBeNull();
    expect(mapAuditLog({ id: "a-1" })).toBeNull();
  });

  it("normalizes blank optional strings to undefined", () => {
    const event = mapAuditLog({ id: "a-1", action: "blocked", actor: "  ", details: "" });
    expect(event?.actor).toBeUndefined();
    expect(event?.details).toBeUndefined();
  });

  it("defaults a missing created_at to empty string", () => {
    expect(mapAuditLog({ id: "a-1", action: "login_success" })?.created_at).toBe("");
  });

  it("carries the actor display name and id", () => {
    const event = mapAuditLog({
      id: "a-1",
      action: "login_success",
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
      action: "login_success",
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

  it("collapses an all-empty metadata object to undefined", () => {
    const event = mapAuditLog({
      id: "a-1",
      action: "login_success",
      metadata: { ip: "", roles_removed: [], target_email: "  " },
    });
    expect(event?.metadata).toBeUndefined();
  });

  it("omits metadata when the backend sends none", () => {
    expect(mapAuditLog({ id: "a-1", action: "login_success" })?.metadata).toBeUndefined();
  });
});

describe("mapAuditLogResponse", () => {
  it("maps the logs array and filters out unmappable rows", () => {
    const dto: AuditLogResponseDto = {
      logs: [
        { id: "a-1", action: "assigned" },
        { id: "a-2", action: "bogus" },
        { action: "blocked" },
        { id: "a-3", action: "blocked" },
      ],
      total: 2,
      facets: { all: 2, auth: 0, roles: 1, block: 1 },
    };
    const page = mapAuditLogResponse(dto);
    expect(page.events.map((e) => e.id)).toEqual(["a-1", "a-3"]);
    expect(page.total).toBe(2);
    expect(page.facets).toEqual({ all: 2, auth: 0, roles: 1, block: 1 });
  });

  it("falls back to the row count when total is absent", () => {
    const page = mapAuditLogResponse({ logs: [{ id: "a-1", action: "blocked" }] });
    expect(page.total).toBe(1);
  });

  it("handles a missing logs array and zero-fills facets", () => {
    expect(mapAuditLogResponse({})).toEqual({
      events: [],
      total: 0,
      facets: { all: 0, auth: 0, roles: 0, block: 0 },
    });
  });
});
