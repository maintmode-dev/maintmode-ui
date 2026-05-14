import type { AuditLogFilters } from "@/features/audit-log/schemas/audit-filter-schema";

export const auditLogKeys = {
  all: ["audit-log"] as const,
  list: (filters: AuditLogFilters) => [...auditLogKeys.all, "list", filters] as const,
};
