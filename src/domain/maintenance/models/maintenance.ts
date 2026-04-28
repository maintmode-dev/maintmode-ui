export type MaintenanceStatus = "planned" | "inProgress" | "completed" | "cancelled";

export type MaintenanceSummary = {
  id: string;
  title: string;
  status: MaintenanceStatus;
  plannedStartIso: string;
  plannedEndIso: string;
  affectedResourceIds: string[];
};
