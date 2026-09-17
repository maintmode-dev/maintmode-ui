import { describe, expect, it } from "vitest";

import { NOTIFICATION_KIND_META } from "../integration-kinds";
import { buildConfig, buildDrafts, hasMissingRequired, validateUrlFields } from "../dialog-form";
import type { SecretFieldState } from "../secret-patch";

const slack = NOTIFICATION_KIND_META.slack;
const email = NOTIFICATION_KIND_META.email;

const secret = (mode: SecretFieldState["mode"], value = ""): SecretFieldState => ({ mode, value });

describe("hasMissingRequired", () => {
  it("locked required secret does not block save (stored token bypass)", () => {
    expect(hasMissingRequired(slack, {}, { bot_token: secret("locked") })).toBe(false);
  });

  it("blocks save when a required secret is in editing mode with an empty draft", () => {
    expect(hasMissingRequired(slack, {}, { bot_token: secret("editing") })).toBe(true);
    expect(hasMissingRequired(slack, {}, { bot_token: secret("editing", "  ") })).toBe(true);
  });

  it("passes when a required secret has a typed draft", () => {
    expect(hasMissingRequired(slack, {}, { bot_token: secret("new", "xoxb-1") })).toBe(false);
  });

  it("blocks create when a required config field is blank, whitespace counts as blank", () => {
    const secrets = { password: secret("new") };
    expect(hasMissingRequired(email, { host: "", from: "a@b.c" }, secrets)).toBe(true);
    expect(hasMissingRequired(email, { host: "  ", from: "a@b.c" }, secrets)).toBe(true);
    expect(hasMissingRequired(email, { host: "smtp.b.c", from: "a@b.c" }, secrets)).toBe(false);
  });

  it("cleared optional secret (email password) does not block save", () => {
    expect(
      hasMissingRequired(email, { host: "smtp.b.c", from: "a@b.c" }, { password: secret("cleared") }),
    ).toBe(false);
  });
});

describe("buildConfig", () => {
  it("omits empty-string fields entirely (absent, not empty, reaches the backend)", () => {
    expect(buildConfig(slack, { api_url: "", timeout: "10s" })).toEqual({ timeout: "10s" });
  });

  it("coerces a numeric field to a number (port '587' → 587)", () => {
    expect(buildConfig(email, { port: "587" })).toEqual({ port: 587 });
  });

  it("passes a non-numeric draft in a numeric field through as a string (server validates)", () => {
    expect(buildConfig(email, { port: "abc" })).toEqual({ port: "abc" });
  });

  it("preserves stored config keys the form does not render (wholesale-replace safety)", () => {
    const stored = { timeout: "10s", future_flag: true };
    expect(buildConfig(slack, { api_url: "", timeout: "15s" }, stored)).toEqual({
      timeout: "15s",
      future_flag: true,
    });
  });

  it("a known field emptied in the form is removed, not resurrected from stored config", () => {
    const stored = { api_url: "https://old.example", timeout: "10s" };
    expect(buildConfig(slack, { api_url: "", timeout: "10s" }, stored)).toEqual({ timeout: "10s" });
  });

  // tls_policy is an optional Select whose "unset" choice reaches buildConfig as
  // "" (the CONFIG_FIELD_UNSET sentinel is unwrapped at the ConfigField boundary
  // before it lands in config state). These lock in that unset ≠ "" on the wire.
  it("omits an unset tls_policy (Select 'Default') rather than sending an empty string", () => {
    expect(buildConfig(email, { host: "smtp.b.c", from: "a@b.c", tls_policy: "" })).toEqual({
      host: "smtp.b.c",
      from: "a@b.c",
    });
  });

  it("sends a chosen tls_policy verbatim", () => {
    expect(buildConfig(email, { tls_policy: "none" })).toEqual({ tls_policy: "none" });
  });

  it("clearing tls_policy back to Default in edit mode removes the stored value", () => {
    // The load-bearing case: a stored dangerous value ("none") must not survive
    // when the operator returns the Select to "Default (server decides)".
    expect(buildConfig(email, { tls_policy: "" }, { tls_policy: "none" })).toEqual({});
  });
});

