import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { loadResourceDirectoryItem } from "@/server/backend/resources/resources-directory-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const resource = await loadResourceDirectoryItem(id);
    return NextResponse.json({ resource });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
