import { describe, expect, it } from "vitest";

import { auditActorFull, auditActorHandle } from "@/domain/audit/audit-log";

describe("auditActorHandle", () => {
  it("prefers the display name", () => {
    expect(auditActorHandle({ actor_display_name: "Alice", actor: "a@x.test" })).toBe("Alice");
  });
  it("falls back to the actor string", () => {
    expect(auditActorHandle({ actor: "a@x.test" })).toBe("a@x.test");
  });
  it("defaults to Unknown when neither is set", () => {
    expect(auditActorHandle({})).toBe("Unknown");
  });
});

describe("auditActorFull", () => {
  it("joins name and email when both differ", () => {
    expect(auditActorFull({ actor_display_name: "Alice", actor: "a@x.test" })).toBe("Alice · a@x.test");
  });
  it("collapses to one value when name equals the actor string", () => {
    expect(auditActorFull({ actor_display_name: "a@x.test", actor: "a@x.test" })).toBe("a@x.test");
  });
  it("uses the single known value", () => {
    expect(auditActorFull({ actor: "a@x.test" })).toBe("a@x.test");
    expect(auditActorFull({ actor_display_name: "Alice" })).toBe("Alice");
  });
  it("defaults to Unknown when the backend omits the actor", () => {
    expect(auditActorFull({})).toBe("Unknown");
  });
});
