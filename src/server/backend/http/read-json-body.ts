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

/**
 * Same as {@link readJsonBody}, but caps the payload first so a crafted request
 * can't buffer arbitrary memory on the BFF before it is relayed. Ported from
 * `src/app/api/admin/roles/role-mutation.ts`.
 *
 * The cap is checked twice on purpose: the declared `content-length` header is
 * cheap but untrusted (it can lie, or be absent under chunked transfer), so the
 * actual body is re-measured after `request.text()`.
 *
 * Over-cap throws a `BffValidationError` with code `BODY_TOO_LARGE`; invalid
 * JSON throws the same 400 envelope as `readJsonBody`. Both surface through
 * `routeErrorResponse`. An empty body parses as `{}` ("change nothing").
 *
 * Note: `raw.length` counts UTF-16 code units, not bytes, so a multi-byte body
 * is measured smaller than it is on the wire — the same behaviour as the
 * `role-mutation.ts` original. Left as-is deliberately: this is a memory
 * guard with an order-of-magnitude margin over real bodies, not a byte-exact
 * quota, and the `content-length` check above already bounds actual bytes when
 * the header is present.
 */
export async function readCappedJsonBody<T>(request: Request, maxBytes: number): Promise<T> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new BffValidationError(
      [{ field: "body", message: "Request body too large" }],
      "Request body too large",
      "BODY_TOO_LARGE",
    );
  }

  const raw = await request.text();
  if (raw.length > maxBytes) {
    throw new BffValidationError(
      [{ field: "body", message: "Request body too large" }],
      "Request body too large",
      "BODY_TOO_LARGE",
    );
  }

  if (raw === "") {
    return {} as T;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new BffValidationError([{ field: "body", message: "Request body must be valid JSON" }]);
  }
}
