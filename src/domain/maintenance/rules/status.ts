import type { MaintenanceStatus } from "@/domain/maintenance/models/maintenance";

const terminalStatuses: ReadonlySet<MaintenanceStatus> = new Set(["completed", "canceled"]);

export function isTerminalMaintenanceStatus(status: MaintenanceStatus) {
  return terminalStatuses.has(status);
}

export const MAINTENANCE_STATUS_LABEL: Record<MaintenanceStatus, string> = {
  draft: "Draft",
  planned: "Planned",
  in_progress: "In progress",
  completed: "Completed",
  canceled: "Canceled",
};

/**
 * Status colors (bg/border/text) used by the calendar event renderer and by
 * the details status badge. Matched to the v2 reference palette so users
 * coming from the prototype recognise events.
 */
export const MAINTENANCE_STATUS_COLORS: Record<MaintenanceStatus, { bg: string; border: string; text: string }> = {
  draft: { bg: "#F1F2F4", border: "#D7DDE5", text: "#485567" },
  planned: { bg: "#E0ECFF", border: "#BFD4FF", text: "#1D4ED8" },
  in_progress: { bg: "#FEF3C7", border: "#FDE68A", text: "#92400E" },
  completed: { bg: "#DCF6E4", border: "#BCE5C9", text: "#166534" },
  canceled: { bg: "#FEE4E2", border: "#F5A6A0", text: "#761B16" },
};
