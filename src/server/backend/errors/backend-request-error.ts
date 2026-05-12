export class BackendRequestError extends Error {
  constructor(
    readonly status: number,
    readonly responseBody: string,
  ) {
    super(`Maintmode backend request failed with status ${status}`);
    this.name = "BackendRequestError";
  }
}

export class BackendUnavailableError extends Error {
  constructor(cause: unknown) {
    super("Maintmode backend is unavailable", { cause });
    this.name = "BackendUnavailableError";
  }
}

/**
 * Raised by the authenticated BFF wrapper when the backend rejects the
 * request with `401` even after a refresh-and-retry attempt. BFF route
 * handlers turn this into a normalized `{ status: 401, code: "AUTH_REQUIRED" }`
 * payload so the browser fetcher can redirect to `/login`.
 */
export class BackendUnauthorizedError extends Error {
  constructor(readonly responseBody: string) {
    super("Maintmode backend rejected the request as unauthorized");
    this.name = "BackendUnauthorizedError";
  }
}
