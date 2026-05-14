import { NextResponse } from "next/server";
import { z } from "zod";

import { BffValidationError, routeErrorResponse } from "@/server/backend/errors/bff-error";
import { loadResources } from "@/server/backend/resources/resources-service";
import { createResource } from "@/server/backend/resources/resources-directory-service";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const resources = await loadResources(searchParams.get("name") ?? "");

    return NextResponse.json({ resources });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

const createResourceSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255, "Name must be 255 characters or fewer"),
  description: z.string().trim().min(1, "Description is required"),
  external_id: z
    .string()
    .trim()
    .max(255, "External ID must be 255 characters or fewer")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const parsed = createResourceSchema.safeParse(body);
    if (!parsed.success) {
      throw new BffValidationError(
        parsed.error.issues.map((issue) => ({
          field: issue.path.join(".") || "_root",
          message: issue.message,
        })),
      );
    }

    const resource = await createResource(parsed.data);
    return NextResponse.json({ resource }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
