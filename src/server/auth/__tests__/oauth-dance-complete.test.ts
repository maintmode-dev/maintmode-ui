import { beforeEach, describe, expect, it, vi } from "vitest";

const readOAuthNext = vi.fn();
const clearOAuthNext = vi.fn();
const signIn = vi.fn();
const redirect = vi.fn((url: string) => {
  const error = new Error(`redirect:${url}`) as Error & { digest: string };
  error.digest = `NEXT_REDIRECT;replace;${url};307;`;
  throw error;
});

vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));
vi.mock("@/server/auth/oauth-next-cookie", () => ({
  readOAuthNext: () => readOAuthNext(),
  clearOAuthNext: () => clearOAuthNext(),
  setOAuthNext: vi.fn(),
}));
vi.mock("@/server/auth/auth-config", () => ({ signIn: (...args: unknown[]) => signIn(...args) }));

const { completeOAuthDanceAction } = await import("@/server/auth/oauth-dance-actions");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

/** Captures where the action sent the browser, or "" if it did not redirect. */
async function landsOn(data: FormData): Promise<string> {
  try {
    await completeOAuthDanceAction(data);
  } catch (error) {
    const message = String((error as Error).message);
    return message.startsWith("redirect:") ? message.slice("redirect:".length) : `THROWN:${message}`;
  }
  return "";
}

/**
 * RUK-292 — the receiver action.
 *
 * The cases here are the ones where a wrong answer is invisible: a code that is
 * spent before it is used, a destination that survives into somebody else's
 * sign-in, and the success path, which arrives as a thrown redirect and must not
 * be mistaken for a failure.
 */
describe("completeOAuthDanceAction", () => {
  beforeEach(() => {
    readOAuthNext.mockReset().mockResolvedValue("/");
    clearOAuthNext.mockReset();
    signIn.mockReset();
    redirect.mockClear();
  });

  it.each([
    ["access_denied", "/login?code=signup_disabled"],
    ["state_invalid", "/login?code=oauth_handoff_failed"],
    ["provider_error", "/login?code=oauth_handoff_failed"],
    ["internal_error", "/login?code=oauth_handoff_failed"],
    ["something_new_from_a_later_backend", "/login?code=oauth_handoff_failed"],
  ])("maps the backend error %s", async (error, expected) => {
    expect(await landsOn(form({ error }))).toBe(expected);
    expect(signIn).not.toHaveBeenCalled();
  });

  it("does not attempt a redemption when the backend reported an error", async () => {
    await landsOn(form({ error: "access_denied", code: "still-here" }));

    expect(signIn).not.toHaveBeenCalled();
  });

  it("fails cleanly when the receiver is opened with neither parameter", async () => {
    expect(await landsOn(form({}))).toBe("/login?code=oauth_handoff_failed");
  });

  it("redeems the code with the stored destination", async () => {
    readOAuthNext.mockResolvedValue("/calendar?view=week");
    signIn.mockImplementation(() => {
      const error = new Error("ok") as Error & { digest: string };
      error.digest = "NEXT_REDIRECT;replace;/calendar?view=week;307;";
      throw error;
    });

    const outcome = await landsOn(form({ code: "one-time" }));

    expect(signIn).toHaveBeenCalledWith("oauth-dance", {
      code: "one-time",
      redirectTo: "/calendar?view=week",
    });
    // The success path is a THROWN redirect that must pass through untouched;
    // swallowing it would turn a completed sign-in into an error page.
    expect(outcome).toBe("THROWN:ok");
  });

  it("falls back to / when no destination was stored", async () => {
    readOAuthNext.mockResolvedValue("/");
    signIn.mockResolvedValue(undefined);

    await landsOn(form({ code: "one-time" }));

    expect(signIn).toHaveBeenCalledWith("oauth-dance", { code: "one-time", redirectTo: "/" });
  });

  /**
   * Cleared before any branch can return, so no exit path can leave it behind to
   * steer an unrelated later sign-in.
   */
  it.each([
    ["an error redirect", { error: "state_invalid" }],
    ["a missing code", {}],
    ["a redemption", { code: "one-time" }],
  ])("clears the destination cookie on %s", async (_case, fields) => {
    signIn.mockResolvedValue(undefined);

    await landsOn(form(fields));

    expect(clearOAuthNext).toHaveBeenCalledTimes(1);
  });

  it("clears the cookie before redeeming, not after", async () => {
    signIn.mockResolvedValue(undefined);

    await landsOn(form({ code: "one-time" }));

    expect(clearOAuthNext.mock.invocationCallOrder[0]).toBeLessThan(signIn.mock.invocationCallOrder[0]);
  });

  /**
   * A spent code — the ordinary browser reload of the receiver URL, which
   * resends `?code=`. It runs through the error branch rather than short-
   * circuiting, and the user keeps the session they already have.
   */
  it("surfaces a rejected redemption as a handoff failure", async () => {
    const failure = new Error("nope") as Error & { code: string };
    failure.code = "oauth_handoff_failed";
    signIn.mockRejectedValue(failure);

    expect(await landsOn(form({ code: "spent" }))).toBe("/login?code=oauth_handoff_failed");
  });

  it("passes through a distinct failure code from the callback", async () => {
    const failure = new Error("nope") as Error & { code: string };
    failure.code = "identity_lookup_failed";
    signIn.mockRejectedValue(failure);

    expect(await landsOn(form({ code: "c" }))).toBe("/login?code=identity_lookup_failed");
  });

  it("falls back to the generic code when the failure carries none", async () => {
    signIn.mockRejectedValue(new Error("network down"));

    expect(await landsOn(form({ code: "c" }))).toBe("/login?code=oauth_handoff_failed");
  });
});