describe("buildDrafts — hydration", () => {
  const meta = {
    label: "OpenID Connect",
    description: "",
    brand: "oidc" as const,
    statusHint: ["on", "off"] as [string, string],
    configFields: [
      { name: "issuer_url", label: "Issuer URL", optional: false },
      { name: "scopes", label: "Scopes", optional: true, list: true as const },
      { name: "port", label: "Port", optional: true, numeric: true },
    ],
    secrets: [],
  };

  /**
   * The biting case. `String(["openid","profile"])` is "openid,profile" — no
   * space — so this assertion fails against the inline `String(v)` hydration
   * that lived in the dialog before `buildDrafts` existed. That is what makes
   * it a test of this change rather than of the language.
   */
  it("joins a stored list with a comma AND a space", () => {
    const drafts = buildDrafts(meta, { scopes: ["openid", "profile"] });
    expect(drafts.scopes).toBe("openid, profile");
  });

  it("coerces a stored scalar in a list field to a one-element draft", () => {
    const drafts = buildDrafts(meta, { scopes: "openid" });
    expect(drafts.scopes).toBe("openid");
  });

  it("leaves non-list fields exactly as they hydrated before", () => {
    const drafts = buildDrafts(meta, { issuer_url: "https://idp.example.com", port: 587 });
    expect(drafts.issuer_url).toBe("https://idp.example.com");
    expect(drafts.port).toBe("587");
  });

  it("renders an absent value as an empty draft", () => {
    const drafts = buildDrafts(meta, {});
    expect(drafts.issuer_url).toBe("");
    expect(drafts.scopes).toBe("");
  });
});

describe("buildConfig — list fields", () => {
  const meta = {
    label: "OpenID Connect",
    description: "",
    brand: "oidc" as const,
    statusHint: ["on", "off"] as [string, string],
    configFields: [{ name: "scopes", label: "Scopes", optional: true, list: true as const }],
    secrets: [],
  };

  it("splits on commas and whitespace", () => {
    expect(buildConfig(meta, { scopes: "openid, profile email" })).toEqual({
      scopes: ["openid", "profile", "email"],
    });
  });

  it("drops the key entirely when the draft is empty", () => {
    expect(buildConfig(meta, { scopes: "" })).toEqual({});
  });

  it("drops empty tokens from stray separators", () => {
    expect(buildConfig(meta, { scopes: "openid,,  ,profile" })).toEqual({
      scopes: ["openid", "profile"],
    });
  });

  it("removes duplicates, preserving first-seen order", () => {
    expect(buildConfig(meta, { scopes: "openid profile openid" })).toEqual({
      scopes: ["openid", "profile"],
    });
  });

  /**
   * The scalar case bites HERE, not at hydration: a list-unaware buildConfig
   * yields the string "openid" where an array is expected.
   */
  it("emits an array even for a single token", () => {
    expect(buildConfig(meta, { scopes: "openid" })).toEqual({ scopes: ["openid"] });
  });
});

describe("validateUrlFields", () => {
  const meta = {
    label: "OpenID Connect",
    description: "",
    brand: "oidc" as const,
    statusHint: ["on", "off"] as [string, string],
    configFields: [
      { name: "issuer_url", label: "Issuer URL", optional: false, url: true as const },
      { name: "redirect_uri", label: "Redirect URI", optional: true, url: true as const },
      { name: "client_id", label: "Client ID", optional: false },
    ],
    secrets: [],
  };

  it("blocks a value that is not a URL at all", () => {
    const result = validateUrlFields(meta, { issuer_url: "not-a-url" });
    expect(result.issuer_url?.block).toBe("Enter an absolute URL, including https://");
  });

  it("blocks a relative path", () => {
    const result = validateUrlFields(meta, { issuer_url: "/auth/realms/corp" });
    expect(result.issuer_url?.block).toBeDefined();
  });

  it("warns but does not block on plain http", () => {
    const result = validateUrlFields(meta, { issuer_url: "http://keycloak.local" });
    expect(result.issuer_url?.block).toBeUndefined();
    expect(result.issuer_url?.warn).toBe("Not encrypted. Use https:// outside local development.");
  });

  it("passes a https URL clean", () => {
    expect(validateUrlFields(meta, { issuer_url: "https://idp.example.com" })).toEqual({});
  });

  it("says nothing about an empty optional field", () => {
    expect(validateUrlFields(meta, { redirect_uri: "" })).toEqual({});
  });

  // Blankness is hasMissingRequired's job; this function only judges format.
  it("does not report a blank required field as malformed", () => {
    expect(validateUrlFields(meta, { issuer_url: "" })).toEqual({});
  });

  it("ignores fields not marked as URLs", () => {
    expect(validateUrlFields(meta, { client_id: "not-a-url" })).toEqual({});
  });

  it("rejects a non-http scheme", () => {
    const result = validateUrlFields(meta, { issuer_url: "javascript:alert(1)" });
    expect(result.issuer_url?.block).toBeDefined();
  });
});

/**
 * Preset fields — supplied by the deployment's catalog, not by the operator.
 *
 * The backend refuses a create that carries one and refuses a PATCH that drops
 * or changes one, so this projection has to get both directions right. The
 * failure mode is silent: a field written by neither branch simply vanishes
 * from the body and comes back as a 400 with nothing on screen to explain it.
 */
