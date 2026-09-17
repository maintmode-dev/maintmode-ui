import { beforeEach, describe, expect, it, vi } from "vitest";

import { createBackendMock, readWireFixture } from "./_harness";

import type {
  IntegrationDto,
  ListIntegrationsResponseDto,
} from "@/server/backend/contracts/integrations-dto";
import type { Integration } from "@/domain/admin/integration";

/**
 * Contract tests — the four integrations routes that had none. RUK-304.
 *
 * `AGENTS.md` asks for one contract test per BFF route. Integrations had
 * exactly one, for test-send, and that gap is precisely what let `b74a4536`
 * reach an administrator's screen: the backend turned `kind` into a category
 * and moved the system to `name`, the mapper's whitelist matched nothing, and
 * every row was dropped on a 200. Nothing failed. The screen rendered its
 * static list and reported that nothing was configured.
 *
 * So the load-bearing case here is not "the happy path still works" — it is
 * that a response the frontend cannot place must never look like an empty
 * registry.
 *
 * The fixture is recorded from the wire (`npm run fixtures:refresh --
 * integrations`) against a backend built at `b74a4536`, with the rows created
 * through the API. Its `health` values are observations, not choices: the login
 * row carries one and the notify rows have no such field at all, which is why
 * the mapper must not default it.
 */

const wire = readWireFixture<ListIntegrationsResponseDto>("integrations.json");

/** The recorded rows, by system — the fixture is the source, never a literal. */
const recorded = Object.fromEntries((wire.integrations ?? []).map((row) => [row.name ?? "", row])) as Record<
  string,
  IntegrationDto
>;

/**
 * No default answer: the list route and the item routes need differently
 * shaped bodies, and one default would silently feed a list envelope to a
 * route expecting a single row. Each case says what the backend returns.
 */
const backendRequest = createBackendMock<unknown>();
vi.mock("@/server/backend/client/authenticated-backend-request", () => ({
  authenticatedBackendRequest: (opts: { path: string }) => backendRequest(opts),
}));

const isSameOriginRequest = vi.fn((_request: Request) => true);
vi.mock("@/server/backend/security/csrf", () => ({
  isSameOriginRequest: (request: Request) => isSameOriginRequest(request),
}));

const requireAdminSession = vi.fn();
vi.mock("@/server/auth/require-admin", () => ({
  requireAdminSession: () => requireAdminSession(),
}));

const collection = await import("@/app/api/admin/integrations/route");
const item = await import("@/app/api/admin/integrations/[kind]/[name]/route");
const toggle = await import("@/app/api/admin/integrations/[kind]/[name]/toggle/route");

beforeEach(() => {
  isSameOriginRequest.mockReturnValue(true);
  requireAdminSession.mockResolvedValue(undefined);
});

/**
 * Seed the recorded list envelope, call the collection GET and parse the
 * answer — the three steps every case in that describe repeats verbatim.
 */
async function listedIntegrations(): Promise<Integration[]> {
  backendRequest.mockResolvedValue(wire);
  const response = await collection.GET();
  const body = (await response.json()) as { integrations: Integration[] };
  return body.integrations;
}

/** The path the route asked the backend for, from its first call. */
function backendPath(): string {
  return (backendRequest.mock.calls[0]?.[0] as { path: string } | undefined)?.path ?? "";
}

/** The body the route forwarded, parsed. */
function backendBody(): Record<string, unknown> {
  const opts = backendRequest.mock.calls[0]?.[0] as { body?: string } | undefined;
  return JSON.parse(opts?.body ?? "{}") as Record<string, unknown>;
}

/**
 * A JSON request to `url`. Only the three fields every route handler reads are
 * fixed here; the URL, the method and the `params` stay at each call site,
 * because those are what the cases are asserting about.
 */
