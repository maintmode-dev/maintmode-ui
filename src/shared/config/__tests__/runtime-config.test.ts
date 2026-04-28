import { describe, expect, it } from "vitest";
import { ConfigValidationError, parseMaintmodeBackendConfig } from "../runtime-config";

describe("parseMaintmodeBackendConfig", () => {
  it("parses a valid backend config", () => {
    expect(
      parseMaintmodeBackendConfig({
        MAINTMODE_API_BASE_URL: "https://api.example.test/",
        MAINTMODE_API_TIMEOUT_MS: "5000",
      }),
    ).toEqual({
      apiBaseUrl: "https://api.example.test",
      requestTimeoutMs: 5000,
    });
  });

  it("uses the default timeout when no timeout is provided", () => {
    expect(
      parseMaintmodeBackendConfig({
        MAINTMODE_API_BASE_URL: "http://localhost:8080",
      }),
    ).toEqual({
      apiBaseUrl: "http://localhost:8080",
      requestTimeoutMs: 10000,
    });
  });

  it("throws a typed validation error when the backend URL is missing", () => {
    expect(() => parseMaintmodeBackendConfig({})).toThrow(ConfigValidationError);
  });

  it("reports invalid timeout values", () => {
    try {
      parseMaintmodeBackendConfig({
        MAINTMODE_API_BASE_URL: "https://api.example.test",
        MAINTMODE_API_TIMEOUT_MS: "1",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect((error as ConfigValidationError).issues).toEqual([
        {
          field: "MAINTMODE_API_TIMEOUT_MS",
          message: "must be between 100 and 60000",
        },
      ]);
      return;
    }

    throw new Error("Expected config validation to fail");
  });
});
