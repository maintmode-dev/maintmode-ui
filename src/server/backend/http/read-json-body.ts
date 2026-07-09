import "server-only";

import { BffValidationError } from "@/server/backend/errors/bff-error";

/**
 * Parse a mutation request's JSON body, mapping malformed/empty JSON to a 400
 * `BffValidationError` instead of letting the `SyntaxError` surface as a 500
 * `BFF_ERROR`. Only reachable by non-UI clients — `bffFetch` always sends
 * valid JSON.
 */
export async function readJsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new BffValidationError([{ field: "body", message: "Request body must be valid JSON" }]);
  }
}