function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/admin/integrations — the list that lied", () => {
  it("passes every recorded row through instead of dropping it", async () => {
    const integrations = await listedIntegrations();

    // The regression, stated as a count. Before the fix this was 0 — on a 200,
    // with no error anywhere for the screen to notice.
    expect(integrations).toHaveLength(wire.integrations?.length ?? 0);
    expect(integrations.length).toBeGreaterThan(0);
  });

  /**
   * Stated as LITERALS, deliberately.
   *
   * An earlier version of this test compared each row against the fixture entry
   * it came from (`expect(row.kind).toBe(recorded[row.name].kind)`), reasoning
   * that reading the fixture beat retyping it. That was backwards: the fixture
   * is also what the mock returns, so the assertion reduced to "the mapper
   * copies a field" and held no matter what the field contained. Proved by
   * relabelling slack as a login row in the fixture — the whole file stayed
   * green. Literals here mean the recorded bytes are the INPUT and this file is
   * the claim about them; a capture that contradicts the claim now fails.
   */
  it("carries both halves of the pair, as recorded", async () => {
    const byName = Object.fromEntries((await listedIntegrations()).map((r) => [r.name, r]));

    expect(byName.slack.kind).toBe("notify");
    expect(byName.email.kind).toBe("notify");
    expect(byName.google.kind).toBe("login");
  });

  /**
   * `secrets_set` reports WHETHER a credential is configured, never its value —
   * booleans by construction. Pinned on the type because the capture script
   * masks by key name, and every key in this map ("bot_token", "client_secret")
   * reads as sensitive: the first recording turned each `true` into
   * `"<redacted-bot_token>"`, so the fixture described a string map the backend
   * has never sent. Masking is now type-aware; this is the assertion that
   * notices if that regresses.
   */
  it("reports secrets as booleans, never as values", async () => {
    const integrations = await listedIntegrations();

    for (const row of integrations) {
      for (const [key, isSet] of Object.entries(row.secrets_set)) {
        expect(typeof isSet, `${row.name}.${key}`).toBe("boolean");
      }
    }
    // Vacuous if the rows carried no secrets at all.
    expect(integrations.some((r) => Object.keys(r.secrets_set).length > 0)).toBe(true);
  });

  it("carries health for the login row and leaves the transports without it", async () => {
    const byName = Object.fromEntries((await listedIntegrations()).map((r) => [r.name, r]));

    // `undefined` means NOT APPLICABLE, and the backend omits the field for
    // notify rows entirely — verified on the wire, not assumed. A mapper
    // writing `?? "ok"` would report an inapplicable field as a healthy one.
    expect(byName.google.health).toBe("ok");
    expect(byName.slack.health).toBeUndefined();
    expect(byName.email.health).toBeUndefined();
  });

  /**
   * The failure mode this whole ticket is about. A body the frontend cannot
   * place must surface as an error, never as "you have nothing configured".
   */
  it("keeps a backend error an error rather than degrading to an empty list", async () => {
    backendRequest.mockRejectedValueOnce(new Error("backend exploded"));

    const response = await collection.GET();

    expect(response.status).toBeGreaterThanOrEqual(400);
    const body = (await response.json()) as { integrations?: unknown[] };
    expect(body.integrations).toBeUndefined();
  });
});

describe("POST /api/admin/integrations — create", () => {
  const create = (body: unknown) =>
    collection.POST(jsonRequest("https://app.test/api/admin/integrations", "POST", body));

  const VALID = { kind: "notify", name: "slack", enabled: true, config: {}, secrets: {} };

  it("forwards both halves of the pair", async () => {
    backendRequest.mockResolvedValue(recorded.slack);

    await create(VALID);

    // Before `b74a4536` the system lived in `kind`, so a body carrying only
    // `kind: "slack"` is the shape the backend now rejects.
    expect(backendBody().kind).toBe("notify");
    expect(backendBody().name).toBe("slack");
  });

  it("accepts a valid pair rather than rejecting the category", async () => {
    backendRequest.mockResolvedValue(recorded.slack);

    const response = await create(VALID);

    // Guarding with the name predicate on `kind` would 400 every create — the
    // opposite mistake to the one that caused the incident, equally total.
    expect(response.status).toBe(200);
    expect(backendRequest).toHaveBeenCalled();
  });

  /**
   * The backend caps this group at 64 KiB and answers a larger body from
   * middleware, BEFORE its handler — so what comes back is not the JSON error
   * envelope this frontend knows how to read. Refusing the same size here turns
   * an opaque failure into a field error, and stops an unbounded buffered read
   * on a path that now carries a real `client_secret`.
   */
  it("refuses a body over the backend's cap without forwarding it", async () => {
    const huge = { ...VALID, config: { note: "x".repeat(64 * 1024) } };

    const response = await create(huge);

    expect(response.status).toBe(400);
    expect(backendRequest).not.toHaveBeenCalled();
  });

  it("rejects a missing name here rather than paying for a backend round trip", async () => {
    const response = await create({ kind: "notify", enabled: true, config: {}, secrets: {} });

    expect(response.status).toBe(400);
    expect(backendRequest).not.toHaveBeenCalled();
  });

  /**
   * The widening, asserted from the side that used to be refused. A login
   * provider is a real row now, and its create carries a real `client_secret`
   * — so this is also the case that proves the credential reaches the backend
   * rather than dying in the BFF.
   */
  it("forwards a login pair to the backend", async () => {
    backendRequest.mockResolvedValue(recorded.google);

    const response = await create({ ...VALID, kind: "login", name: "google" });

    expect(response.status).toBe(200);
    expect(backendBody().kind).toBe("login");
    expect(backendBody().name).toBe("google");
  });

  /**
   * `github` is a real backend name — on an unmerged branch. Until it ships,
   * this frontend must not address a pair the deployed registry answers with a
   * 400, and it must fail here rather than after a round trip.
   */
  it("refuses a login name the deployed backend does not serve", async () => {
    const response = await create({ ...VALID, kind: "login", name: "github" });

    expect(response.status).toBe(400);
    expect(backendRequest).not.toHaveBeenCalled();
  });

  /**
   * The case that proves widening did not become "allow anything".
   *
   * `slack` IS a valid notify name and `login` IS a valid category, so only the
   * PAIR check stands between this request and a `POST` the backend refuses.
   * Found in review the first time; it keeps its job now for the opposite
   * reason — the gate is wider, so the cross-product case is the one that can
   * silently open.
   */
  it("refuses a valid transport name submitted under the login category", async () => {
    const response = await create({ ...VALID, kind: "login", name: "slack" });

    expect(response.status).toBe(400);
    expect(backendRequest).not.toHaveBeenCalled();
  });
});

