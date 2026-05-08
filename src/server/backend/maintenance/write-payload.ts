import type { Resource } from "@/domain/resource/models/resource";
import type {
  BackendMaintenanceImpact,
  BackendMaintenanceScope,
  BackendMaintenanceWriteRequestDto,
} from "@/server/backend/contracts/maintenance.contracts";
import { BffValidationError, type FieldError } from "@/server/backend/errors/bff-error";

const VALID_IMPACTS: readonly BackendMaintenanceImpact[] = ["none", "partial_outage", "full_outage"];
const VALID_SCOPES: readonly BackendMaintenanceScope[] = ["global", "resource"];

export async function buildMaintenanceWritePayload(
  body: unknown,
  loadResources: () => Promise<Resource[]>,
): Promise<BackendMaintenanceWriteRequestDto> {
  const errors: FieldError[] = [];

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new BffValidationError([{ field: "body", message: "must be a JSON object" }]);
  }

  const record = body as Record<string, unknown>;
  if ("planned_period" in record) {
    errors.push({ field: "planned_period", message: "is not accepted; use planned_start_at and steps" });
  }

  const title = readString(record.title);
  if (!title || title.length < 3) {
    errors.push({ field: "title", message: "must contain at least 3 characters" });
  }

  const description = readString(record.description);
  if (!description || description.length < 10) {
    errors.push({ field: "description", message: "must contain at least 10 characters" });
  }

  const plannedStart = readString(record.planned_start_at);
  if (!plannedStart || Number.isNaN(new Date(plannedStart).getTime())) {
    errors.push({ field: "planned_start_at", message: "must be a valid ISO date-time" });
  }

  const impact = normalizeImpact(record.impact, errors);
  const scope = normalizeScope(record.scope, errors);
  const steps = normalizeSteps(record.steps, errors);
  const resourceIds = readResourceIds(record.resource_ids);

  if (scope === "resource" && resourceIds.length === 0) {
    errors.push({ field: "resource_ids", message: "must include at least one resource for resource scope" });
  }

  if (errors.length > 0) {
    throw new BffValidationError(errors);
  }

  const selectedResources =
    scope === "resource" ? resolveSelectedResources(resourceIds, await loadResources()) : [];

  return {
    title: title ?? "",
    description: description ?? "",
    planned_start: new Date(plannedStart ?? "").toISOString(),
    impact,
    scope,
    resources: selectedResources.map((resource) => ({
      id: resource.id,
      type: resource.type,
    })),
    steps,
  };
}

function normalizeImpact(value: unknown, errors: FieldError[]): BackendMaintenanceImpact {
  if (value === undefined || value === null || value === "") {
    return "none";
  }

  if (VALID_IMPACTS.includes(value as BackendMaintenanceImpact)) {
    return value as BackendMaintenanceImpact;
  }

  errors.push({ field: "impact", message: "must be none, partial_outage, or full_outage" });
  return "none";
}

function normalizeScope(value: unknown, errors: FieldError[]): BackendMaintenanceScope {
  if (VALID_SCOPES.includes(value as BackendMaintenanceScope)) {
    return value as BackendMaintenanceScope;
  }

  errors.push({ field: "scope", message: "must be global or resource" });
  return "global";
}

function normalizeSteps(value: unknown, errors: FieldError[]): BackendMaintenanceWriteRequestDto["steps"] {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push({ field: "steps", message: "must include at least one step" });
    return [];
  }

  const seenOrders = new Set<number>();

  return value.map((step, index) => {
    if (!step || typeof step !== "object" || Array.isArray(step)) {
      errors.push({ field: `steps.${index}`, message: "must be an object" });
      return {
        order: index + 1,
        description: "",
        rollback_description: "",
        duration: "0m",
      };
    }

    const record = step as Record<string, unknown>;
    const order = readPositiveInteger(record.order);
    const description = readString(record.description);
    const rollbackDescription = readString(record.rollback_description);
    const durationMinutes = readPositiveInteger(record.duration_minutes);

    if (!order) {
      errors.push({ field: `steps.${index}.order`, message: "must be a positive integer" });
    } else if (seenOrders.has(order)) {
      errors.push({ field: `steps.${index}.order`, message: "must be unique" });
    } else {
      seenOrders.add(order);
    }

    if (!description) {
      errors.push({ field: `steps.${index}.description`, message: "is required" });
    }

    if (!rollbackDescription) {
      errors.push({ field: `steps.${index}.rollback_description`, message: "is required" });
    }

    if (!durationMinutes) {
      errors.push({ field: `steps.${index}.duration_minutes`, message: "must be a positive integer" });
    }

    return {
      order: order || index + 1,
      description: description ?? "",
      rollback_description: rollbackDescription ?? "",
      duration: `${durationMinutes || 0}m`,
    };
  });
}

function resolveSelectedResources(resourceIds: string[], resources: Resource[]) {
  const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
  const missing = resourceIds.filter((resourceId) => !resourcesById.has(resourceId));

  if (missing.length > 0) {
    throw new BffValidationError([
      {
        field: "resource_ids",
        message: `unknown resource id: ${missing.join(", ")}`,
      },
    ]);
  }

  return resourceIds
    .map((resourceId) => resourcesById.get(resourceId))
    .filter((resource): resource is Resource => Boolean(resource));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function readPositiveInteger(value: unknown): number | undefined {
  const numberValue =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : undefined;
}

function readResourceIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(readString).filter((value): value is string => Boolean(value));
}
