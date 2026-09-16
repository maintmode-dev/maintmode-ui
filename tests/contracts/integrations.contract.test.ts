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

/** Seed the list envelope for the collection GET. */
function backendReturnsList() {
  backendRequest.mockResolvedValue(wire);
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

describe("GET /api/admin/integrations — the list that lied", () => {
  it("passes every recorded row through instead of dropping it", async () => {
    backendReturnsList();
    const response = await collection.GET();
    const body = (await response.json()) as { integrations: Integration[] };

    // The regression, stated as a count. Before the fix this was 0 — on a 200,
    // with no error anywhere for the screen to notice.
    expect(body.integrations).toHaveLength(wire.integrations?.length ?? 0);
    expect(body.integrations.length).toBeGreaterThan(0);
  });

  it("carries both halves of the pair for every row", async () => {
    backendReturnsList();
    const response = await collection.GET();
    const body = (await response.json()) as { integrations: Integration[] };

    // Read off the FIXTURE, not retyped: an expectation copied from the same
    // file it checks survives any mutation of that file and proves nothing.
    for (const row of body.integrations) {
      const source = recorded[row.name];
      expect(source).toBeDefined();
      expect(row.kind).toBe(source.kind);
      expect(row.name).toBe(source.name);
    }
  });

  it("carries health for the login row and omits it for the transports", async () => {
    backendReturnsList();
    const response = await collection.GET();
    const body = (await response.json()) as { integrations: Integration[] };

    for (const row of body.integrations) {
      // `undefined` for a notify row means NOT APPLICABLE. A mapper writing
      // `?? "ok"` here would report an inapplicable field as a healthy one.
      expect(row.health).toBe(recorded[row.name].health);
    }
    expect(body.integrations.some((r) => r.health !== undefined)).toBe(true);
    expect(body.integrations.some((r) => r.health === undefined)).toBe(true);
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
    collection.POST(
      new Request("https://app.test/api/admin/integrations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

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
});

describe("PATCH /api/admin/integrations/{kind}/{name} — update", () => {
  const params = (kind: string, name: string) => ({ params: Promise.resolve({ kind, name }) });

  const patch = (kind: string, name: string, body: unknown = { enabled: false }) =>
    item.PATCH(
      new Request(`https://app.test/api/admin/integrations/${kind}/${name}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
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
    toggle.POST(
      new Request(`https://app.test/api/admin/integrations/${kind}/${name}/toggle`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ kind, name }) },
    );

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
});
