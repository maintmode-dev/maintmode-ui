export const calendarQueryKeys = {
  all: ["calendar"] as const,
  maintenanceWindow: (rangeStartIso: string, rangeEndIso: string) =>
    [...calendarQueryKeys.all, "maintenance", rangeStartIso, rangeEndIso] as const,
};
