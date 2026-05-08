import type { MaintenanceStatus } from "@/domain/maintenance/models/maintenance";

const terminalStatuses: ReadonlySet<MaintenanceStatus> = new Set(["completed", "canceled"]);

export function isTerminalMaintenanceStatus(status: MaintenanceStatus) {
  return terminalStatuses.has(status);
}
