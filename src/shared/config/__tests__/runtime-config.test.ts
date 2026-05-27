import { describe, expect, it } from "vitest";

import { ConfigValidationError, parseMaintmodeBackendConfig } from "../runtime-config";

describe("parseMaintmodeBackendConfig", () => {
  it("parses a valid backend config", () => {
    expect(
      parseMaintmodeBackendConfig({
        MAINTMODE_API_BASE_URL: "https://api.example.test/",
        MAINTMODE_AUTH_API_BASE_URL: "https://auth.example.test/",
        MAINTMODE_API_TIMEOUT_MS: "5000",
      }),
    ).toEqual({
      apiBaseUrl: "https://api.example.test",
      authApiBaseUrl: "https://auth.example.test",
      requestTimeoutMs: 5000,
    });
  });

  it("falls back the auth base URL to the resource server URL when not split", () => {
    expect(
      parseMaintmodeBackendConfig({
        MAINTMODE_API_BASE_URL: "http://localhost:8080",
      }),
    ).toEqual({
      apiBaseUrl: "http://localhost:8080",
      authApiBaseUrl: "http://localhost:8080",
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

  it("rejects non-http(s) URLs", () => {
    try {
      parseMaintmodeBackendConfig({
        MAINTMODE_API_BASE_URL: "ftp://api.example.test",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect((error as ConfigValidationError).issues).toEqual([
        { field: "MAINTMODE_API_BASE_URL", message: "must use http or https" },
        { field: "MAINTMODE_AUTH_API_BASE_URL", message: "must use http or https" },
      ]);
      return;
    }

    throw new Error("Expected config validation to fail");
  });
});
