import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  mapIntegration,
  mapIntegrationsList,
  mustMapIntegration,
} from "@/server/backend/contracts/integrations-mapper";
import type { IntegrationDto } from "@/server/backend/contracts/integrations-dto";

const SLACK_DTO: IntegrationDto = {
  id: "11111111-1111-1111-1111-111111111111",
  kind: "notify",
  name: "slack",
  enabled: true,
  config: { api_url: "", timeout: "10s" },
  secrets_set: { bot_token: true },
  created_at: "2026-07-01T10:00:00Z",
  created_by: { id: "u1", display_name: "Ann Miller", email: "ann.miller@gmail.com" },
  updated_at: "2026-07-02T14:21:00Z",
  updated_by: null,
};

/** A login row: same envelope, plus the `health` the backend sends only here. */
const GOOGLE_DTO: IntegrationDto = {
  id: "22222222-2222-2222-2222-222222222222",
  kind: "login",
  name: "google",
  enabled: true,
  config: { display_name: "Google" },
  secrets_set: { client_secret: true },
  health: "ok",
  created_at: "2026-07-01T10:00:00Z",
  updated_at: "2026-07-01T10:00:00Z",
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("mapIntegration", () => {
  it("maps a full masked integration, carrying both halves of the pair", () => {
    expect(mapIntegration(SLACK_DTO)).toEqual({
      id: SLACK_DTO.id,
      kind: "notify",
      name: "slack",
      enabled: true,
      config: { api_url: "", timeout: "10s" },
      secrets_set: { bot_token: true },
      health: undefined,
      created_at: "2026-07-01T10:00:00Z",
      created_by: "Ann Miller",
      updated_at: "2026-07-02T14:21:00Z",
      updated_by: undefined,
    });
  });

  /**
   * THE REGRESSION. Before RUK-304 the predicate tested `kind` against system
   * names, so every row the post-`b74a4536` backend sent was dropped — silently,
   * on a 200. The screen then rendered its static list and told an administrator
   * with working integrations that nothing was configured.
   */
  it("keeps a notify row instead of dropping it for its category", () => {
    expect(mapIntegration(SLACK_DTO)).not.toBeNull();
    expect(mapIntegration({ ...SLACK_DTO, name: "telegram" })).not.toBeNull();
    expect(mapIntegration({ ...SLACK_DTO, name: "email" })).not.toBeNull();
  });

  it("keeps a login row and carries its health", () => {
    const result = mapIntegration(GOOGLE_DTO);
    expect(result?.kind).toBe("login");
    expect(result?.name).toBe("google");
    expect(result?.health).toBe("ok");
  });

  /**
   * Absence is "not applicable", never "ok": notify rows carry no health at all,
   * and defaulting it would report an inapplicable field as a healthy one.
   */
  it("leaves health undefined when the wire omits it", () => {
    expect(mapIntegration(SLACK_DTO)?.health).toBeUndefined();
  });

  it("drops an unrecognised health rather than passing it through", () => {
    const result = mapIntegration({ ...GOOGLE_DTO, health: "expired" });
    expect(result).not.toBeNull();
    expect(result?.health).toBeUndefined();
  });

  it("logs an unrecognised health so the next contract move is not silent", () => {
    mapIntegration({ ...GOOGLE_DTO, health: "expired" });
    expect(console.error).toHaveBeenCalledWith(
      "[integrations-mapper] unrecognised health",
      expect.objectContaining({ kind: "login", name: "google", health: "expired" }),
    );
  });

  it("carries every health value the backend defines", () => {
    for (const health of ["ok", "unresolved", "disabled", "unreadable"] as const) {
      expect(mapIntegration({ ...GOOGLE_DTO, health })?.health).toBe(health);
    }
  });

  it("drops an unknown CATEGORY (the two categories are a closed set)", () => {
    expect(mapIntegration({ ...SLACK_DTO, kind: "billing" })).toBeNull();
    expect(mapIntegration({ ...SLACK_DTO, kind: undefined })).toBeNull();
  });

  /** The drop that remains must announce itself — §2.1. */
  it("logs a dropped row with both halves of the pair", () => {
    mapIntegration({ ...SLACK_DTO, kind: "billing" });
    expect(console.error).toHaveBeenCalledWith(
      "[integrations-mapper] dropped a row with an unknown category",
      expect.objectContaining({ kind: "billing", name: "slack" }),
    );
  });

  it("normalizes null config and secrets_set to empty objects", () => {
    const result = mapIntegration({ ...SLACK_DTO, config: null, secrets_set: null });
    expect(result?.config).toEqual({});
    expect(result?.secrets_set).toEqual({});
  });

  it("falls back an empty author display_name to Unknown user (shared mapUserSummary)", () => {
    const result = mapIntegration({
      ...SLACK_DTO,
      created_by: { id: "u2", email: "no.name@gmail.com" },
    });
    expect(result?.created_by).toBe("Unknown user");
  });

  it("defaults enabled/name/timestamps/authorship when the wire omits them", () => {
    expect(mapIntegration({ id: "x", kind: "notify" })).toEqual({
      id: "x",
      kind: "notify",
      name: "",
      enabled: false,
      config: {},
      secrets_set: {},
      health: undefined,
      created_at: "",
      created_by: undefined,
      updated_at: "",
      updated_by: undefined,
    });
  });

  it("never carries secret values — only boolean flags survive the read path", () => {
    expect(Object.values(mapIntegration(SLACK_DTO)?.secrets_set ?? {})).toEqual([true]);
  });
});

describe("mapIntegrationsList", () => {
  /** What the ticket reproduced: three configured rows in, three rows out. */
  it("maps a mixed list of notify and login rows without dropping any", () => {
    const result = mapIntegrationsList({
      integrations: [SLACK_DTO, { ...SLACK_DTO, id: "e", name: "email" }, GOOGLE_DTO],
    });
    expect(result).toHaveLength(3);
    expect(result.map((i) => i.name)).toEqual(["slack", "email", "google"]);
    expect(result.map((i) => i.health)).toEqual([undefined, undefined, "ok"]);
  });

  it("filters only rows whose category is unknown", () => {
    const result = mapIntegrationsList({
      integrations: [SLACK_DTO, { ...SLACK_DTO, id: "x", kind: "webhook" }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("slack");
  });

  it("returns [] for a missing list", () => {
    expect(mapIntegrationsList({})).toEqual([]);
    expect(mapIntegrationsList({ integrations: null })).toEqual([]);
  });
});

describe("mustMapIntegration", () => {
  it("returns the row for a well-formed response", () => {
    expect(mustMapIntegration(SLACK_DTO).name).toBe("slack");
  });

  /**
   * The route already gated the request, so an unmappable answer is a broken
   * backend invariant rather than a client error: throwing surfaces it as a 500
   * instead of a 200 carrying `null`.
   */
  it("throws when the backend answers a validated request with an unknown category", () => {
    expect(() => mustMapIntegration({ ...SLACK_DTO, kind: "billing" })).toThrow(/billing/);
  });
});
