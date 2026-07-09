import { describe, expect, it } from "vitest";

import { buildSecretsCreate, buildSecretsPatch } from "../secret-patch";

describe("buildSecretsPatch", () => {
  it("omits locked secrets so the stored value is kept", () => {
    expect(buildSecretsPatch({ bot_token: { mode: "locked", value: "" } })).toEqual({});
  });

  it("sends a replacement when a new value was typed", () => {
    expect(buildSecretsPatch({ bot_token: { mode: "editing", value: "xoxb-new" } })).toEqual({
      bot_token: "xoxb-new",
    });
  });

  it("omits an editing secret with an empty draft (nothing to replace with)", () => {
    expect(buildSecretsPatch({ bot_token: { mode: "editing", value: "  " } })).toEqual({});
  });

  it("sends explicit null for cleared secrets", () => {
    expect(buildSecretsPatch({ password: { mode: "cleared", value: "" } })).toEqual({
      password: null,
    });
  });

  it("cleared wins over any stale draft value", () => {
    expect(buildSecretsPatch({ password: { mode: "cleared", value: "stale" } })).toEqual({
      password: null,
    });
  });

  it("omits a never-set secret in new mode with an empty draft (edit of a kind whose secret was never stored)", () => {
    expect(buildSecretsPatch({ password: { mode: "new", value: "" } })).toEqual({});
  });

  it("sends the replacement value verbatim — trim is only the emptiness check", () => {
    expect(buildSecretsPatch({ bot_token: { mode: "editing", value: " xoxb-padded " } })).toEqual({
      bot_token: " xoxb-padded ",
    });
  });

  it("handles mixed states per key independently", () => {
    expect(
      buildSecretsPatch({
        bot_token: { mode: "locked", value: "" },
        password: { mode: "new", value: "hunter2" },
        api_key: { mode: "cleared", value: "" },
      }),
    ).toEqual({ password: "hunter2", api_key: null });
  });
});

describe("buildSecretsCreate", () => {
  it("sends only non-empty drafts", () => {
    expect(
      buildSecretsCreate({
        bot_token: { mode: "new", value: "xoxb-1" },
        password: { mode: "new", value: "" },
      }),
    ).toEqual({ bot_token: "xoxb-1" });
  });
});
