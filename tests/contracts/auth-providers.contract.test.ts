import { describe, expect, it, vi } from "vitest";

import { createBackendMock, readWireFixture } from "./_harness";
import { expectWireFields, type FieldSpec } from "./_wire-assertions";

/**
 * Contract test — the sign-in method list behind `/login`. RUK-288, SPEC §8.1.
 *
 * This work adds no BFF route (SPEC §4.0), so the seam under test is the server
 * resolver the login page calls directly. It is the only place this feature
 * touches the wire, and a shape change here is a login page nobody can use —
 * which is why the list is pinned by an executable test rather than by trust.
 */

const wire = readWireFixture<{ methods: unknown[] }>("auth-providers.json");

const backendRequest = createBackendMock<unknown>(wire);
vi.mock("@/server/backend/client/backend-client", () => ({
  backendRequest: (opts: { path: string; method: string }) => backendRequest(opts),
}));

const { resolveAuthProviders } = await import("@/server/backend/auth/resolve-auth-providers");

describe("auth providers — request forwarding", () => {
  it("asks the auth base for the public providers path, uncached", async () => {
    await resolveAuthProviders();

    expect(backendRequest.mock.calls[0]?.[0]).toMatchObject({
      path: "/api/v1/auth/providers",
      method: "GET",
      useAuthBase: true,
      // Public endpoint: a cached response would serve one instance's method
      // list to another.
      cache: "no-store",
    });
  });
});

/**
 * The wire contract as INDEPENDENT literals. Deliberately not derived from
 * `wire` — `expect(m.id).toBe(recorded.id)` holds under every mutation of the
 * fixture, so it would stay green while the contract moved.
 */
const REQUIRED_METHOD_FIELDS: readonly FieldSpec[] = [
  ["id", "string"],
  ["type", "string"],
  ["display_name", "string"],
];

describe("auth providers — the recorded response still matches the contract", () => {
  it("carries every field the login page renders from", () => {
    expectWireFields(wire.methods as Record<string, unknown>[], REQUIRED_METHOD_FIELDS, "auth method");
  });

  it("advertises only method types this build knows how to render", () => {
    const types = (wire.methods as { type: string }[]).map((m) => m.type);
    for (const type of types) {
      expect(["password", "code", "redirect"]).toContain(type);
    }
  });
});

describe("auth providers — response pass-through", () => {
  it("hands the page every method the backend sent", async () => {
    const result = await resolveAuthProviders();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.methods).toHaveLength(wire.methods.length);
    expect(result.methods.map((m) => m.id)).toEqual((wire.methods as { id: string }[]).map((m) => m.id));
  });
});

describe("auth providers — a failure must not masquerade as a method list", () => {
  it("reports failure rather than degrading into an empty list", async () => {
    // The distinction that matters: `{ok:false}` renders the break-glass
    // fallback, while `{ok:true, methods:[]}` would render a login page with no
    // way in and no sign that anything broke.
    backendRequest.mockRejectedValueOnce(new Error("backend exploded"));

    const result = await resolveAuthProviders();

    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("methods");
  });

  it("reports failure when `methods` is not an array", async () => {
    backendRequest.mockResolvedValueOnce({ methods: "not-an-array" });

    expect((await resolveAuthProviders()).ok).toBe(false);
  });

  it("never throws, whatever the backend does", async () => {
    backendRequest.mockRejectedValueOnce(new Error("boom"));

    await expect(resolveAuthProviders()).resolves.toBeDefined();
  });
});

describe("auth providers — a parsed list is rendered as it stands", () => {
  it("passes an empty list through instead of treating it as failure", async () => {
    // Once the list is admin-toggleable (FU-2), treating empty as failure would
    // hand an admin who deliberately disabled every method a synthesized form
    // that answers 401 forever — a lockout caused by the anti-lockout branch.
    backendRequest.mockResolvedValueOnce({ methods: [] });

    const result = await resolveAuthProviders();

    expect(result).toEqual({ ok: true, methods: [] });
  });

  it("keeps an unrecognised type as an inert placeholder rather than dropping it", async () => {
    backendRequest.mockResolvedValueOnce({
      methods: [{ id: "acme-sso", type: "future_type", display_name: "Acme SSO" }],
    });

    const result = await resolveAuthProviders();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Preserved, not dropped: a method this build cannot render must be
    // visible-but-inert, never silently missing.
    expect(result.methods).toHaveLength(1);
    expect(result.methods[0]?.type).toBe("redirect");
  });

  it("drops a malformed entry rather than rendering a nameless button", async () => {
    backendRequest.mockResolvedValueOnce({
      methods: [{ id: "ok", type: "password", display_name: "Password" }, { id: 42 }],
    });

    const result = await resolveAuthProviders();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.methods).toHaveLength(1);
  });
});

describe("auth providers — the fallback must be reachable quickly", () => {
  it("bounds the call well under the shared 10s default", async () => {
    // This fetch blocks the cold-start route's first byte, and the break-glass
    // fallback exists to be REACHED: a ten-second blank tab is indistinguishable
    // from a dead site for the administrator trying to sign in and fix things.
    //
    // Asserts the deadline actually fires, not merely that a signal object was
    // passed. The earlier version checked `toBeInstanceOf(AbortSignal)`, which
    // held just as happily with the bound set to ten minutes — and did hold
    // while the shared client was silently discarding the signal altogether.
    // (`backend-client-signal.test.ts` covers the client honouring it.)
    await resolveAuthProviders();

    const options = backendRequest.mock.calls[0]?.[0] as { signal?: AbortSignal };
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.signal?.aborted).toBe(false);

    // Fires well inside the shared 10s default.
    await new Promise((resolve) => setTimeout(resolve, 2_100));
    expect(options.signal?.aborted).toBe(true);
  }, 10_000);
});
