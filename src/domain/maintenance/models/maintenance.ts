import type { Resource } from "@/domain/resource/models/resource";

export type MaintenanceStatus = "draft" | "planned" | "in_progress" | "completed" | "canceled";

export type MaintenanceScope = "global" | "resource";

export type MaintenanceActionSet = {
  can_approve: boolean;
  can_cancel: boolean;
  can_edit: boolean;
  can_finish: boolean;
  can_start: boolean;
};

export type MaintenanceConflict = {
  maintenance_id: string;
  maintenance_title: string;
  resource_name: string;
  overlap_start: string;
  overlap_end: string;
  scope: MaintenanceScope;
  resources: Resource[];
};

export type MaintenanceStep = {
  id?: string;
  order: number;
  description: string;
  rollback_description: string;
  duration_minutes: number;
  status?: "unknown" | "planned" | "started" | "completed" | "canceled";
  planned_start_at?: string;
  planned_end_at?: string;
};

export type MaintenanceSummary = {
  id: string;
  title: string;
  description: string;
  status: MaintenanceStatus;
  scope: MaintenanceScope;
  impact: string;
  planned_start_at: string;
  planned_end_at: string;
  actual_start_at?: string;
  actual_end_at?: string;
  resources: Resource[];
  conflicts: MaintenanceConflict[];
  has_conflict: boolean;
  revision?: number;
  actions?: MaintenanceActionSet;
  steps?: MaintenanceStep[];
};
