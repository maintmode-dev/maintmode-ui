export type AuditLogEntry = {
  id: string;
  action: string;
  actor: string;
  entityType?: string;
  entityId?: string;
  targetType?: string;
  targetId?: string;
  details?: string;
  createdAt: string;
};
