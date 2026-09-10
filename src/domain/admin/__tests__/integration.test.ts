import { describe, expect, it } from "vitest";

import {
  AUTH_INTEGRATION_KINDS,
  INTEGRATION_KINDS,
  NOTIFICATION_INTEGRATION_KINDS,
  isAuthIntegrationKind,
  isIntegrationKind,
} from "../integration";

/**
 * The two predicates are deliberately asymmetric, and that asymmetry is the
 * whole point of the split (SPEC §3): `isIntegrationKind` is the whitelist on
 * every BFF integrations route, so widening it would let a typed
 * `client_secret` reach a backend that has no route for the kind. It stays
 * narrow until the backend learns the auth kinds.
 */
describe("integration kind lists", () => {
  it("keeps the notification kinds as the transport list", () => {
    expect([...NOTIFICATION_INTEGRATION_KINDS]).toEqual(["slack", "telegram", "email"]);
  });

  it("names the auth kinds separately", () => {
    expect([...AUTH_INTEGRATION_KINDS]).toEqual(["oidc", "github_oauth"]);
  });

  it("composes the full union from both lists", () => {
    expect([...INTEGRATION_KINDS]).toEqual(["slack", "telegram", "email", "oidc", "github_oauth"]);
  });
});

describe("isIntegrationKind — the BFF route whitelist", () => {
  it("accepts the notification kinds", () => {
    expect(isIntegrationKind("slack")).toBe(true);
    expect(isIntegrationKind("telegram")).toBe(true);
    expect(isIntegrationKind("email")).toBe(true);
  });

  // The load-bearing assertion: a route that accepted these would forward a
  // real client_secret to a backend with no route for it.
  it("REJECTS the auth kinds, so the routes 400 them", () => {
    expect(isIntegrationKind("oidc")).toBe(false);
    expect(isIntegrationKind("github_oauth")).toBe(false);
  });

  it("rejects an unknown kind", () => {
    expect(isIntegrationKind("carrier_pigeon")).toBe(false);
  });
});

describe("isAuthIntegrationKind — the UI-side predicate", () => {
  it("accepts the auth kinds", () => {
    expect(isAuthIntegrationKind("oidc")).toBe(true);
    expect(isAuthIntegrationKind("github_oauth")).toBe(true);
  });

  it("rejects the notification kinds", () => {
    expect(isAuthIntegrationKind("slack")).toBe(false);
    expect(isAuthIntegrationKind("email")).toBe(false);
  });
});
