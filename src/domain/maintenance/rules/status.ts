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
  draft: {
    bg: "var(--status-draft-bg)",
    border: "var(--status-draft-border)",
    text: "var(--status-draft-text)",
  },
  planned: {
    bg: "var(--status-planned-bg)",
    border: "var(--status-planned-border)",
    text: "var(--status-planned-text)",
  },
  in_progress: {
    bg: "var(--status-in_progress-bg)",
    border: "var(--status-in_progress-border)",
    text: "var(--status-in_progress-text)",
  },
  completed: {
    bg: "var(--status-completed-bg)",
    border: "var(--status-completed-border)",
    text: "var(--status-completed-text)",
  },
  canceled: {
    bg: "var(--status-canceled-bg)",
    border: "var(--status-canceled-border)",
    text: "var(--status-canceled-text)",
  },
};
