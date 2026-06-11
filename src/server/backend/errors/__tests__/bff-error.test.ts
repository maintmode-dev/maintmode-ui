import { describe, expect, it } from "vitest";

import { BackendRequestError, BackendUnavailableError } from "@/server/backend/errors/backend-request-error";
import { normalizeRouteError } from "@/server/backend/errors/bff-error";

describe("normalizeRouteError", () => {
  it("maps backend errors to the BFF error payload contract", () => {
    expect(
      normalizeRouteError(
        new BackendRequestError(
          400,
          JSON.stringify({
            code: "INVALID_STEPS",
            message: "steps are required",
            fields: [{ field: "steps", message: "must include at least one step" }],
          }),
        ),
      ),
    ).toEqual({
      error: "steps are required",
      code: "INVALID_STEPS",
      hint: undefined,
      fieldErrors: [{ field: "steps", message: "must include at least one step" }],
      status: 400,
    });
  });

  it("maps network failures without enabling mock data", () => {
    const error = new BackendUnavailableError(new TypeError("fetch failed"));

    expect(normalizeRouteError(error)).toEqual({
      error: "Maintmode backend is unavailable",
      code: "BACKEND_UNAVAILABLE",
      hint: "The frontend did not fall back to mock data; check backend availability.",
      status: 503,
    });
  });

  it("hints at backend logs (not mock fallback) for backend 5xx without its own hint", () => {
    expect(
      normalizeRouteError(
        new BackendRequestError(
          500,
          JSON.stringify({ code: "internal error", message: "complete maintenance failed" }),
        ),
      ),
    ).toEqual({
      error: "complete maintenance failed",
      code: "internal error",
      hint: "The maintmode backend returned an internal error; check the backend logs for this request.",
      fieldErrors: undefined,
      status: 500,
    });
  });

  it("does not hide internal TypeError bugs as backend outages", () => {
    expect(normalizeRouteError(new TypeError("adapter bug"))).toEqual({
      error: "Unexpected BFF error",
      code: "BFF_ERROR",
      hint: "Check server logs for details.",
      status: 500,
    });
  });
});
