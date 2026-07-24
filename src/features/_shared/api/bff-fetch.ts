/**
 * Browser-side fetcher for the BFF layer (`/api/**`). Normalizes errors,
 * handles the `{ code: "AUTH_REQUIRED" }` 401 contract by redirecting to
 * `/login?next=<current path>`, and surfaces the body so React Query
 * `isError` branches can render the right state component.
 *
 * Server-side code calls the backend directly via
 * `src/server/backend/client/*` — that path is NOT shared with this fetcher.
 */

export class BffError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly body?: unknown;

  constructor(status: number, message: string, code?: string, body?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export interface BffFetchOptions extends RequestInit {
  /** Skip the `/login` redirect on 401 — useful for the login-status probe. */
  skipAuthRedirect?: boolean;
}

const JSON_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  Accept: "application/json",
};

export async function bffFetch<T>(path: string, init: BffFetchOptions = {}): Promise<T> {
  const { skipAuthRedirect, headers, ...rest } = init;

  const response = await fetch(path, {
    ...rest,
    credentials: "same-origin",
    headers: {
      ...JSON_HEADERS,
      ...headers,
    },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  let body: unknown = undefined;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    body = await response.json().catch(() => undefined);
  } else {
    body = await response.text().catch(() => undefined);
  }

  if (response.ok) {
    return body as T;
  }

  const codeFromBody =
    typeof body === "object" && body !== null && "code" in body
      ? String((body as { code?: unknown }).code)
      : undefined;

  if (response.status === 401 && codeFromBody === "AUTH_REQUIRED" && !skipAuthRedirect) {
    if (typeof window !== "undefined") {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(`/login?next=${next}`);
      // Return a never-resolving promise so React Query never reaches its
      // isError branch and the UI does not flash a stale state component
      // before the browser actually navigates away.
      return new Promise<T>(() => {});
    }
  }

  // Global license gate: a suspended org 403s every MUTATING request with this
  // stable code (backend: maintmode `internal/server/middlewares/license_suspend.go`).
  // Reads are never gated, so this branch fires only on writes — no GET can hang
  // a Suspense boundary here. Mirrors the 401 AUTH_REQUIRED handler above:
  // redirect + never-resolving promise so React Query never flashes an error
  // state before navigation.
  if (response.status === 403 && codeFromBody === "organization_suspended") {
    if (typeof window !== "undefined") {
      window.location.replace("/suspended");
      return new Promise<T>(() => {}); // same never-resolving contract as the 401 path
    }
  }

  throw new BffError(
    response.status,
    typeof body === "object" && body !== null && "error" in body
      ? String((body as { error?: unknown }).error)
      : `BFF ${response.status} ${response.statusText}`,
    codeFromBody,
    body,
  );
}
