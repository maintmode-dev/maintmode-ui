import { describe, expect, it } from "vitest";

import { AUTH_INTEGRATION_KINDS, INTEGRATION_KINDS } from "@/domain/admin/integration";

import { INTEGRATION_KIND_META } from "../integration-kinds";

/**
 * Field names are asserted as literals on purpose: they mirror the backend's
 * OIDC config (`internal/config/oidc_provider.go`) and are an ASSUMPTION, not a
 * contract — the backend's `oidc` kind does not exist yet. When it lands and a
 * name differs, this test is what fails, which is the point. Reading the names
 * back out of the metadata would survive any rename and prove nothing.
 */
describe("INTEGRATION_KIND_META", () => {
  it("covers every kind in the union", () => {
    for (const kind of INTEGRATION_KINDS) {
      expect(INTEGRATION_KIND_META[kind]).toBeDefined();
    }
  });

  it("gives every kind a brand mark", () => {
    for (const kind of INTEGRATION_KINDS) {
      expect(INTEGRATION_KIND_META[kind].brand).toBeTruthy();
    }
  });

  describe("oidc", () => {
    const meta = INTEGRATION_KIND_META.oidc;

    it("declares exactly the fields the backend's file config names", () => {
      expect(meta.configFields.map((f) => f.name)).toEqual([
        "display_name",
        "issuer_url",
        "client_id",
        "redirect_uri",
        "scopes",
      ]);
    });

    it("requires display_name, issuer_url and client_id", () => {
      const required = meta.configFields.filter((f) => !f.optional).map((f) => f.name);
      expect(required).toEqual(["display_name", "issuer_url", "client_id"]);
    });

    it("validates issuer_url and redirect_uri as URLs", () => {
      const urlFields = meta.configFields.filter((f) => f.url).map((f) => f.name);
      expect(urlFields).toEqual(["issuer_url", "redirect_uri"]);
    });

    it("edits scopes as a list", () => {
      expect(meta.configFields.find((f) => f.name === "scopes")?.list).toBe(true);
    });

    it("warns that clearing scopes hands the choice to the server", () => {
      const scopes = meta.configFields.find((f) => f.name === "scopes");
      expect(scopes?.help).toContain("server");
    });

    it("takes client_secret as a required, non-clearable secret", () => {
      expect(meta.secrets).toHaveLength(1);
      expect(meta.secrets[0].key).toBe("client_secret");
      expect(meta.secrets[0].required).toBe(true);
      expect(meta.secrets[0].clearable).toBe(false);
    });
  });

  describe("github_oauth", () => {
    const meta = INTEGRATION_KIND_META.github_oauth;

    it("takes client_id and optional display_name and scopes — no issuer", () => {
      expect(meta.configFields.map((f) => f.name)).toEqual(["display_name", "client_id", "scopes"]);
      expect(meta.configFields.find((f) => f.name === "display_name")?.optional).toBe(true);
      expect(meta.configFields.find((f) => f.name === "client_id")?.optional).toBe(false);
    });

    it("says it is not active yet, so an admin filling it in is not misled", () => {
      expect(meta.description).toMatch(/not.*(active|implemented|available)/i);
    });

    it("takes client_secret as a required secret", () => {
      expect(meta.secrets.map((s) => s.key)).toEqual(["client_secret"]);
      expect(meta.secrets[0].required).toBe(true);
    });
  });

  it("describes the auth kinds as sign-in providers, not transports", () => {
    for (const kind of AUTH_INTEGRATION_KINDS) {
      expect(INTEGRATION_KIND_META[kind].description).not.toMatch(/notification|transport/i);
    }
  });
});
