import type {
  MaintenanceActionSet,
  MaintenanceConflict,
  MaintenanceStep,
  MaintenanceSummary,
} from "@/domain/maintenance/models/maintenance";
import type { Resource } from "@/domain/resource/models/resource";
import type {
  BackendCalendarEventDto,
  BackendCalendarViewResponseDto,
  BackendConflictViewDto,
  BackendMaintenanceActionsDto,
  BackendMaintenanceStepDto,
  BackendMaintenanceViewResponseDto,
} from "@/server/backend/contracts/maintenance.contracts";
import { isBackendResourceType } from "@/server/backend/resources/resources-service";

export type NormalizedCalendarResponse = {
  maintenances: MaintenanceSummary[];
  meta: BackendCalendarViewResponseDto["meta"];
};

export function normalizeCalendarResponse(
  response: BackendCalendarViewResponseDto,
  resourcesById = new Map<string, Resource>(),
): NormalizedCalendarResponse {
  return {
    maintenances: response.events.map((event) => normalizeCalendarEvent(event, resourcesById)),
    meta: response.meta,
  };
}

export function normalizeCalendarEvent(
  event: BackendCalendarEventDto,
  resourcesById = new Map<string, Resource>(),
): MaintenanceSummary {
  const resources = resolveEventResources(event, resourcesById);

  return {
    id: event.id,
    title: event.title,
    description: event.description ?? "",
    status: event.status,
    scope: event.scope,
    impact: event.impact,
    planned_start_at: normalizeDateString(event.start),
    planned_end_at: normalizeDateString(event.end),
    actual_start_at: undefined,
    actual_end_at: undefined,
    resources,
    conflicts: [],
    has_conflict:
      event.has_conflict ?? (typeof event.conflicts_count === "number" ? event.conflicts_count > 0 : false),
  };
}

export function normalizeMaintenanceView(response: BackendMaintenanceViewResponseDto): MaintenanceSummary {
  const maintenance = response.maintenance;
  const conflicts = response.conflicts.map(normalizeConflictView);

  return {
    id: maintenance.id,
    title: maintenance.title,
    description: maintenance.description,
    status: maintenance.status,
    scope: maintenance.scope,
    impact: maintenance.impact,
    planned_start_at: normalizeDateString(maintenance.planned_time_start),
    planned_end_at: normalizeDateString(maintenance.planned_time_end),
    actual_start_at: optionalDateString(maintenance.actual_time_start),
    actual_end_at: optionalDateString(maintenance.actual_time_end),
    resources: maintenance.resources.map(normalizeViewResource),
    conflicts,
    has_conflict: conflicts.length > 0,
    revision: maintenance.revision,
    actions: normalizeActions(response.actions),
    steps: Array.isArray(maintenance.steps) ? maintenance.steps.map(normalizeMaintenanceStep) : undefined,
  };
}

function resolveEventResources(event: BackendCalendarEventDto, resourcesById: Map<string, Resource>) {
  if (Array.isArray(event.resources) && event.resources.length > 0) {
    return event.resources.map(normalizeViewResource);
  }

  return (event.resource_ids ?? []).map(
    (resourceId) => resourcesById.get(resourceId) ?? fallbackResource(resourceId),
  );
}

function normalizeViewResource(resource: { id: string; name?: string; type?: unknown }): Resource {
  return {
    id: resource.id,
    name: resource.name || resource.id,
    type: isBackendResourceType(resource.type) ? resource.type : "service",
  };
}

function fallbackResource(resourceId: string): Resource {
  return {
    id: resourceId,
    name: resourceId,
    type: "service",
  };
}

function normalizeConflictView(conflict: BackendConflictViewDto): MaintenanceConflict {
  const resources = conflict.resources.map(normalizeViewResource);
  return {
    maintenance_id: conflict.maintenance_id,
    maintenance_title: conflict.title,
    resource_name: resources[0]?.name ?? "global",
    overlap_start: normalizeDateString(conflict.overlap_start),
    overlap_end: normalizeDateString(conflict.overlap_end),
    scope: conflict.scope,
    resources,
  };
}

function normalizeActions(actions: BackendMaintenanceActionsDto): MaintenanceActionSet {
  return {
    can_approve: Boolean(actions.can_approve),
    can_cancel: Boolean(actions.can_cancel),
    can_edit: Boolean(actions.can_edit),
    can_finish: Boolean(actions.can_finish),
    can_start: Boolean(actions.can_start),
  };
}

function normalizeMaintenanceStep(step: BackendMaintenanceStepDto): MaintenanceStep {
  return {
    id: step.id,
    order: step.order,
    description: step.description,
    rollback_description: step.rollback_description,
    duration_minutes: durationToMinutes(step.duration),
    status: step.status,
    planned_start_at: optionalDateString(step.planned_time_start),
    planned_end_at: optionalDateString(step.planned_time_end),
  };
}

export function durationToMinutes(duration: number | string): number {
  if (typeof duration === "number") {
    return duration;
  }

  const trimmed = duration.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  const match = trimmed.match(/^(?:(\d+)h)?(?:(\d+)m)?$/);
  if (!match || (!match[1] && !match[2])) {
    return 0;
  }

  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = match[2] ? Number(match[2]) : 0;
  return hours * 60 + minutes;
}

function normalizeDateString(value: string): string {
  return new Date(value).toISOString();
}

function optionalDateString(value: string | null | undefined): string | undefined {
  return value ? normalizeDateString(value) : undefined;
}
