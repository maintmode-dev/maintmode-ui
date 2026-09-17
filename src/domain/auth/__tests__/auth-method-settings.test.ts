import { describe, expect, it } from "vitest";

import {
  AUTH_METHODS,
  authMethodLabel,
  authMethodNote,
  isKnownAuthMethod,
} from "../auth-method-settings";

/**
 * RUK-297, SPEC §3.1/§3.2. The closed set and its labels.
 *
 * The labels are the load-bearing part: `GET /api/v1/auth/settings` sends no
 * `display_name`, so a method whose label is missing here renders as a bare
 * identifier on an admin screen about who can sign in.
 */
describe("the closed set of built-in sign-in methods", () => {
  it("is exactly the two the backend seeds", () => {
    // Literal, not derived from the module: a test that reads the set back out
    // of the set it is checking passes under every mutation of it.
    expect([...AUTH_METHODS]).toEqual(["email_otp", "email_password"]);
  });

  it("recognises a method this build knows", () => {
    expect(isKnownAuthMethod("email_otp")).toBe(true);
  });

  it("does not recognise a method this build has never heard of", () => {
    expect(isKnownAuthMethod("webauthn")).toBe(false);
  });
});

describe("labels", () => {
  it("gives every method in the closed set a human label", () => {
    for (const method of AUTH_METHODS) {
      const label = authMethodLabel(method);
      expect(label).toBeTruthy();
      // The label must be a label, not the identifier wearing one.
      expect(label).not.toBe(method);
    }
  });

  /**
   * SPEC §3.1: an unknown method is rendered, not dropped — it is a sign-in
   * path already in force, and hiding it hides it from the person responsible
   * for it. Falling back to the raw name is what makes that possible.
   */
  it("falls back to the raw name for a method it does not know", () => {
    expect(authMethodLabel("webauthn")).toBe("webauthn");
  });
});

describe("the email_otp note", () => {
  /**
   * SPEC §0.5.1 / §4.4, from the backend's own security audit: disabling
   * `email_otp` stops it as a SIGN-IN method, but password-reset codes keep
   * going to the same mailbox through the same issuer. An admin will not guess
   * that, so the row has to say it.
   */
  it("warns that password-reset codes keep being sent", () => {
    const note = authMethodNote("email_otp");

    expect(note).toBeTruthy();
    expect(note?.toLowerCase()).toContain("reset");
  });

  it("says nothing extra about the password method", () => {
    expect(authMethodNote("email_password")).toBeUndefined();
  });

  it("says nothing about a method it does not know", () => {
    expect(authMethodNote("webauthn")).toBeUndefined();
  });
});
