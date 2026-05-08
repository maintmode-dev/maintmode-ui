import type {
  BackendResourceDto,
  BackendResourceRefDto,
} from "@/server/backend/contracts/resources.contracts";

export type IsoDateTimeString = string;
export type IsoDateString = string;

export type BackendMaintenanceStatus = "draft" | "planned" | "in_progress" | "completed" | "canceled";

export type BackendMaintenanceScope = "global" | "resource";

export type BackendMaintenanceImpact = "none" | "partial_outage" | "full_outage";

export type BackendMaintenanceStepStatus = "unknown" | "planned" | "started" | "completed" | "canceled";

export type BackendCalendarEventDto = {
  id: string;
  title: string;
  description?: string;
  status: BackendMaintenanceStatus;
  scope: BackendMaintenanceScope;
  impact: BackendMaintenanceImpact;
  start: IsoDateTimeString;
  end: IsoDateTimeString;
  resource_ids?: string[];
  resources?: BackendResourceDto[];
  has_conflict?: boolean;
  conflicts_count?: number;
};

export type BackendCalendarViewResponseDto = {
  events: BackendCalendarEventDto[];
  meta: {
    count: number;
    truncated: boolean;
  };
};

export type BackendMaintenanceStepInputDto = {
  order: number;
  description: string;
  rollback_description: string;
  duration: string;
};

export type BackendMaintenanceStepDto = {
  id: string;
  order: number;
  description: string;
  rollback_description: string;
  duration: number | string;
  status: BackendMaintenanceStepStatus;
  planned_time_start?: IsoDateTimeString;
  planned_time_end?: IsoDateTimeString;
};

export type BackendMaintenanceWriteRequestDto = {
  title: string;
  description: string;
  planned_start: IsoDateTimeString;
  impact: BackendMaintenanceImpact;
  scope: BackendMaintenanceScope;
  resources: BackendResourceRefDto[];
  steps: BackendMaintenanceStepInputDto[];
};

export type BackendCreateDraftMaintResponseDto = {
  id: string;
  title: string;
  description: string;
  planned_period: {
    start: IsoDateTimeString;
    end?: IsoDateTimeString | null;
  };
  resources: BackendResourceRefDto[];
  scope: BackendMaintenanceScope;
  impact: BackendMaintenanceImpact;
  status: BackendMaintenanceStatus;
  created_at: IsoDateTimeString;
  steps: BackendMaintenanceStepDto[];
};

export type BackendMaintenanceViewDto = {
  id: string;
  title: string;
  description: string;
  planned_time_start: IsoDateTimeString;
  planned_time_end: IsoDateTimeString;
  actual_time_start?: IsoDateTimeString | null;
  actual_time_end?: IsoDateTimeString | null;
  resources: BackendResourceDto[];
  scope: BackendMaintenanceScope;
  impact: BackendMaintenanceImpact;
  status: BackendMaintenanceStatus;
  cancel_reason?: string;
  cancel_reason_comment?: string;
  created_at: IsoDateTimeString;
  updated_at?: IsoDateTimeString | null;
  revision: number;
  steps?: BackendMaintenanceStepDto[];
};

export type BackendConflictViewDto = {
  maintenance_id: string;
  title: string;
  overlap_start: IsoDateTimeString;
  overlap_end: IsoDateTimeString;
  scope: BackendMaintenanceScope;
  resources: BackendResourceDto[];
};

export type BackendMaintenanceActionsDto = {
  can_edit: boolean;
  can_approve: boolean;
  can_start: boolean;
  can_cancel: boolean;
  can_finish: boolean;
};

export type BackendMaintenanceViewResponseDto = {
  maintenance: BackendMaintenanceViewDto;
  conflicts: BackendConflictViewDto[];
  actions: BackendMaintenanceActionsDto;
};
