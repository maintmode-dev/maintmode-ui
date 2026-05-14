export type BackendAuditLogEntryDto = {
  id: string;
  action: string;
  actor: string;
  entity_type?: string;
  entity_id?: string;
  target_type?: string;
  target_id?: string;
  details?: string;
  created_at: string;
};

export type BackendAuditLogResponseDto = {
  logs: BackendAuditLogEntryDto[];
};
