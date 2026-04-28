import { NextResponse } from "next/server";
import { createNotImplementedPayload } from "@/server/backend/errors/placeholder-error";

export function notImplemented(route: string) {
  return NextResponse.json(createNotImplementedPayload(route), {
    status: 501,
    headers: {
      "cache-control": "no-store",
    },
  });
}
