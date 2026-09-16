import { describe, expect, it } from "vitest";

import {
  AUTH_INTEGRATION_KINDS,
  INTEGRATION_CATEGORIES,
  NOTIFICATION_INTEGRATION_NAMES,
  isIntegrationCategory,
  isIntegrationHealth,
  isNotifyIntegrationName,
} from "../integration";

/**
 * After `b74a4536` a row is identified by the PAIR `(kind, name)`: `kind` is the
 * category (`notify`/`login`), `name` is the system. The old single predicate
 * `isIntegrationKind` answered "is this a routable system" off one field, and
 * that question no longer maps onto one field — hence two predicates here.
 */
describe("integration vocabulary", () => {
  it("names the two categories", () => {
    expect([...INTEGRATION_CATEGORIES]).toEqual(["notify", "login"]);
  });

  it("keeps the notify half a closed set of three systems", () => {
    expect([...NOTIFICATION_INTEGRATION_NAMES]).toEqual(["slack", "telegram", "email"]);
  });

  /**
   * Values frozen, not corrected: these name nothing in the new vocabulary, but
   * they are only referenced from the dev-gated section and RUK-302 owns them.
   * Rewriting them here would collide with that ticket for no benefit (SPEC §1.1).
   */
  it("leaves the dev-gated auth kinds untouched", () => {
    expect([...AUTH_INTEGRATION_KINDS]).toEqual(["oidc", "github_oauth"]);
  });
});

describe("isNotifyIntegrationName — the BFF route whitelist", () => {
  it("accepts the three transport systems", () => {
    expect(isNotifyIntegrationName("slack")).toBe(true);
    expect(isNotifyIntegrationName("telegram")).toBe(true);
    expect(isNotifyIntegrationName("email")).toBe(true);
  });

  /**
   * Load-bearing, and it survives the rename: the routes serve no login
   * providers, so a form that reached one would hand a real `client_secret` to
   * a route this BFF does not proxy. RUK-302 widens this together with the
   * forms that need it.
   */
  it("REJECTS login system names, so the routes 400 them", () => {
    expect(isNotifyIntegrationName("google")).toBe(false);
    expect(isNotifyIntegrationName("custom")).toBe(false);
    expect(isNotifyIntegrationName("github")).toBe(false);
  });

  /** A category is not a name — the confusion this whole change exists to fix. */
  it("rejects a category passed where a name belongs", () => {
    expect(isNotifyIntegrationName("notify")).toBe(false);
    expect(isNotifyIntegrationName("login")).toBe(false);
  });

  it("rejects an unknown name", () => {
    expect(isNotifyIntegrationName("carrier_pigeon")).toBe(false);
  });
});

describe("isIntegrationCategory", () => {
  it("accepts both categories", () => {
    expect(isIntegrationCategory("notify")).toBe(true);
    expect(isIntegrationCategory("login")).toBe(true);
  });

  /** The bug: the mapper used to test the category against system names. */
  it("rejects a system name passed where a category belongs", () => {
    expect(isIntegrationCategory("slack")).toBe(false);
    expect(isIntegrationCategory("google")).toBe(false);
  });
});

describe("isIntegrationHealth", () => {
  it("accepts the four backend values", () => {
    expect(isIntegrationHealth("ok")).toBe(true);
    expect(isIntegrationHealth("unresolved")).toBe(true);
    expect(isIntegrationHealth("disabled")).toBe(true);
    expect(isIntegrationHealth("unreadable")).toBe(true);
  });

  it("rejects a value this frontend does not understand", () => {
    expect(isIntegrationHealth("expired")).toBe(false);
    expect(isIntegrationHealth("")).toBe(false);
  });
});
