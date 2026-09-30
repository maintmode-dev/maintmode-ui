import { describe, expect, it } from "vitest";

import type { SignInMethod } from "../sign-in-method";
import {
  emailTransportGap,
  signInReachability,
  type LoginRowLike,
  type SignInReachability,
} from "../sign-in-reachability";

/**
 * Every combination of the sources, enumerated rather than sampled.
 *
 * The rule is small, and the one way it goes wrong is a combination nobody
 * wrote down — so each table below is a whole cross product, with every
 * expected answer written as a literal rather than recomputed from the rule
 * under test.
 */

const METHODS = {
  unread: undefined,
  allOff: [{ enabled: false }, { enabled: false }],
  oneOn: [{ enabled: true }, { enabled: false }],
  // A method this build does not recognise is still a way in.
  onlyUnknownOn: [{ enabled: false }, { enabled: false }, { enabled: true }],
} as const;
type MethodsCase = keyof typeof METHODS;

const login = (over: Partial<LoginRowLike>): LoginRowLike => ({
  kind: "login",
  name: "google",
  enabled: true,
  health: "ok",
  ...over,
});

/**
 * Registry rows — consulted only when `/login`'s list is unavailable.
 *
 * `hiddenProvider` and `unknownProvider` are the shapes seen on a real local
 * stack (`z-provider-…`, `unlinked-…` left by backend tests) and a provider
 * this build has no descriptor for. Enabled and "healthy" as they may claim to
 * be, `/login` does not offer them, and they must never silence the warning.
 */
const INTEGRATIONS: Record<string, LoginRowLike[] | undefined> = {
  unread: undefined,
  empty: [],
  workingProvider: [login({})],
  unknownProvider: [login({ name: "gitlab" })],
  hiddenProvider: [
    login({ name: "z-provider-01a0ef64-c37c-793b-901a-85065c713fea" }),
    login({ name: "unlinked-01a0ef64-90de-71e0-8e9e-95bd4043e80d" }),
  ],
  disabledProvider: [login({ enabled: false, health: "disabled" })],
  disabledButOk: [login({ enabled: false, health: "ok" })],
  unresolved: [login({ health: "unresolved" })],
  unreadable: [login({ health: "unreadable" })],
  healthAbsent: [login({ health: undefined })],
  // A transport is never a way in, however healthy it looks.
  transportOnly: [{ kind: "notify", name: "email", enabled: true, health: "ok" }],
  mixedOneWorking: [
    login({ name: "z-provider-x" }),
    login({ health: "unresolved" }),
    login({ name: "github" }),
  ],
};
type IntegrationsCase = keyof typeof INTEGRATIONS;

describe("signInReachability — fallback to the registry when /login's list is unavailable", () => {
  const EXPECTED: Record<MethodsCase, Record<IntegrationsCase, SignInReachability>> = {
    unread: {
      unread: "unknown",
      empty: "unknown",
      workingProvider: "reachable",
      unknownProvider: "unknown",
      hiddenProvider: "unknown",
      disabledProvider: "unknown",
      disabledButOk: "unknown",
      unresolved: "unknown",
      unreadable: "unknown",
      healthAbsent: "unknown",
      transportOnly: "unknown",
      mixedOneWorking: "reachable",
    },
    allOff: {
      unread: "providers-unknown",
      empty: "lockout",
      workingProvider: "reachable",
      unknownProvider: "lockout",
      hiddenProvider: "lockout",
      disabledProvider: "lockout",
      disabledButOk: "lockout",
      unresolved: "lockout",
      unreadable: "lockout",
      healthAbsent: "lockout",
      transportOnly: "lockout",
      mixedOneWorking: "reachable",
    },
    oneOn: {
      unread: "reachable",
      empty: "reachable",
      workingProvider: "reachable",
      unknownProvider: "reachable",
      hiddenProvider: "reachable",
      disabledProvider: "reachable",
      disabledButOk: "reachable",
      unresolved: "reachable",
      unreadable: "reachable",
      healthAbsent: "reachable",
      transportOnly: "reachable",
      mixedOneWorking: "reachable",
    },
    onlyUnknownOn: {
      unread: "reachable",
      empty: "reachable",
      workingProvider: "reachable",
      unknownProvider: "reachable",
      hiddenProvider: "reachable",
      disabledProvider: "reachable",
      disabledButOk: "reachable",
      unresolved: "reachable",
      unreadable: "reachable",
      healthAbsent: "reachable",
      transportOnly: "reachable",
      mixedOneWorking: "reachable",
    },
  };

  for (const [methodsCase, methods] of Object.entries(METHODS)) {
    for (const [integrationsCase, integrations] of Object.entries(INTEGRATIONS)) {
      const expected = EXPECTED[methodsCase as MethodsCase][integrationsCase];
      it(`built-ins ${methodsCase} × registry ${integrationsCase} → ${expected}`, () => {
        expect(signInReachability(methods, { integrations })).toBe(expected);
      });
    }
  }

  it("treats an empty built-in list as read, with nothing on", () => {
    // The page never passes one (the query throws on empty), but the rule
    // must not read "no rows" as "unknown".
    expect(signInReachability([], { integrations: [] })).toBe("lockout");
  });
});

