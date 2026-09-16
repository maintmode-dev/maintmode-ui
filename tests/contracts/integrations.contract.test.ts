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

  it("rejects a missing name here rather than paying for a backend round trip", async () => {
    const response = await create({ kind: "notify", enabled: true, config: {}, secrets: {} });

    expect(response.status).toBe(400);
    expect(backendRequest).not.toHaveBeenCalled();
  });

  /**
   * The whitelist is a security control, not tidiness: this BFF proxies no
   * login routes, so a request for one must die here rather than carry a typed
   * client_secret toward a path that does not exist.
   */
  it("refuses the login category before touching the backend", async () => {
    const response = await create({ ...VALID, kind: "login", name: "google" });

    expect(response.status).toBe(400);
    expect(backendRequest).not.toHaveBeenCalled();
  });

  /**
   * The case that isolates the CATEGORY guard.
   *
   * `(login, google)` above is refused by either half — `google` is not a
   * notify name — so it cannot tell which guard fired. `slack` IS a valid
   * notify name, so only the category check stands between this request and
   * `POST` with `kind: "login"`. Found in review: deleting that check left
   * every other case green.
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

    expect(body.name).toBe(recorded.email.name);
    expect(body.kind).toBe(recorded.email.kind);
  });

  it("refuses a login pair without reaching the backend", async () => {
    const response = await patch("login", "google");

    expect(response.status).toBe(400);
    expect(backendRequest).not.toHaveBeenCalled();
  });

  /** Isolates the category guard — see the create-route case for why. */
  it("refuses a valid transport name under the login category", async () => {
    const response = await patch("login", "slack");

    expect(response.status).toBe(400);
    expect(backendRequest).not.toHaveBeenCalled();
  });

  /**
   * The two guards keep separate messages (SPEC §3.3): "not a routable
   * category" and "not a routable system" are different facts, and collapsing
   * them tells an operator the wrong one. Asserted on the field, which is what
   * distinguishes them in the envelope.
   */
  it("distinguishes a bad category from a bad system", async () => {
    const badCategory = await patch("login", "google");
    const badName = await patch("notify", "carrier-pigeon");

    const categoryBody = (await badCategory.json()) as { fieldErrors?: { field: string }[] };
    const nameBody = (await badName.json()) as { fieldErrors?: { field: string }[] };

    expect(categoryBody.fieldErrors?.[0].field).toBe("kind");
    expect(nameBody.fieldErrors?.[0].field).toBe("name");
  });

  it("keeps a backend failure a failure", async () => {
    backendRequest.mockRejectedValueOnce(new Error("nope"));

    const response = await patch("notify", "slack");

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

  it("refuses a login pair without reaching the backend", async () => {
    const response = await flip("login", "google");

    expect(response.status).toBe(400);
    expect(backendRequest).not.toHaveBeenCalled();
  });

  /** Isolates the category guard — see the create-route case for why. */
  it("refuses a valid transport name under the login category", async () => {
    const response = await flip("login", "slack");

    expect(response.status).toBe(400);
    expect(backendRequest).not.toHaveBeenCalled();
  });
});
