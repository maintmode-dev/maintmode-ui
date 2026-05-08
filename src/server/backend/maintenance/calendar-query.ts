import type { MaintenanceScope, MaintenanceStatus } from "@/domain/maintenance/models/maintenance";
import { BffValidationError, type FieldError } from "@/server/backend/errors/bff-error";

const VALID_STATUSES: readonly MaintenanceStatus[] = [
  "draft",
  "planned",
  "in_progress",
  "completed",
  "canceled",
];
const VALID_SCOPES: readonly MaintenanceScope[] = ["global", "resource"];

export type CalendarBackendQuery = {
  path: string;
  scope?: MaintenanceScope;
};

export function buildCalendarBackendQuery(requestUrl: string): CalendarBackendQuery {
  const url = new URL(requestUrl);
  const errors: FieldError[] = [];
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const scope = url.searchParams.get("scope");
  const statuses = readMultiValue(url.searchParams, "statuses");
  const resourceIds = readMultiValue(url.searchParams, "resource_ids");

  if (!isDateOnly(from)) {
    errors.push({ field: "from", message: "must be provided as YYYY-MM-DD" });
  }
  if (!isDateOnly(to)) {
    errors.push({ field: "to", message: "must be provided as YYYY-MM-DD" });
  }

  const invalidStatuses = statuses.filter((status) => !VALID_STATUSES.includes(status as MaintenanceStatus));
  if (invalidStatuses.length > 0) {
    errors.push({ field: "statuses", message: `unsupported status: ${invalidStatuses.join(", ")}` });
  }

  let normalizedScope: MaintenanceScope | undefined;
  if (scope && scope !== "all") {
    if (VALID_SCOPES.includes(scope as MaintenanceScope)) {
      normalizedScope = scope as MaintenanceScope;
    } else {
      errors.push({ field: "scope", message: "must be global, resource, or all" });
    }
  }

  if (errors.length > 0) {
    throw new BffValidationError(errors);
  }

  const backendParams = new URLSearchParams();
  backendParams.set("from", from ?? "");
  backendParams.set("to", to ?? "");

  for (const status of statuses) {
    backendParams.append("statuses", status);
  }

  for (const resourceId of resourceIds) {
    backendParams.append("resource_ids", resourceId);
  }

  return {
    path: `/ui/v1/calendar?${backendParams.toString()}`,
    scope: normalizedScope,
  };
}

export function readMultiValue(searchParams: URLSearchParams, key: string): string[] {
  return searchParams
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function isDateOnly(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}
