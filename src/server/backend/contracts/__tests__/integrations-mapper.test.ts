import { describe, expect, it } from "vitest";

import { mapIntegration, mapIntegrationsList } from "@/server/backend/contracts/integrations-mapper";
import type { IntegrationDto } from "@/server/backend/contracts/integrations-dto";

const SLACK_DTO: IntegrationDto = {
  id: "11111111-1111-1111-1111-111111111111",
  kind: "slack",
  enabled: true,
  config: { api_url: "", timeout: "10s" },
  secrets_set: { bot_token: true },
  created_at: "2026-07-01T10:00:00Z",
  created_by: { id: "u1", display_name: "Ann Miller", email: "ann.miller@gmail.com" },
  updated_at: "2026-07-02T14:21:00Z",
  updated_by: null,
};

describe("mapIntegration", () => {
  it("maps a full masked integration", () => {
    const result = mapIntegration(SLACK_DTO);
    expect(result).toEqual({
      id: SLACK_DTO.id,
      kind: "slack",
      enabled: true,
      config: { api_url: "", timeout: "10s" },
      secrets_set: { bot_token: true },
      created_at: "2026-07-01T10:00:00Z",
      created_by: "Ann Miller",
      updated_at: "2026-07-02T14:21:00Z",
      updated_by: undefined,
    });
  });

  it("drops unknown kinds (registry is a closed set)", () => {
    expect(mapIntegration({ ...SLACK_DTO, kind: "pagerduty" })).toBeNull();
    expect(mapIntegration({ ...SLACK_DTO, kind: undefined })).toBeNull();
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

  it("defaults enabled/timestamps/authorship when the wire omits them", () => {
    const result = mapIntegration({ id: "x", kind: "slack" });
    expect(result).toEqual({
      id: "x",
      kind: "slack",
      enabled: false,
      config: {},
      secrets_set: {},
      created_at: "",
      created_by: undefined,
      updated_at: "",
      updated_by: undefined,
    });
  });

  it("never carries secret values — only boolean flags survive the read path", () => {
    const result = mapIntegration(SLACK_DTO);
    expect(Object.values(result?.secrets_set ?? {})).toEqual([true]);
  });
});

describe("mapIntegrationsList", () => {
  it("maps the envelope and filters unknown kinds", () => {
    const result = mapIntegrationsList({
      integrations: [SLACK_DTO, { ...SLACK_DTO, id: "x", kind: "webhook" }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("slack");
  });

  it("returns [] for a missing list", () => {
    expect(mapIntegrationsList({})).toEqual([]);
    expect(mapIntegrationsList({ integrations: null })).toEqual([]);
  });
});