describe("buildConfig — preset fields", () => {
  const presetMeta = {
    label: "Google",
    description: "",
    brand: "oidc",
    statusHint: ["on", "off"],
    configFields: [
      { name: "display_name", label: "Display name", optional: false, preset: true },
      { name: "issuer_url", label: "Issuer URL", optional: false, url: true, preset: true },
      { name: "client_id", label: "Client ID", optional: false },
    ],
    secrets: [],
  } as unknown as Parameters<typeof buildConfig>[0];

  const STORED = {
    display_name: "Google",
    issuer_url: "https://accounts.google.com",
    client_id: "stored-id",
  };

  it("omits every preset field on create", () => {
    const body = buildConfig(presetMeta, { client_id: "new-id" }, {}, "create");

    expect(body).toEqual({ client_id: "new-id" });
    expect(body.issuer_url).toBeUndefined();
    expect(body.display_name).toBeUndefined();
  });

  it("echoes preset fields verbatim from the stored config on patch", () => {
    const body = buildConfig(presetMeta, { client_id: "new-id" }, STORED, "patch");

    expect(body.issuer_url).toBe("https://accounts.google.com");
    expect(body.display_name).toBe("Google");
    expect(body.client_id).toBe("new-id");
  });

  /**
   * The subtle one. `config` replaces wholesale and the backend refuses a
   * DROPPED preset field exactly as it refuses a changed one — so the echo has
   * to happen even though the draft loop skips an empty draft, and even though
   * the carry-through skips the field for being `known`.
   */
  it("echoes a preset field even when its draft is empty", () => {
    const body = buildConfig(presetMeta, { client_id: "new-id", issuer_url: "" }, STORED, "patch");

    expect(body.issuer_url).toBe("https://accounts.google.com");
  });

  /** The draft is display only: an edited one must never reach the wire. */
  it("ignores an edited preset draft and sends what is stored", () => {
    const body = buildConfig(
      presetMeta,
      { client_id: "new-id", issuer_url: "https://evil.example" },
      STORED,
      "patch",
    );

    expect(body.issuer_url).toBe("https://accounts.google.com");
  });

  /** An empty echo is refused either way; a made-up one is refused for being wrong. */
  it("does not invent a preset value the stored config lacks", () => {
    const body = buildConfig(presetMeta, { client_id: "new-id" }, { client_id: "x" }, "patch");

    expect("issuer_url" in body).toBe(false);
  });
});

/**
 * `jwtverifier.allowed_hosted_domains` is nested on the wire. Only the two
 * functions that cross that boundary know it — the form's own draft state stays
 * flat and keyed by field name.
 */
describe("nested config paths", () => {
  const nestedMeta = {
    label: "Custom",
    description: "",
    brand: "oidc",
    statusHint: ["on", "off"],
    configFields: [
      { name: "client_id", label: "Client ID", optional: false },
      {
        name: "allowed_hosted_domains",
        path: ["jwtverifier", "allowed_hosted_domains"],
        label: "Allowed hosted domains",
        optional: true,
        list: true,
      },
    ],
    secrets: [],
  } as unknown as Parameters<typeof buildConfig>[0];

  it("writes the value at its nested path", () => {
    const body = buildConfig(
      nestedMeta,
      { client_id: "id", allowed_hosted_domains: "corp.example" },
      {},
      "create",
    );

    expect(body).toEqual({
      client_id: "id",
      jwtverifier: { allowed_hosted_domains: ["corp.example"] },
    });
  });

  it("hydrates a draft from the nested path", () => {
    const drafts = buildDrafts(nestedMeta, {
      client_id: "id",
      jwtverifier: { allowed_hosted_domains: ["corp.example", "eu.corp.example"] },
    });

    expect(drafts.allowed_hosted_domains).toBe("corp.example, eu.corp.example");
  });

  /**
   * The carry-through exists so a key the UI does not render survives a save.
   * A nested write that REPLACED its parent would reintroduce exactly that loss
   * one level down.
   */
  it("merges into the parent rather than replacing it", () => {
    const body = buildConfig(
      nestedMeta,
      { client_id: "id", allowed_hosted_domains: "corp.example" },
      { jwtverifier: { allowed_hosted_domains: ["old"], some_future_setting: true } },
      "patch",
    );

    expect(body.jwtverifier).toEqual({
      allowed_hosted_domains: ["corp.example"],
      some_future_setting: true,
    });
  });

  it("leaves a stored nested value alone when the draft is empty", () => {
    const body = buildConfig(
      nestedMeta,
      { client_id: "id", allowed_hosted_domains: "" },
      { jwtverifier: { some_future_setting: true } },
      "patch",
    );

    expect(body.jwtverifier).toEqual({ some_future_setting: true });
  });

  /** A list the backend has never been given comes back as null, not []. */
  it("hydrates an empty draft from a null list", () => {
    const drafts = buildDrafts(nestedMeta, { jwtverifier: { allowed_hosted_domains: null } });

    expect(drafts.allowed_hosted_domains).toBe("");
  });
});
