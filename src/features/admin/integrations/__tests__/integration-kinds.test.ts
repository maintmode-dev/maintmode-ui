import { describe, expect, it } from "vitest";

import { LOGIN_INTEGRATION_NAMES, NOTIFICATION_INTEGRATION_NAMES } from "@/domain/admin/integration";

import { kindMeta, type ConfigFieldMeta } from "../integration-kinds";

/**
 * Everything `kindMeta` must resolve. Both halves now come from domain
 * constants: the login names are the backend registry's own, so a union of the
 * two reads as the contract it actually is. (It did not before — the auth half
 * was `oidc`/`github_oauth`, which named nothing.)
 */
const ALL_META_KEYS = [...NOTIFICATION_INTEGRATION_NAMES, ...LOGIN_INTEGRATION_NAMES] as const;

const INTEGRATION_KIND_META = Object.fromEntries(ALL_META_KEYS.map((k) => [k, kindMeta(k)])) as Record<
  (typeof ALL_META_KEYS)[number],
  NonNullable<ReturnType<typeof kindMeta>>
>;

/**
 * Field names are asserted as LITERALS on purpose: they mirror
 * `internal/integrationkinds/oidc.go` on the backend's `main`. When the backend
 * renames one, this test is what fails. Reading the names back out of the
 * metadata would survive any rename and prove nothing.
 */
describe("INTEGRATION_KIND_META", () => {
  it("covers every system the UI renders", () => {
    for (const key of ALL_META_KEYS) {
      expect(INTEGRATION_KIND_META[key]).toBeDefined();
    }
  });

  it("gives every system a brand mark", () => {
    for (const key of ALL_META_KEYS) {
      expect(INTEGRATION_KIND_META[key].brand).toBeTruthy();
    }
  });

  /**
   * The registry is keyed by SYSTEM. A category resolving to metadata would mean
   * a row could be rendered from one, and `kindMeta` returning null is what makes
   * that a visibly empty row instead of a plausible wrong one.
   */
  it("resolves nothing for a category", () => {
    expect(kindMeta("notify")).toBeNull();
    expect(kindMeta("login")).toBeNull();
  });

  describe("custom — the operator owns every field", () => {
    const meta = INTEGRATION_KIND_META.custom;

    it("declares exactly the fields the backend's OIDC settings name", () => {
      expect(meta.configFields.map((f: ConfigFieldMeta) => f.name)).toEqual([
        "display_name",
        "issuer_url",
        "client_id",
        "redirect_uri",
        "scopes",
        "allowed_hosted_domains",
      ]);
    });

    /**
     * `redirect_uri` among them is the correction this change carries: the
     * previous descriptor called it optional and offered a default callback
     * that does not exist. The backend requires it.
     */
    it("requires everything but scopes and the hosted domains", () => {
      const required = meta.configFields
        .filter((f: ConfigFieldMeta) => !f.optional)
        .map((f: ConfigFieldMeta) => f.name);
      expect(required).toEqual(["display_name", "issuer_url", "client_id", "redirect_uri"]);
    });

    it("owns no preset fields — nothing here is deployment-supplied", () => {
      expect(meta.configFields.filter((f: ConfigFieldMeta) => f.preset)).toEqual([]);
    });

    /**
     * Only `issuer_url` carries the backend's HTTPSURL rule. `redirect_uri`
     * carries `is.URL` alone, so `http://localhost:3000/cb` is valid there and
     * blocking it would refuse a save the backend accepts.
     */
    it("blocks http only on issuer_url", () => {
      const httpsOnly = meta.configFields
        .filter((f: ConfigFieldMeta) => f.httpsOnly)
        .map((f: ConfigFieldMeta) => f.name);
      expect(httpsOnly).toEqual(["issuer_url"]);
    });

    it("addresses the hosted domains at their nested wire path", () => {
      const field = meta.configFields.find((f: ConfigFieldMeta) => f.name === "allowed_hosted_domains");
      expect(field?.path).toEqual(["jwtverifier", "allowed_hosted_domains"]);
    });

    it("binds the secret to both fields that invalidate it", () => {
      expect(meta.secrets[0].rebindsOn).toEqual(["issuer_url", "client_id"]);
    });
  });

  describe("google — the deployment owns two fields", () => {
    const meta = INTEGRATION_KIND_META.google;

    it("marks exactly issuer_url and display_name as preset-owned", () => {
      const preset = meta.configFields
        .filter((f: ConfigFieldMeta) => f.preset)
        .map((f: ConfigFieldMeta) => f.name);
      expect(preset).toEqual(["display_name", "issuer_url"]);
    });

    /**
     * The issuer is preset-owned and therefore never editable, so naming it
     * here would demand a re-typed secret for a field the operator cannot
     * change. Only `client_id` can trigger a rebind.
     */
    it("binds the secret to client_id alone", () => {
      expect(meta.secrets[0].rebindsOn).toEqual(["client_id"]);
    });
  });

  it("takes client_secret as a required, non-clearable secret on both", () => {
    for (const name of LOGIN_INTEGRATION_NAMES) {
      const secrets = INTEGRATION_KIND_META[name].secrets;
      expect(secrets.map((s: { key: string }) => s.key)).toEqual(["client_secret"]);
      expect(secrets[0].required).toBe(true);
      expect(secrets[0].clearable).toBe(false);
    }
  });

  it("describes the login kinds as sign-in providers, not transports", () => {
    for (const name of LOGIN_INTEGRATION_NAMES) {
      expect(INTEGRATION_KIND_META[name].description).not.toMatch(/notification|transport/i);
    }
  });
});
