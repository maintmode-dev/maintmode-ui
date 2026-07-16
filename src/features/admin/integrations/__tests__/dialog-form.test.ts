import { describe, expect, it } from "vitest";

import { INTEGRATION_KIND_META } from "../integration-kinds";
import { buildConfig, hasMissingRequired } from "../dialog-form";
import type { SecretFieldState } from "../secret-patch";

const slack = INTEGRATION_KIND_META.slack;
const email = INTEGRATION_KIND_META.email;

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
