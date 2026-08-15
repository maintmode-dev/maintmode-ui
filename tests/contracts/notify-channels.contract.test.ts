import { describe, expect, it, vi } from "vitest";

import { createBackendMock, readWireFixture, backendQuery } from "./_harness";

import type { ChannelsResponseDto } from "@/server/backend/contracts/maintmode-dto";

/**
 * Contract test — `GET /api/notifications/channels`. RUK-274.
 *
 * The route this covers had been discarding the backend's entire pagination
 * window: it rebuilt the response as `{ channels }` and dropped `total`,
 * `limit` and `offset` on the floor. Nothing noticed, because no test had ever
 * executed the route — every consumer test replaces `bffFetch` wholesale, which
 * verifies the request you send and never the answer you get.
 *
 * Two backend behaviours make this endpoint hostile to a client that trusts it,
 * and both are measured, not assumed:
 *
 *  1. `limit=201` does not clamp to 200 — it RESETS to 50. Asking for more than
 *     the maximum silently returns less than a valid request would, so the
 *     clamp below is the thing standing between a caller and a short page.
 *  2. An unknown parameter name answers 200 with an UNFILTERED list. So a typo
 *     in `name` does not fail loudly; it returns everything, which to a screen
 *     that renders what it receives looks like a search that matched a lot.
 *     That is why the search case asserts the literal string `name` rather than
 *     "some filter parameter was sent".
 *
 * The response is the recorded fixture (`tests/fixtures/wire/channels.json`),
 * captured with `limit=5` against a catalogue of 500 so `total` genuinely
 * exceeds the row count. A fixture whose `total` equalled its length would make
 * the passthrough assertion unfalsifiable.
 */

const wire = readWireFixture<ChannelsResponseDto>("channels.json");

const backendRequest = createBackendMock(wire);
vi.mock("@/server/backend/client/authenticated-backend-request", () => ({
  authenticatedBackendRequest: (opts: { path: string }) => backendRequest(opts),
}));

const { GET } = await import("@/app/api/notifications/channels/route");

/** Invoke the route with a raw query string and return the backend query it built. */
async function backendQueryFor(query: string): Promise<URLSearchParams> {
  await GET(new Request(`http://localhost/api/notifications/channels?${query}`));
  return backendQuery(backendRequest);
}

describe("GET /api/notifications/channels — parameter forwarding (AC-1)", () => {
  it("forwards the search as `name`, the one parameter the backend acts on", async () => {
    const query = await backendQueryFor("name=payments");

    // Measured: `search`, `q`, `query` and `filter` are all accepted with a 200
    // and an unfiltered list. Only this spelling filters anything, so only an
    // assertion on the spelling can catch the regression.
    expect(query.get("name")).toBe("payments");
  });

  it("omits `name` entirely when no search was asked for", async () => {
    const query = await backendQueryFor("");

    // Not `name=`: an empty filter is a different request from no filter, and
    // sending one would split the cache for identical rows.
    expect(query.has("name")).toBe(false);
  });

  it("treats a present-but-empty `name` as no filter at all", async () => {
    const query = await backendQueryFor("name=");

    // `?name=` is a different request from no `name` only if the route lets it
    // be. Forwarding it would ask the backend to match the empty string —
    // harmless there, but it splits the client cache for identical rows, and
    // the route is a public surface that cannot assume its callers are careful.
    // The `limit` cases below spell out the same edge; this one did not.
    expect(query.has("name")).toBe(false);
  });

  it("translates the UI's `archived` into the backend's `include_archived` (AC-6)", async () => {
    const query = await backendQueryFor("name=payments&archived=true");

    // Same word as the resources route, opposite meaning: there `archived=true`
    // selects archived rows exclusively, here it WIDENS the catalogue to include
    // them. Asserted together with `name` because the two must combine.
    expect(query.get("include_archived")).toBe("true");
    expect(query.get("name")).toBe("payments");
  });

  it("does not widen to archived channels unless asked", async () => {
    const query = await backendQueryFor("archived=false");
    expect(query.has("include_archived")).toBe(false);
  });
});

