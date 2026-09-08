import { describe, expect, it } from "vitest";

import { buildTestSendBody, shouldWarnAboutMissingSecret } from "../test-send-body";
import { INTEGRATION_KIND_META } from "../integration-kinds";
import type { SecretFieldState } from "../secret-patch";

/**
 * RUK-290 §4.2 / §4.8 — the probe body, and the three ways it deliberately
 * differs from what Save writes.
 *
 * Every rule here is invisible to the type system: `Record<string, unknown>`
 * accepts a body with the wrong secrets shape, with `username` left in, or with
 * a dropped stored key. So each case below is written to fail under one specific
 * wrong implementation rather than to describe the happy path.
 */

const meta = INTEGRATION_KIND_META.email;

/** The dialog's per-secret state, in whichever mode the case needs. */
function secretState(mode: SecretFieldState["mode"], value = ""): Record<string, SecretFieldState> {
  return { password: { mode, value } };
}

const DRAFTS = { host: "smtp.example.test", port: "587", from: "noreply@example.test", username: "u" };

describe("buildTestSendBody — which secret is sent", () => {
  it("sends a typed password verbatim", () => {
    const body = buildTestSendBody(meta, DRAFTS, secretState("new", "  hunter2  "), "a@b.test");

    // Verbatim, not trimmed: a password may legitimately end in a space, and
    // `trim()` here is only the emptiness check.
    expect(body.secrets).toEqual({ password: "  hunter2  " });
  });

  it("sends no password for a stored-but-untouched secret", () => {
    // `locked` is the default state of an already-configured integration. There
    // is no fallback: the backend never substitutes the stored value.
    const body = buildTestSendBody(meta, DRAFTS, secretState("locked"), "a@b.test");

    expect(body.secrets).toEqual({});
    expect("password" in body.secrets).toBe(false);
  });

  it("sends no password for a whitespace-only draft rather than an empty string", () => {
    // `""` is a 400 on the backend and is NOT "no password" — an empty field
    // must not quietly become an anonymous-relay test.
    const body = buildTestSendBody(meta, DRAFTS, secretState("editing", "   "), "a@b.test");

    expect(body.secrets).toEqual({});
  });

  it("sends no password when the operator cleared it", () => {
    const body = buildTestSendBody(meta, DRAFTS, secretState("cleared"), "a@b.test");

    expect(body.secrets).toEqual({});
  });
});

describe("buildTestSendBody — username travels with the password or not at all", () => {
  it("strips username when no password is sent", () => {
    // The kind validates the pair together, so a username without a password is
    // a guaranteed 400 — on the DEFAULT state of a configured integration.
    // Leaving it in makes the button fail exactly where it is most used.
    const body = buildTestSendBody(meta, DRAFTS, secretState("locked"), "a@b.test");

    expect(body.config).not.toHaveProperty("username");
    expect(body.config).toMatchObject({ host: "smtp.example.test", from: "noreply@example.test" });
  });

  it("keeps username when a password rides along with it", () => {
    const body = buildTestSendBody(meta, DRAFTS, secretState("new", "hunter2"), "a@b.test");

    expect(body.config).toMatchObject({ username: "u" });
    expect(body.secrets).toEqual({ password: "hunter2" });
  });
});

describe("buildTestSendBody — the config matches what Save would write", () => {
  it("carries through a stored key the UI does not render", () => {
    // The case that makes the three-argument `buildConfig` call meaningful.
    // `api_url` is absent from the email kind's fields, so a two-argument call
    // would silently drop it and the probe would test a different server than
    // the one Save persists — with nothing failing to say so.
    const stored = { api_url: "https://relay.internal/api", host: "old.example.test" };

    const body = buildTestSendBody(meta, DRAFTS, secretState("new", "pw"), "a@b.test", stored);

    expect(body.config).toMatchObject({ api_url: "https://relay.internal/api" });
    // …while the rendered fields still come from the drafts, not the stored row.
    expect(body.config).toMatchObject({ host: "smtp.example.test" });
  });

  it("coerces the port to a number, as the backend's struct expects", () => {
    const body = buildTestSendBody(meta, DRAFTS, secretState("new", "pw"), "a@b.test");

    expect(body.config.port).toBe(587);
  });
});

describe("buildTestSendBody — the recipient", () => {
  it("carries the address and trims it", () => {
    const body = buildTestSendBody(meta, DRAFTS, secretState("new", "pw"), "  admin@example.test ");

    expect(body.to).toBe("admin@example.test");
  });
});

describe("shouldWarnAboutMissingSecret", () => {
  it("warns for a stored-but-untouched secret", () => {
    expect(shouldWarnAboutMissingSecret(secretState("locked"))).toBe(true);
  });

  it("warns for an empty draft", () => {
    expect(shouldWarnAboutMissingSecret(secretState("new", "  "))).toBe(true);
  });

  it("stays quiet when the operator deliberately cleared the password", () => {
    // Testing an anonymous relay is a supported configuration, not a mistake.
    // Warning here would be nagging about a choice the operator just made.
    expect(shouldWarnAboutMissingSecret(secretState("cleared"))).toBe(false);
  });

  it("stays quiet when a password was typed", () => {
    expect(shouldWarnAboutMissingSecret(secretState("editing", "hunter2"))).toBe(false);
  });
});
