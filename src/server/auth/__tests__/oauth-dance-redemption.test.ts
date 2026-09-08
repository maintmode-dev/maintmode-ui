import { beforeEach, describe, expect, it, vi } from "vitest";

const redeemOAuthDanceCode = vi.fn();
const fetchBackendMe = vi.fn();

vi.mock("@/server/auth/backend-token-exchange", () => ({
  redeemOAuthDanceCode: (...args: unknown[]) => redeemOAuthDanceCode(...args),
  fetchBackendMe: (...args: unknown[]) => fetchBackendMe(...args),
}));

const { OAuthDanceError, runDanceRedemption } = await import("@/server/auth/oauth-dance-redemption");

const PAIR = { access_token: "at-1", refresh_token: "rt-1" };
const ME = {
  id: "user-1",
  email: "someone@example.test",
  display_name: "Someone",
  roles: ["editor"],
};

/**
 * RUK-292 — what actually establishes the session.
 *
 * Extracted from the `signIn` callback so it can be driven directly, the way
 * `built-in-sign-in.test.ts` drives its counterpart. Inline it had only
 * source-text coverage, and deleting the `maintmodeUser` assignment passed the
 * entire suite: every user would get a session with no id, no email and no
 * roles, failing at the first role gate rather than at sign-in.
 */
describe("runDanceRedemption", () => {
  beforeEach(() => {
    redeemOAuthDanceCode.mockReset();
    fetchBackendMe.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("puts the token pair and the resolved identity on the account", async () => {
    redeemOAuthDanceCode.mockResolvedValue(PAIR);
    fetchBackendMe.mockResolvedValue(ME);
    const account: Record<string, unknown> = {};

    await expect(runDanceRedemption(account, "one-time")).resolves.toBe(true);

    expect(redeemOAuthDanceCode).toHaveBeenCalledWith("one-time");
    expect(account.maintmodeTokens).toEqual(PAIR);
    // Field by field, as literals. The session's id, email and roles are what
    // every downstream gate reads; asserting the object as a whole against a
    // value built from `ME` would pass even if the mapping dropped a field.
    expect(account.maintmodeUser).toEqual({
      id: "user-1",
      email: "someone@example.test",
      displayName: "Someone",
      roles: ["editor"],
    });
  });

  it("loads the profile with the freshly redeemed access token", async () => {
    redeemOAuthDanceCode.mockResolvedValue(PAIR);
    fetchBackendMe.mockResolvedValue(ME);

    await runDanceRedemption({}, "one-time");

    expect(fetchBackendMe).toHaveBeenCalledWith("at-1");
  });

  /**
   * The two stages map to different codes on purpose. Collapsing them is the
   * defect that split `runBackendExchange` in the first place: a refused
   * redemption reported as an identity-lookup failure sends whoever is
   * debugging it to the wrong half of the flow.
   */
  it("reports a failed redemption as a handoff failure", async () => {
    redeemOAuthDanceCode.mockRejectedValue(new Error("401"));

    const error = await runDanceRedemption({}, "spent").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(OAuthDanceError);
    expect((error as InstanceType<typeof OAuthDanceError>).code).toBe("oauth_handoff_failed");
    expect(fetchBackendMe).not.toHaveBeenCalled();
  });

  it("reports a failed profile load as an identity lookup failure", async () => {
    redeemOAuthDanceCode.mockResolvedValue(PAIR);
    fetchBackendMe.mockRejectedValue(new Error("500"));

    const error = await runDanceRedemption({}, "one-time").catch((e: unknown) => e);

    expect((error as InstanceType<typeof OAuthDanceError>).code).toBe("identity_lookup_failed");
  });

  it("leaves the account untouched when either stage fails", async () => {
    redeemOAuthDanceCode.mockResolvedValue(PAIR);
    fetchBackendMe.mockRejectedValue(new Error("500"));
    const account: Record<string, unknown> = {};

    await runDanceRedemption(account, "one-time").catch(() => {});

    // A session must never be half-established: tokens without an identity is
    // exactly the state the `jwt` callback cannot enrich.
    expect(account.maintmodeUser).toBeUndefined();
    expect(account.maintmodeTokens).toBeUndefined();
  });
});
