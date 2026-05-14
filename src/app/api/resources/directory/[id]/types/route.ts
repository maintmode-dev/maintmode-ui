import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { loadResourceTypes } from "@/server/backend/resources/resources-directory-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const types = await loadResourceTypes(id);
    return NextResponse.json({ types });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
