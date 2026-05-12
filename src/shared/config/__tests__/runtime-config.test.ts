import { describe, expect, it } from "vitest";
import { ConfigValidationError, parseMaintmodeBackendConfig } from "../runtime-config";

describe("parseMaintmodeBackendConfig", () => {
  it("parses a valid backend config", () => {
    expect(
      parseMaintmodeBackendConfig({
        MAINTMODE_API_BASE_URL: "https://api.example.test/",
        MAINTMODE_AUTH_API_BASE_URL: "https://auth.example.test/",
        MAINTMODE_API_TIMEOUT_MS: "5000",
        MAINTMODE_ENABLE_MOCK_DATA: "true",
      }),
    ).toEqual({
      apiBaseUrl: "https://api.example.test",
      authApiBaseUrl: "https://auth.example.test",
      requestTimeoutMs: 5000,
      enableMockData: true,
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
      enableMockData: false,
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

  it("rejects MAINTMODE_ENABLE_MOCK_DATA=true in production", () => {
    expect(() =>
      parseMaintmodeBackendConfig({
        MAINTMODE_API_BASE_URL: "https://api.example.test",
        MAINTMODE_ENABLE_MOCK_DATA: "true",
        NODE_ENV: "production",
      }),
    ).toThrow(ConfigValidationError);
  });

  it("allows MAINTMODE_ENABLE_MOCK_DATA=true outside production", () => {
    const config = parseMaintmodeBackendConfig({
      MAINTMODE_API_BASE_URL: "https://api.example.test",
      MAINTMODE_ENABLE_MOCK_DATA: "true",
      NODE_ENV: "development",
    });
    expect(config.enableMockData).toBe(true);
  });

  it("reports invalid mock mode flag values", () => {
    try {
      parseMaintmodeBackendConfig({
        MAINTMODE_API_BASE_URL: "https://api.example.test",
        MAINTMODE_ENABLE_MOCK_DATA: "yes",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect((error as ConfigValidationError).issues).toEqual([
        {
          field: "MAINTMODE_ENABLE_MOCK_DATA",
          message: "must be true or false",
        },
      ]);
      return;
    }

    throw new Error("Expected config validation to fail");
  });
});
