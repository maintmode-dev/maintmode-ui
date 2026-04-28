export type IsoDateTimeString = string;

export type BackendMaintenanceStatus = "planned" | "in_progress" | "completed" | "canceled";

export type BackendMaintenanceSummaryDto = {
  id: string;
  title: string;
  status: BackendMaintenanceStatus;
  plannedStart: IsoDateTimeString;
  plannedEnd: IsoDateTimeString;
  affectedResourceIds: string[];
};
