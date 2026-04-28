export class BackendRequestError extends Error {
  constructor(
    readonly status: number,
    readonly responseBody: string,
  ) {
    super(`Maintmode backend request failed with status ${status}`);
    this.name = "BackendRequestError";
  }
}
