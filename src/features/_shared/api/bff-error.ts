/**
 * Browser-side mirror of the BFF error contract.
 *
 * These types intentionally duplicate `src/server/backend/errors/bff-error.ts`:
 * the server module owns producing the JSON envelope and lives behind the
 * `server-only` import boundary; this module owns parsing it back into a
 * typed exception that React Query mutations and feature components consume.
 * If you change one shape, change the other in the same commit and update the
 * shared envelope description in `AGENTS.md`.
 */

export type BffFieldError = {
  field: string;
  message: string;
};

export type BffErrorPayload = {
  error: string;
  code: string;
  hint?: string;
  fieldErrors?: BffFieldError[];
};
export class BffError extends Error {
  readonly status: number;
  readonly code: string;
  readonly hint?: string;
  readonly fieldErrors?: BffFieldError[];

  constructor(status: number, payload: BffErrorPayload) {
    super(payload.error);
    this.name = "BffError";
    this.status = status;
    this.code = payload.code;
    this.hint = payload.hint;
    this.fieldErrors = payload.fieldErrors;
  }

  get isAuthRequired() {
    return this.status === 401 || this.code === "AUTH_REQUIRED";
  }
}
