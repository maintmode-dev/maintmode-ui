import { describe, expect, it } from "vitest";

import {
  INTEGRATION_CATEGORIES,
  LOGIN_INTEGRATION_NAMES,
  NOTIFICATION_INTEGRATION_NAMES,
  isIntegrationCategory,
  isIntegrationHealth,
  isLoginIntegrationName,
  isNotifyIntegrationName,
  isRoutableIntegrationPair,
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
   * The replacements for `oidc`/`github_oauth`, which named nothing. These are
   * the backend's own names. `github` is absent because it lives only on an
   * unmerged backend branch — see the constant's docblock.
   */
  it("names the two sign-in providers the backend serves", () => {
    expect([...LOGIN_INTEGRATION_NAMES]).toEqual(["google", "custom"]);
  });
});

describe("isNotifyIntegrationName", () => {
  it("accepts the three transport systems", () => {
    expect(isNotifyIntegrationName("slack")).toBe(true);
    expect(isNotifyIntegrationName("telegram")).toBe(true);
    expect(isNotifyIntegrationName("email")).toBe(true);
  });

  /**
   * Still false here, and that is not the routing answer any more: this
   * predicate reports membership of the notify half only. Whether a login name
   * may be sent is `isRoutableIntegrationPair`'s question, below.
   */
  it("rejects login system names — it answers about its own half", () => {
    expect(isNotifyIntegrationName("google")).toBe(false);
    expect(isNotifyIntegrationName("custom")).toBe(false);
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

describe("isLoginIntegrationName", () => {
  it("accepts the two providers the backend registry serves", () => {
    expect(isLoginIntegrationName("google")).toBe(true);
    expect(isLoginIntegrationName("custom")).toBe(true);
  });

  /**
   * `github` is a real backend name — on an UNMERGED branch. Against the
   * deployed registry `(login, github)` is a 400, so admitting it here would
   * build a form for a pair the backend refuses.
   */
  it("rejects github, which the deployed backend does not serve", () => {
    expect(isLoginIntegrationName("github")).toBe(false);
  });

  it("rejects a transport name and a category", () => {
    expect(isLoginIntegrationName("slack")).toBe(false);
    expect(isLoginIntegrationName("login")).toBe(false);
  });
});

/**
 * The routability gate. Every assertion here is a request the BFF either
 * forwards or refuses before touching the backend — including one that carries
 * a real `client_secret`.
 */
describe("isRoutableIntegrationPair — the BFF route whitelist", () => {
  it("admits the three transports under notify", () => {
    expect(isRoutableIntegrationPair("notify", "slack")).toBe(true);
    expect(isRoutableIntegrationPair("notify", "telegram")).toBe(true);
    expect(isRoutableIntegrationPair("notify", "email")).toBe(true);
  });

  it("admits the two sign-in providers under login", () => {
    expect(isRoutableIntegrationPair("login", "google")).toBe(true);
    expect(isRoutableIntegrationPair("login", "custom")).toBe(true);
  });

  /**
   * The case that proves widening did not become "allow anything". Both halves
   * are individually valid and the pair is still refused — the backend refuses
   * it too (`registry.go`: "%q is a %s integration, not %s").
   */
  it("REFUSES a valid name under the wrong category", () => {
    expect(isRoutableIntegrationPair("login", "slack")).toBe(false);
    expect(isRoutableIntegrationPair("notify", "google")).toBe(false);
  });

  it("refuses a category this frontend does not know", () => {
    expect(isRoutableIntegrationPair("billing", "slack")).toBe(false);
    expect(isRoutableIntegrationPair("", "slack")).toBe(false);
  });

  it("refuses an unknown name in a known category", () => {
    expect(isRoutableIntegrationPair("login", "github")).toBe(false);
    expect(isRoutableIntegrationPair("notify", "carrier_pigeon")).toBe(false);
  });

  /** The two halves are not interchangeable: neither is a pair on its own. */
  it("refuses the halves swapped", () => {
    expect(isRoutableIntegrationPair("slack", "notify")).toBe(false);
    expect(isRoutableIntegrationPair("google", "login")).toBe(false);
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
