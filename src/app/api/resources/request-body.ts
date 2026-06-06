import "server-only";

import { NextResponse } from "next/server";

/**
 * Read and JSON-parse a mutation request body with a size cap.
 *
 * Returns either the parsed object or a ready-to-return error `NextResponse`
 * (413 when the body exceeds `maxBytes`, 400 when it isn't valid JSON) so a
 * malformed client body surfaces as a client error rather than falling through
 * to a generic 500. An empty body parses to `{}`.
 */
export async function readJsonBody<T>(
  request: Request,
  maxBytes: number,
): Promise<{ data: Partial<T> } | { error: NextResponse }> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return {
      error: NextResponse.json({ error: "Request body too large", code: "BODY_TOO_LARGE" }, { status: 413 }),
    };
  }

  const raw = await request.text();
  if (raw.length > maxBytes) {
    return {
      error: NextResponse.json({ error: "Request body too large", code: "BODY_TOO_LARGE" }, { status: 413 }),
    };
  }

  if (!raw) {
    return { data: {} };
  }

  try {
    return { data: JSON.parse(raw) as Partial<T> };
  } catch {
    return {
      error: NextResponse.json({ error: "Invalid JSON body", code: "VALIDATION_ERROR" }, { status: 400 }),
    };
  }
}