describe("GET /api/notifications/channels — limit and offset sanitisation (AC-2)", () => {
  it("clamps an over-large limit down to the maximum", async () => {
    const query = await backendQueryFor("limit=201");

    // 200, not 201. Forwarded unclamped, the backend answers 50 — fewer rows
    // than the caller would have got by asking for a legal number.
    expect(query.get("limit")).toBe("200");
  });

  it.each(["limit=abc", "limit=0", "limit=-5", "limit="])(
    "falls back to the default rather than a one-row page for `%s`",
    async (raw) => {
      const query = await backendQueryFor(raw);

      // The resources route's twin returns 1 here: `Number("")` and `Number(null)`
      // are 0, which is finite, so they slip past its isFinite guard into
      // `Math.max(1, 0)`. It survives that because both its callers always pass
      // `limit`; this route must not inherit it.
      expect(query.get("limit")).toBe("50");
    },
  );

  it("sends the default limit when the caller names none", async () => {
    const query = await backendQueryFor("");
    expect(query.get("limit")).toBe("50");
  });

  it("passes a legal limit through untouched", async () => {
    const query = await backendQueryFor("limit=20");
    expect(query.get("limit")).toBe("20");
  });

  it.each(["offset=-1", "offset=abc", "offset="])("floors `%s` at zero", async (raw) => {
    const query = await backendQueryFor(raw);
    expect(query.get("offset")).toBe("0");
  });

  it("passes a real offset through", async () => {
    const query = await backendQueryFor("offset=100");
    expect(query.get("offset")).toBe("100");
  });
});

describe("GET /api/notifications/channels — response passthrough (AC-1)", () => {
  it("carries the pagination window to the client, not just the rows", async () => {
    const response = await GET(new Request("http://localhost/api/notifications/channels"));
    const body = (await response.json()) as Record<string, unknown>;

    // Assert the literal keys and their types, NOT their values against the
    // fixture's own — an expectation read back out of the fixture it checks
    // survives every mutation of that fixture. This bites on a rename, a drop,
    // or a type change, which is what the defect actually was.
    for (const field of ["channels", "total", "limit", "offset"]) {
      expect(Object.keys(body)).toContain(field);
    }
    expect(typeof body.total).toBe("number");
    expect(typeof body.limit).toBe("number");
    expect(typeof body.offset).toBe("number");
  });

  it("keeps `total` meaning the catalogue, not the page", async () => {
    const response = await GET(new Request("http://localhost/api/notifications/channels"));
    const body = (await response.json()) as { channels: unknown[]; total: number };

    // The whole point of the window, expressed as a structural invariant rather
    // than a number: the fixture is captured with a limit far below the
    // catalogue, so any reseed keeps this true while a hardcoded 500 would break
    // on an unrelated PR. Recomputing `total` from the rows fails here.
    expect(body.total).toBeGreaterThan(body.channels.length);
  });

  it("projects rows into the domain shape the UI reads", async () => {
    const response = await GET(new Request("http://localhost/api/notifications/channels"));
    const body = (await response.json()) as { channels: Record<string, unknown>[] };

    expect(body.channels.length).toBeGreaterThan(0);
    // camelCase domain fields, not the snake_case wire ones. `transportStatus`
    // in particular drives the undeliverable warning in the maintenance form.
    for (const field of ["id", "name", "transport", "transportStatus", "transportChannelId"]) {
      expect(Object.keys(body.channels[0])).toContain(field);
    }
    expect(Object.keys(body.channels[0])).not.toContain("transport_status");
  });
});

describe("GET /api/notifications/channels — failures stay failures (AC-7)", () => {
  it("does not degrade a backend error into an empty catalogue", async () => {
    backendRequest.mockRejectedValueOnce(new Error("backend exploded"));

    const response = await GET(new Request("http://localhost/api/notifications/channels"));

    // An error rendered as `{ channels: [], total: 0 }` reads as "no channels
    // are configured" — a plausible admin state, so the operator goes and
    // creates channels that already exist.
    expect(response.status).toBeGreaterThanOrEqual(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.channels).toBeUndefined();
  });
});
