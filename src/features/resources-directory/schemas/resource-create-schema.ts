import { z } from "zod";

export const resourceCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255, "Name must be 255 characters or fewer"),
  description: z.string().trim().min(1, "Description is required"),
  external_id: z
    .string()
    .trim()
    .max(255, "External ID must be 255 characters or fewer")
    .optional(),
});

export type ResourceCreateInput = z.infer<typeof resourceCreateSchema>;
