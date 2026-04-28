import { describe, expect, it } from "vitest";
import { createNotImplementedPayload } from "../placeholder-error";

describe("createNotImplementedPayload", () => {
  it("returns a typed not-implemented payload without mock data", () => {
    expect(createNotImplementedPayload("/api/maintenance")).toEqual({
      error: {
        code: "NOT_IMPLEMENTED",
        message: "This BFF route is intentionally scaffolded and does not serve prototype mock data.",
        route: "/api/maintenance",
      },
    });
  });
});
