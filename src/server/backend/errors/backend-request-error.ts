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
