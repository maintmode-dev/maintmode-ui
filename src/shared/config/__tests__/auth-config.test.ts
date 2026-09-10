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
    MAINTMODE_AUTH_PUBLIC_BASE_URL: "http://localhost:9000/auth",
  };

  it("parses a complete env into a normalized config", () => {
    const config = parseMaintmodeAuthConfig(validEnv);
    expect(config).toEqual({
      authSecret: "a".repeat(32),
      appBaseUrl: "http://localhost:3000",
      authPublicBaseUrl: "http://localhost:9000/auth",
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
    expect(() => parseMaintmodeAuthConfig({ ...validEnv, MAINTMODE_AUTH_SECRET: "short" })).toThrow(
      AuthConfigValidationError,
    );
  });

  it("rejects non-http base URLs", () => {
    expect(() => parseMaintmodeAuthConfig({ ...validEnv, MAINTMODE_APP_BASE_URL: "ftp://app.test" })).toThrow(
      AuthConfigValidationError,
    );
  });

  /**
   * RUK-292. The dance is a BROWSER navigation to the backend, so the address it
   * targets must be reachable from the browser — which the neighbouring
   * `MAINTMODE_AUTH_API_BASE_URL` is not (`http://caddy:3000/auth` in dev). A
   * missing value has to fail at startup rather than at the first click on the
   * provider button, which is the only other moment it would ever be noticed.
   */
  it("requires the public auth base url", () => {
    expect(() =>
      parseMaintmodeAuthConfig({ ...validEnv, MAINTMODE_AUTH_PUBLIC_BASE_URL: undefined }),
    ).toThrow(AuthConfigValidationError);
  });

  it("rejects a non-http public auth base url", () => {
    expect(() =>
      parseMaintmodeAuthConfig({ ...validEnv, MAINTMODE_AUTH_PUBLIC_BASE_URL: "ftp://auth.test" }),
    ).toThrow(AuthConfigValidationError);
  });

  it("trims one trailing slash from the public auth base url", () => {
    const config = parseMaintmodeAuthConfig({
      ...validEnv,
      MAINTMODE_AUTH_PUBLIC_BASE_URL: "https://auth.test/auth/",
    });
    // The gateway path prefix is part of the value, not something the caller
    // appends: Caddy serves the backend under `handle_path /auth/*`.
    expect(config.authPublicBaseUrl).toBe("https://auth.test/auth");
  });

  /**
   * The Google pair is no longer read at all (RUK-292 removed the NextAuth
   * provider). Asserted rather than assumed: leaving the required-ness behind
   * would keep every deployment setting two variables nothing consumes, and the
   * next person to delete them would take the app's startup down with them.
   */
  it("no longer requires the google client id and secret", () => {
    expect(() =>
      parseMaintmodeAuthConfig({
        ...validEnv,
        MAINTMODE_GOOGLE_OAUTH_CLIENT_ID: undefined,
        MAINTMODE_GOOGLE_OAUTH_CLIENT_SECRET: undefined,
      }),
    ).not.toThrow();
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
