/**
 * Server-side BFF error envelope.
 *
 * The browser counterpart lives in `src/features/_shared/api/bff-error.ts`
 * and intentionally mirrors `BffErrorPayload` / `FieldError` because the
 * `server-only` boundary forbids the browser layer from importing this
 * module. Keep both shapes in sync when changing either one.
 */

import { NextResponse } from "next/server";

import {
  BackendRequestError,
  BackendUnauthorizedError,
  BackendUnavailableError,
} from "@/server/backend/errors/backend-request-error";
import { ConfigValidationError } from "@/shared/config/runtime-config";

export type FieldError = {
  field: string;
  message: string;
};

export type BffErrorPayload = {
  error: string;
  code: string;
  hint?: string;
  fieldErrors?: FieldError[];
};

type NormalizedRouteError = BffErrorPayload & {
  status: number;
};

export class BffValidationError extends Error {
  readonly fieldErrors: FieldError[];
  readonly code: string;
  readonly hint?: string;

  constructor(
    fieldErrors: FieldError[],
    message = "Validation failed",
    code = "VALIDATION_ERROR",
    hint?: string,
  ) {
    super(message);
    this.name = "BffValidationError";
    this.fieldErrors = fieldErrors;
    this.code = code;
    this.hint = hint;
  }
}

export function routeErrorResponse(error: unknown): NextResponse<BffErrorPayload> {
  const normalized = normalizeRouteError(error);
  const payload: BffErrorPayload = {
    error: normalized.error,
    code: normalized.code,
  };

  if (normalized.hint) {
    payload.hint = normalized.hint;
  }

  if (normalized.fieldErrors && normalized.fieldErrors.length > 0) {
    payload.fieldErrors = normalized.fieldErrors;
  }

  return NextResponse.json(payload, { status: normalized.status });
}

export function normalizeRouteError(error: unknown): NormalizedRouteError {
  if (error instanceof BffValidationError) {
    return {
      error: error.message,
      code: error.code,
      hint: error.hint,
      fieldErrors: error.fieldErrors,
      status: 400,
    };
  }

  if (error instanceof BackendUnauthorizedError) {
    return {
      error: "Sign-in is required",
      code: "AUTH_REQUIRED",
      hint: "The maintmode backend rejected the access token. Re-authenticate via /login.",
      status: 401,
    };
  }

  if (error instanceof BackendRequestError) {
    const body = parseBackendErrorBody(error.responseBody);
    return {
      error: body.message ?? defaultMessageForStatus(error.status),
      code: body.code ?? defaultCodeForStatus(error.status),
      hint: body.hint ?? defaultHintForStatus(error.status),
      fieldErrors: body.fieldErrors,
      status: error.status,
    };
  }

  if (error instanceof ConfigValidationError) {
    return {
      error: "Invalid maintmode backend configuration",
      code: "CONFIG_ERROR",
      hint: "Check MAINTMODE_API_BASE_URL, MAINTMODE_API_TIMEOUT_MS, and MAINTMODE_ENABLE_MOCK_DATA.",
      fieldErrors: error.issues.map((issue) => ({
        field: issue.field,
        message: issue.message,
      })),
      status: 500,
    };
  }

  if (error instanceof BackendUnavailableError) {
    return {
      error: "Maintmode backend is unavailable",
      code: "BACKEND_UNAVAILABLE",
      hint: "The frontend did not fall back to mock data; check backend availability.",
      status: 503,
    };
  }

  return {
    error: "Unexpected BFF error",
    code: "BFF_ERROR",
    hint: "Check server logs for details.",
    status: 500,
  };
}

type ParsedBackendError = {
  code?: string;
  message?: string;
  hint?: string;
  fieldErrors?: FieldError[];
};

function parseBackendErrorBody(responseBody: string): ParsedBackendError {
  if (!responseBody) {
    return {};
  }

  try {
    const parsed = JSON.parse(responseBody) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return { message: responseBody };
    }

    const record = parsed as Record<string, unknown>;
    const fieldErrors = readFieldErrors(record.fieldErrors) ?? readFieldErrors(record.fields);

    return {
      code: typeof record.code === "string" ? record.code : undefined,
      message: typeof record.message === "string" ? record.message : undefined,
      hint: typeof record.hint === "string" ? record.hint : undefined,
      fieldErrors,
    };
  } catch {
    return { message: responseBody };
  }
}

function readFieldErrors(value: unknown): FieldError[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const errors = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      const field = typeof record.field === "string" ? record.field : undefined;
      const message = typeof record.message === "string" ? record.message : undefined;
      if (!field || !message) {
        return null;
      }
      return { field, message };
    })
    .filter((item): item is FieldError => item !== null);

  return errors.length > 0 ? errors : undefined;
}

function defaultCodeForStatus(status: number) {
  if (status === 400) {
    return "VALIDATION_ERROR";
  }
  if (status === 401) {
    return "UNAUTHORIZED";
  }
  if (status === 403) {
    return "FORBIDDEN";
  }
  if (status === 404) {
    return "NOT_FOUND";
  }
  if (status === 409) {
    return "CONFLICT";
  }
  if (status === 503) {
    return "BACKEND_UNAVAILABLE";
  }
  return "BACKEND_ERROR";
}

function defaultMessageForStatus(status: number) {
  if (status === 400) {
    return "Backend rejected the request";
  }
  if (status === 401) {
    return "Backend authentication is required";
  }
  if (status === 403) {
    return "Backend rejected this action";
  }
  if (status === 404) {
    return "Requested maintenance record was not found";
  }
  if (status === 409) {
    return "Maintenance state conflict";
  }
  return "Maintmode backend request failed";
}

function defaultHintForStatus(status: number) {
  if (status >= 500) {
    return "The frontend did not fall back to mock data; check backend availability.";
  }
  return undefined;
}