/**
 * `/login`'s own list, when read, is the provider half's source of truth — the
 * registry is not consulted at all. Crossed with registry states that would
 * each give the OPPOSITE answer on their own, so a rule that still peeked at
 * the registry fails here.
 */
describe("signInReachability — /login's list decides the provider half when it was read", () => {
  const redirect = (id: string): Pick<SignInMethod, "type"> & { id: string } => ({ id, type: "redirect" });
  const OFFERED: Record<string, Pick<SignInMethod, "type">[]> = {
    empty: [],
    builtInsOnly: [{ type: "password" }, { type: "code" }],
    // Drawn as an inert placeholder on /login — not a way in.
    unsupportedOnly: [{ type: "unsupported" }],
    knownProvider: [{ type: "password" }, redirect("google")],
    // /login draws every redirect entry, descriptor or not: a real way in.
    providerWithoutDescriptor: [redirect("gitlab")],
  };
  const REGISTRY = {
    unread: undefined,
    workingProvider: [login({})],
    hiddenProvider: INTEGRATIONS.hiddenProvider,
    empty: [],
  } as const;

  const EXPECTED_ALL_OFF: Record<keyof typeof OFFERED, SignInReachability> = {
    empty: "lockout",
    builtInsOnly: "lockout",
    unsupportedOnly: "lockout",
    knownProvider: "reachable",
    providerWithoutDescriptor: "reachable",
  };
  const EXPECTED_UNREAD: Record<keyof typeof OFFERED, SignInReachability> = {
    empty: "unknown",
    builtInsOnly: "unknown",
    unsupportedOnly: "unknown",
    knownProvider: "reachable",
    providerWithoutDescriptor: "reachable",
  };

  for (const [offeredCase, offered] of Object.entries(OFFERED)) {
    for (const [registryCase, integrations] of Object.entries(REGISTRY)) {
      it(`built-ins allOff × offered ${offeredCase} × registry ${registryCase} → ${EXPECTED_ALL_OFF[offeredCase]}`, () => {
        expect(signInReachability(METHODS.allOff, { offered, integrations })).toBe(
          EXPECTED_ALL_OFF[offeredCase],
        );
      });
      it(`built-ins unread × offered ${offeredCase} × registry ${registryCase} → ${EXPECTED_UNREAD[offeredCase]}`, () => {
        expect(signInReachability(METHODS.unread, { offered, integrations })).toBe(
          EXPECTED_UNREAD[offeredCase],
        );
      });
      it(`built-ins oneOn × offered ${offeredCase} × registry ${registryCase} → reachable`, () => {
        expect(signInReachability(METHODS.oneOn, { offered, integrations })).toBe("reachable");
      });
    }
  }

  it("says providers-unknown only when neither source was read", () => {
    expect(signInReachability(METHODS.allOff, {})).toBe("providers-unknown");
    expect(signInReachability(METHODS.allOff, { offered: [] })).toBe("lockout");
    expect(signInReachability(METHODS.allOff, { integrations: [] })).toBe("lockout");
  });
});

describe("emailTransportGap", () => {
  it("says nothing when the registry could not be read", () => {
    expect(emailTransportGap(undefined)).toBeNull();
  });

  it("reports a missing email row as not configured", () => {
    expect(emailTransportGap([])).toBe("not_configured");
    expect(emailTransportGap([{ kind: "notify", name: "slack", enabled: true }])).toBe("not_configured");
  });

  it("does not mistake a login row named email for the transport", () => {
    expect(emailTransportGap([{ kind: "login", name: "email", enabled: true }])).toBe("not_configured");
  });

  it("reports a switched-off email row as disabled", () => {
    expect(emailTransportGap([{ kind: "notify", name: "email", enabled: false }])).toBe("disabled");
  });

  it("is satisfied by an enabled email row", () => {
    expect(emailTransportGap([{ kind: "notify", name: "email", enabled: true }])).toBeNull();
  });
});