/**
 * These two routes mutate admin state, so origin is checked before anything
 * else happens. Asserted because the guard is deletable without a single test
 * noticing otherwise — measured, not assumed. `integration-test-send` already
 * covers its own route this way; this carries the pattern to the siblings.
 */
describe("cross-origin requests are refused on the mutating routes", () => {
  beforeEach(() => {
    isSameOriginRequest.mockReturnValue(false);
  });

  it("refuses a cross-origin PATCH", async () => {
    const response = await item.PATCH(
      jsonRequest("https://evil.test/api/admin/integrations/notify/slack", "PATCH", { enabled: false }),
      { params: Promise.resolve({ kind: "notify", name: "slack" }) },
    );

    expect(response.status).toBe(403);
    expect(backendRequest).not.toHaveBeenCalled();
  });

  it("refuses a cross-origin toggle", async () => {
    const response = await toggle.POST(
      jsonRequest("https://evil.test/api/admin/integrations/notify/slack/toggle", "POST", {
        enabled: true,
      }),
      { params: Promise.resolve({ kind: "notify", name: "slack" }) },
    );

    expect(response.status).toBe(403);
    expect(backendRequest).not.toHaveBeenCalled();
  });

  it("refuses a cross-origin create", async () => {
    const response = await collection.POST(
      jsonRequest("https://evil.test/api/admin/integrations", "POST", {
        kind: "notify",
        name: "slack",
        enabled: true,
      }),
    );

    expect(response.status).toBe(403);
    expect(backendRequest).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/integrations/{kind}/{name} — update", () => {
  const params = (kind: string, name: string) => ({ params: Promise.resolve({ kind, name }) });

  const patch = (kind: string, name: string, body: unknown = { enabled: false }) =>
    item.PATCH(
      jsonRequest(`https://app.test/api/admin/integrations/${kind}/${name}`, "PATCH", body),
      params(kind, name),
    );

  it("addresses the row by the pair, in order", async () => {
    backendRequest.mockResolvedValue(recorded.slack);

    await patch("notify", "slack");

    // `/api/v1/integrations/notify` is a well-formed path addressing nothing,
    // which is why this asserts the whole string rather than a prefix.
    expect(backendPath()).toBe("/api/v1/integrations/notify/slack");
  });

  it("returns the row the backend answered with, name and all", async () => {
    backendRequest.mockResolvedValue(recorded.email);

    const response = await patch("notify", "email");
    const body = (await response.json()) as Integration;

    // Literals, not `recorded.email.name`: the fixture is also what the mock
    // returned, so comparing the two asserts that the mapper copies a field
    // rather than what the field holds. Same correction the list assertions
    // already took.
    expect(body.name).toBe("email");
    expect(body.kind).toBe("notify");
  });

  it("forwards a login pair to the backend", async () => {
    backendRequest.mockResolvedValue(recorded.google);

    const response = await patch("login", "google");

    expect(response.status).toBe(200);
    expect(backendRequest).toHaveBeenCalled();
  });

  /** Isolates the category guard — see the create-route case for why. */
  it("refuses a valid transport name under the login category", async () => {
    const response = await patch("login", "slack");

    expect(response.status).toBe(400);
    expect(backendRequest).not.toHaveBeenCalled();
  });

  /**
   * One message for every unroutable pair, which is a change from the two this
   * route used to give.
   *
   * The old pair of messages distinguished "bad category" from "bad system",
   * and that distinction stopped existing when the gate became a pair check:
   * `(login, google)` is now valid and `(login, slack)` is not, so neither half
   * is wrong on its own — only their combination is. Naming which half failed
   * would also tell an unauthenticated prober which categories and names the
   * registry holds, for no operator benefit: the UI only ever sends pairs it
   * rendered, so nobody reaching this from the screen can produce it.
   */
  it("answers every unroutable pair the same way, naming no half", async () => {
    const crossCategory = await patch("login", "slack");
    const unknownName = await patch("notify", "carrier-pigeon");

    for (const response of [crossCategory, unknownName]) {
      const body = (await response.json()) as { fieldErrors?: { field: string }[] };
      expect(response.status).toBe(400);
      expect(body.fieldErrors?.[0].field).toBe("name");
    }
    expect(backendRequest).not.toHaveBeenCalled();
  });

  it("keeps a backend failure a failure", async () => {
    backendRequest.mockRejectedValueOnce(new Error("nope"));

    const response = await patch("notify", "slack");

    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  /**
   * PATCH is uniform on the backend: an omitted field keeps its stored value.
   * So the route must forward only what the caller sent — defaulting an absent
   * `config` to `{}` replaces the stored config wholesale, because an explicit
   * object is a replacement, not a merge.
   *
   * This is data loss that answers 200: toggling `enabled` from the dialog would
   * erase the SMTP host and clear every secret, with no error anywhere. Same
   * shape as the bug this ticket is about, so it gets its own case rather than
   * riding on the path assertions above.
   */
  it("forwards only the fields the caller sent", async () => {
    backendRequest.mockResolvedValue(recorded.email);

    await patch("notify", "email", { enabled: false });

    const sent = backendBody();
    expect(sent.enabled).toBe(false);
    expect("config" in sent).toBe(false);
    expect("secrets" in sent).toBe(false);
  });

  it("forwards config and secrets when they ARE sent", async () => {
    backendRequest.mockResolvedValue(recorded.email);

    await patch("notify", "email", {
      config: { host: "smtp.example.com" },
      secrets: { password: "new-value" },
    });

    const sent = backendBody();
    // Non-vacuous counterpart: without this, "never forwards them" would pass.
    expect(sent.config).toEqual({ host: "smtp.example.com" });
    expect(sent.secrets).toEqual({ password: "new-value" });
    expect("enabled" in sent).toBe(false);
  });

  it("refuses a non-boolean enabled rather than forwarding it", async () => {
    const response = await patch("notify", "slack", { enabled: "yes" });

    expect(response.status).toBe(400);
    expect(backendRequest).not.toHaveBeenCalled();
  });
});

/**
 * No client calls this today — `integrationPath(ref)` without a suffix is used
 * only by the PATCH hook. It is covered anyway: an unused route is exactly the
 * one that survives the next contract move unnoticed, and AGENTS.md asks for a
 * test per BFF route rather than per reachable route.
 */
describe("GET /api/admin/integrations/{kind}/{name} — single row", () => {
  const get = (kind: string, name: string) =>
    item.GET(new Request(`https://app.test/api/admin/integrations/${kind}/${name}`), {
      params: Promise.resolve({ kind, name }),
    });

  it("addresses the row by the pair, in order", async () => {
    backendRequest.mockResolvedValue(recorded.slack);

    await get("notify", "slack");

    expect(backendPath()).toBe("/api/v1/integrations/notify/slack");
  });

  it("returns the backend's row rather than inventing one", async () => {
    backendRequest.mockResolvedValue(recorded.email);

    const body = (await (await get("notify", "email")).json()) as Integration;

    expect(body.name).toBe("email");
    expect(body.kind).toBe("notify");
  });

  it("refuses a valid transport name under the login category", async () => {
    const response = await get("login", "slack");

    expect(response.status).toBe(400);
    expect(backendRequest).not.toHaveBeenCalled();
  });

  it("keeps a backend failure a failure", async () => {
    backendRequest.mockRejectedValueOnce(new Error("backend exploded"));

    const response = await get("notify", "slack");

    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

describe("POST /api/admin/integrations/{kind}/{name}/toggle", () => {
  /**
   * `body` is passed whole rather than as an `enabled` argument with a default:
   * a default makes "omit the flag" inexpressible, since `undefined` would
   * silently become the default and the case would assert nothing.
   */
  const flip = (kind: string, name: string, body: unknown = { enabled: true }) =>
    toggle.POST(jsonRequest(`https://app.test/api/admin/integrations/${kind}/${name}/toggle`, "POST", body), {
      params: Promise.resolve({ kind, name }),
    });

  it("puts the pair in the path, not the literal segment", async () => {
    backendRequest.mockResolvedValue(recorded.slack);

    await flip("notify", "slack");

    // The old shape `/{kind}/toggle` made the backend read "toggle" as the
    // name: a 404 that presented as a switch flicking back on its own.
    expect(backendPath()).toBe("/api/v1/integrations/notify/slack/toggle");
  });

  it("requires an explicit boolean, so an omitted flag is not read as off", async () => {
    const response = await flip("notify", "slack", {});

    expect(response.status).toBe(400);
    expect(backendRequest).not.toHaveBeenCalled();
  });

  it("forwards a login pair to the backend", async () => {
    backendRequest.mockResolvedValue(recorded.google);

    const response = await flip("login", "google");

    expect(response.status).toBe(200);
    expect(backendRequest).toHaveBeenCalled();
  });

  /** Isolates the category guard — see the create-route case for why. */
  it("refuses a valid transport name under the login category", async () => {
    const response = await flip("login", "slack");

    expect(response.status).toBe(400);
    expect(backendRequest).not.toHaveBeenCalled();
  });

  /**
   * The answer must be the backend's row, not an echo of the request. Toggle
   * sits behind an optimistic update, so a route that replayed its own input
   * would make a REFUSED flip look like a successful one — the optimistic state
   * would stand instead of rolling back, and the switch would lie until the
   * next refetch.
   */
  it("returns the backend's row rather than echoing the request", async () => {
    // The backend disagrees with what was asked: enabled stays true.
    backendRequest.mockResolvedValue({ ...recorded.slack, enabled: true });

    const response = await flip("notify", "slack", { enabled: false });
    const body = (await response.json()) as Integration;

    expect(body.enabled).toBe(true);
    expect(body.name).toBe("slack");
  });

  it("keeps a backend failure a failure", async () => {
    backendRequest.mockRejectedValueOnce(new Error("backend exploded"));

    const response = await flip("notify", "slack");

    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

/**
 * DELETE — the destructive one.
 *
 * For a login provider the backend unlinks every identity bound to it in the
 * same transaction and answers 204 with no body. It never refuses over linked
 * accounts, and it reports no count: the number exists only in a server log
 * line. These assertions pin the two things the UI depends on — that a success
 * really is a 204 passthrough, and that a failure never reads as one.
 */
describe("DELETE /api/admin/integrations/[kind]/[name]", () => {
  const del = (kind: string, name: string) =>
    item.DELETE(
      new Request(`https://app.test/api/admin/integrations/${kind}/${name}`, { method: "DELETE" }),
      {
        params: Promise.resolve({ kind, name }),
      },
    );

  it("addresses the row by the pair, in order", async () => {
    backendRequest.mockResolvedValue(undefined);

    await del("login", "google");

    expect(backendPath()).toBe("/api/v1/integrations/login/google");
    expect(backendRequest.mock.calls[0][0].method).toBe("DELETE");
  });

  it("passes the 204 through with no body", async () => {
    backendRequest.mockResolvedValue(undefined);

    const response = await del("login", "google");

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("deletes a transport too", async () => {
    backendRequest.mockResolvedValue(undefined);

    const response = await del("notify", "slack");

    expect(response.status).toBe(204);
    expect(backendPath()).toBe("/api/v1/integrations/notify/slack");
  });

  /**
   * The rule this repo keeps relearning: an error must stay an error. A delete
   * that reported success on a failure would take the row off the screen while
   * the provider still signs people in.
   */
  it("keeps a backend failure a failure", async () => {
    backendRequest.mockRejectedValueOnce(new Error("backend exploded"));

    const response = await del("login", "google");

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).not.toBe(204);
  });

  it("refuses an unroutable pair without reaching the backend", async () => {
    const response = await del("login", "slack");

    expect(response.status).toBe(400);
    expect(backendRequest).not.toHaveBeenCalled();
  });

  /**
   * Origin is checked FIRST, before the session and before the pair — the same
   * order every other mutating route here uses. A destructive proxy reachable
   * from another origin is the one worth getting right.
   */
  it("refuses a cross-origin request before doing any work", async () => {
    isSameOriginRequest.mockReturnValueOnce(false);

    const response = await del("login", "google");

    expect(response.status).toBe(403);
    expect(backendRequest).not.toHaveBeenCalled();
  });
});
