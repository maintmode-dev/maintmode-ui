import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { loadResourceDirectory } from "@/server/backend/resources/resources-directory-service";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const resources = await loadResourceDirectory(searchParams.get("name") ?? "");
    return NextResponse.json({ resources });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
