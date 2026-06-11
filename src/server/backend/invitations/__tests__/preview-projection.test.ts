import { describe, expect, it } from "vitest";

import { projectInvitationPreview } from "../preview-projection";

describe("projectInvitationPreview", () => {
  it("surfaces only status + suggested_provider for a valid invite", () => {
    expect(projectInvitationPreview({ status: "valid", suggested_provider: "google" })).toEqual({
      status: "valid",
      suggested_provider: "google",
    });
  });

  it("strips any extra fields the backend might add (no PII leak)", () => {
    const result = projectInvitationPreview({
      status: "valid",
      suggested_provider: "google",
      email: "victim@corp.test",
      roles: ["admin"],
      inviter: { id: "u-1", email: "boss@corp.test", display_name: "Boss" },
    });

    expect(result).toEqual({ status: "valid", suggested_provider: "google" });
    expect(result).not.toHaveProperty("email");
    expect(result).not.toHaveProperty("roles");
    expect(result).not.toHaveProperty("inviter");
  });

  it.each(["valid", "invalid", "expired", "accepted", "revoked"])(
    "passes through the known status %s",
    (status) => {
      expect(projectInvitationPreview({ status }).status).toBe(status);
    },
  );

  it("defaults an unknown status to invalid", () => {
    expect(projectInvitationPreview({ status: "totally-made-up" }).status).toBe("invalid");
  });

  it("defaults a missing/non-string status to invalid", () => {
    expect(projectInvitationPreview({}).status).toBe("invalid");
    expect(projectInvitationPreview({ status: 42 }).status).toBe("invalid");
    expect(projectInvitationPreview(null).status).toBe("invalid");
    expect(projectInvitationPreview(undefined).status).toBe("invalid");
  });

  it("omits suggested_provider when the backend returns null/absent", () => {
    expect(projectInvitationPreview({ status: "valid", suggested_provider: null })).toEqual({
      status: "valid",
      suggested_provider: undefined,
    });
    expect(projectInvitationPreview({ status: "valid" }).suggested_provider).toBeUndefined();
  });
});
