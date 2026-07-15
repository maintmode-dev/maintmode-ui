import type { AuditEvent } from "@/domain/audit/audit-log";

const iso = (offsetMin: number) => new Date(Date.now() - offsetMin * 60_000).toISOString();

// Mock fixtures kept for tests / mock-backed screens. Actions use the
// reconciled backend `AuditAction` values (dotted) and `details` is a free-text
// string. Per-maintenance audit is on bff; only the global audit
// fixture survives, for the still-mock-capable `globalAudit` flag.
export const MOCK_GLOBAL_AUDIT: AuditEvent[] = [
  {
    id: "g-1",
    created_at: iso(5),
    actor: "Ruslan Kosykh",
    action: "login.success",
    entity_type: "user",
    entity_id: "u-1",
    details: "Logged in with Google",
  },
  {
    id: "g-2",
    created_at: iso(30),
    actor: "Ruslan Kosykh",
    action: "roles.changed",
    entity_type: "user",
    entity_id: "u-3",
    details: "Granted editor role to alice@maintmode",
  },
  {
    id: "g-3",
    created_at: iso(60),
    actor: "Ops Lead",
    action: "user.blocked",
    entity_type: "user",
    entity_id: "u-5",
    details: "Blocked carol@maintmode",
  },
  {
    id: "g-4",
    created_at: iso(90),
    actor: "Ruslan Kosykh",
    action: "maintenance.created",
    entity_type: "maintenance",
    entity_id: "m-1",
    details: "Created maintenance “DB failover drill”",
    metadata: { maint_title: "DB failover drill" },
  },
  {
    id: "g-5",
    created_at: iso(180),
    actor: "Ops Lead",
    action: "user.unblocked",
    entity_type: "user",
    entity_id: "u-5",
    details: "Unblocked carol@maintmode",
  },
];
