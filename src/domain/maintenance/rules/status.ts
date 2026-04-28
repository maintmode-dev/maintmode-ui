import type { MaintenanceStatus } from "@/domain/maintenance/models/maintenance";

const terminalStatuses: ReadonlySet<MaintenanceStatus> = new Set(["completed", "cancelled"]);

export function isTerminalMaintenanceStatus(status: MaintenanceStatus) {
  return terminalStatuses.has(status);
}
