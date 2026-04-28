export const maintenanceDetailsQueryKeys = {
  all: ["maintenance-details"] as const,
  detail: (maintenanceId: string) => [...maintenanceDetailsQueryKeys.all, maintenanceId] as const,
};
