import type { AuditEvent } from "@/domain/audit/audit-log";

const iso = (offsetMin: number) => new Date(Date.now() - offsetMin * 60_000).toISOString();

// Mock fixtures kept for tests / mock-backed screens. Actions use the
// reconciled backend `AuditAction` values (flat snake_case) and `details` is a
// free-text string. Per-maintenance audit is on bff (RUK-162); only the global
// audit fixture survives, for the still-mock-capable `globalAudit` flag.
export const MOCK_GLOBAL_AUDIT: AuditEvent[] = [
  {
    id: "g-1",
    created_at: iso(5),
    actor: "Ruslan Kosykh",
    action: "login_success",
    target_type: "user",
    target_id: "u-1",
    details: "Logged in with Google",
  },
  {
    id: "g-2",
    created_at: iso(30),
    actor: "Ruslan Kosykh",
    action: "assigned",
    target_type: "invitation",
    target_id: "i-2",
    details: "Invited eve@external.org as guest",
  },
  {
    id: "g-3",
    created_at: iso(60),
    actor: "Ops Lead",
    action: "blocked",
    target_type: "user",
    target_id: "u-5",
    details: "Blocked carol@maintmode",
  },
  {
    id: "g-4",
    created_at: iso(120),
    actor: "Ruslan Kosykh",
    action: "assigned",
    target_type: "user",
    target_id: "u-3",
    details: "Granted editor role to alice@maintmode",
  },
  {
    id: "g-5",
    created_at: iso(180),
    actor: "Ops Lead",
    action: "unblocked",
    target_type: "user",
    target_id: "u-5",
    details: "Unblocked carol@maintmode",
  },
];
