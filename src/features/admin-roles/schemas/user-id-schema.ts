import { z } from "zod";

export const userIdSchema = z.object({
  user_id: z.string().trim().min(1, "User ID is required").max(255),
});

export type UserIdInput = z.infer<typeof userIdSchema>;
