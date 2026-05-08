import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { loadResources } from "@/server/backend/resources/resources-service";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const resources = await loadResources(searchParams.get("name") ?? "");

    return NextResponse.json({ resources });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
