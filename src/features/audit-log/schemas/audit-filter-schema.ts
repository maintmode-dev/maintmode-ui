import { z } from "zod";

export const AUDIT_LIMIT_MAX = 100;

export const auditFilterSchema = z.object({
  limit: z.number().int().positive().max(AUDIT_LIMIT_MAX).default(50),
  offset: z.number().int().min(0).default(0),
  action: z.string().trim().min(1).optional(),
  actor: z.string().trim().min(1).optional(),
  createdFrom: z.string().datetime({ offset: true }).optional(),
  createdTo: z.string().datetime({ offset: true }).optional(),
});

export type AuditLogFilters = z.infer<typeof auditFilterSchema>;

export const AUDIT_ACTIONS = [
  "login_success",
  "login_failed",
  "logout_success",
  "assigned",
  "revoked",
  "replaced",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
