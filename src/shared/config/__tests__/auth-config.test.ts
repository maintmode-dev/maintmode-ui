import { describe, expect, it } from "vitest";

import {
  AuthConfigValidationError,
  isSafeOriginalUri,
  parseMaintmodeAuthConfig,
} from "@/shared/config/auth-config";

describe("auth-config", () => {
  const validEnv: Record<string, string | undefined> = {
    MAINTMODE_AUTH_SECRET: "a".repeat(32),
    MAINTMODE_APP_BASE_URL: "http://localhost:3000",
    MAINTMODE_GOOGLE_OAUTH_CLIENT_ID: "client-id",
    MAINTMODE_GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
  };

  it("parses a complete env into a normalized config", () => {
    const config = parseMaintmodeAuthConfig(validEnv);
    expect(config).toEqual({
      authSecret: "a".repeat(32),
      appBaseUrl: "http://localhost:3000",
      googleClientId: "client-id",
      googleClientSecret: "client-secret",
      devAuthBypassEnabled: false,
    });
  });

  it("enables dev auth bypass when flag is set and NODE_ENV is not production", () => {
    const config = parseMaintmodeAuthConfig({
      ...validEnv,
      MAINTMODE_DEV_AUTH_BYPASS: "true",
      NODE_ENV: "development",
    });
    expect(config.devAuthBypassEnabled).toBe(true);
  });

  it("forces dev auth bypass off in production even if flag is set", () => {
    const config = parseMaintmodeAuthConfig({
      ...validEnv,
      MAINTMODE_DEV_AUTH_BYPASS: "true",
      NODE_ENV: "production",
    });
    expect(config.devAuthBypassEnabled).toBe(false);
  });

  it("strips a trailing slash on the app base URL", () => {
    const config = parseMaintmodeAuthConfig({ ...validEnv, MAINTMODE_APP_BASE_URL: "https://app.test/" });
    expect(config.appBaseUrl).toBe("https://app.test");
  });

  it("rejects short secrets", () => {
    expect(() =>
      parseMaintmodeAuthConfig({ ...validEnv, MAINTMODE_AUTH_SECRET: "short" }),
    ).toThrow(AuthConfigValidationError);
  });

  it("rejects non-http base URLs", () => {
    expect(() =>
      parseMaintmodeAuthConfig({ ...validEnv, MAINTMODE_APP_BASE_URL: "ftp://app.test" }),
    ).toThrow(AuthConfigValidationError);
  });

  it("requires google client id and secret", () => {
    expect(() =>
      parseMaintmodeAuthConfig({ ...validEnv, MAINTMODE_GOOGLE_OAUTH_CLIENT_ID: undefined }),
    ).toThrow(AuthConfigValidationError);
    expect(() =>
      parseMaintmodeAuthConfig({ ...validEnv, MAINTMODE_GOOGLE_OAUTH_CLIENT_SECRET: undefined }),
    ).toThrow(AuthConfigValidationError);
  });
});

describe("isSafeOriginalUri", () => {
  it.each([
    ["/calendar", true],
    ["/maintenance/abc", true],
    ["/", true],
    ["//evil.com", false],
    ["http://evil.com", false],
    ["/path\\evil", false],
    ["", false],
    [null, false],
    [undefined, false],
  ])("classifies %s as %s", (value, expected) => {
    expect(isSafeOriginalUri(value)).toBe(expected);
  });
});
