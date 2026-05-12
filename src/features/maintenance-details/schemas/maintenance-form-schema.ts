import { z } from "zod";

export const MAINTENANCE_IMPACTS = ["none", "partial_outage", "full_outage"] as const;
export const MAINTENANCE_SCOPES = ["global", "resource"] as const;

export const TITLE_MIN = 3;
export const TITLE_MAX = 255;
export const DESCRIPTION_MIN = 10;

function isValidIsoLike(value: string) {
  if (!value) {
    return false;
  }
  const ts = new Date(value).getTime();
  return Number.isFinite(ts);
}

export const maintenanceStepSchema = z.object({
  order: z.number().int().positive(),
  description: z.string().trim().min(1, "Description is required"),
  rollback_description: z.string().trim().min(1, "Rollback description is required"),
  duration_minutes: z
    .number({ error: "Duration must be a positive integer" })
    .int()
    .positive("Duration must be a positive integer"),
});

export type MaintenanceFormStep = z.infer<typeof maintenanceStepSchema>;

export const maintenanceFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(TITLE_MIN, `Title must be at least ${TITLE_MIN} characters`)
      .max(TITLE_MAX, `Title must be at most ${TITLE_MAX} characters`),
    description: z
      .string()
      .trim()
      .min(DESCRIPTION_MIN, `Description must be at least ${DESCRIPTION_MIN} characters`),
    planned_start_at: z
      .string()
      .min(1, "Planned start is required")
      .refine(isValidIsoLike, "Planned start must be a valid date-time"),
    impact: z.enum(MAINTENANCE_IMPACTS),
    scope: z.enum(MAINTENANCE_SCOPES),
    resource_ids: z.array(z.string().min(1)),
    steps: z.array(maintenanceStepSchema).min(1, "At least one step is required"),
  })
  .superRefine((value, ctx) => {
    if (value.scope === "resource" && value.resource_ids.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["resource_ids"],
        message: "Select at least one resource for resource scope",
      });
    }
    const seen = new Set<number>();
    for (let i = 0; i < value.steps.length; i++) {
      const order = value.steps[i].order;
      if (seen.has(order)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["steps", i, "order"],
          message: "Step order must be unique",
        });
      }
      seen.add(order);
    }
  });

export type MaintenanceFormValues = z.infer<typeof maintenanceFormSchema>;

export function makeEmptyStep(order: number): MaintenanceFormStep {
  return {
    order,
    description: "",
    rollback_description: "",
    duration_minutes: 30,
  };
}

export function makeDefaultFormValues(
  partial?: Partial<MaintenanceFormValues>,
): MaintenanceFormValues {
  return {
    title: partial?.title ?? "",
    description: partial?.description ?? "",
    planned_start_at: partial?.planned_start_at ?? "",
    impact: partial?.impact ?? "none",
    scope: partial?.scope ?? "global",
    resource_ids: partial?.resource_ids ?? [],
    steps: partial?.steps && partial.steps.length > 0 ? partial.steps : [makeEmptyStep(1)],
  };
}
