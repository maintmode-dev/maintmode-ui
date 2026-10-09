import { beforeEach, describe, expect, it, vi } from "vitest";

const readOAuthNext = vi.fn();
const clearOAuthNext = vi.fn();
const signIn = vi.fn();
const readActiveSession = vi.fn();
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
vi.mock("@/server/auth/sign-in", () => ({ signInWithDanceCode: (...args: unknown[]) => signIn(...args) }));
// The action asks `hasActiveSession`, which is `readActiveSession` read as a boolean.
vi.mock("@/server/auth/session-token", () => ({
  hasActiveSession: async () => Boolean(await readActiveSession()),
}));
const readOAuthBindingProof = vi.fn();
const clearOAuthBinding = vi.fn();
vi.mock("@/server/auth/oauth-binding-cookie", () => ({
  readOAuthBindingProof: () => readOAuthBindingProof(),
  clearOAuthBinding: () => clearOAuthBinding(),
  mintOAuthBinding: vi.fn(),
}));
const completeProviderLink = vi.fn();
vi.mock("@/server/auth/provider-link", () => ({
  completeProviderLink: (...args: unknown[]) => completeProviderLink(...args),
}));

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
    readActiveSession.mockReset().mockResolvedValue(null);
    readOAuthBindingProof.mockReset().mockResolvedValue("binding-nonce");
    clearOAuthBinding.mockReset();
    completeProviderLink.mockReset();
    redirect.mockClear();
  });

  /**
   * Session fixation. An attacker who starts a dance on their own account and
   * gets a signed-in victim to open the receiver with that code — a link is
   * enough, since our own page submits the form — would otherwise swap the
   * victim's identity for theirs, and everything the victim writes afterwards
   * lands in the attacker's account.
   */
  it("refuses to redeem into a browser that already holds a session", async () => {
    readActiveSession.mockResolvedValue({ user: { id: "victim" } });

    expect(await landsOn(form({ code: "attacker-code" }))).toBe("/");
    expect(signIn).not.toHaveBeenCalled();
  });

  /**
   * GAP-2. A LINK returns to this receiver with the account already signed in —
   * `linked=1` on success, `error` on failure, and never a code. It must land
   * on the profile with its outcome, not on `/` with nothing said.
   */
  it("sends a completed link to the profile", async () => {
    readActiveSession.mockResolvedValue({ user: { id: "me" } });

    expect(await landsOn(form({ linked: "1" }))).toBe("/settings/profile?linked=1");
    expect(signIn).not.toHaveBeenCalled();
  });

  it.each([
    ["link_conflict", "/settings/profile?link_error=link_conflict"],
    ["access_denied", "/settings/profile?link_error=denied"],
    ["consent_cancelled", "/settings/profile?link_error=denied"],
    ["state_invalid", "/settings/profile?link_error=failed"],
    ["<script>alert(1)</script>", "/settings/profile?link_error=failed"],
  ])("sends a failed link (%s) to the profile with a closed code", async (error, expected) => {
    // Never the raw value: it lands in the address bar and on the page.
    readActiveSession.mockResolvedValue({ user: { id: "me" } });

    expect(await landsOn(form({ error }))).toBe(expected);
  });

  it("still redeems nothing for a code that arrives alongside a session", async () => {
    // The fixation guard is unchanged by the link branch: a code with a
    // session is refused, whatever else the form carries.
    readActiveSession.mockResolvedValue({ user: { id: "victim" } });

    expect(await landsOn(form({ code: "attacker-code", linked: "" }))).toBe("/");
    expect(signIn).not.toHaveBeenCalled();
  });

  it("does not treat linked=1 without a session as anything", async () => {
    // Nobody is signed in, so no link happened here: the ordinary no-code path.
    expect(await landsOn(form({ linked: "1" }))).toBe("/login?code=oauth_handoff_failed");
  });

  it("still clears the destination cookie when it refuses", async () => {
    readActiveSession.mockResolvedValue({ user: { id: "victim" } });

    await landsOn(form({ code: "attacker-code" }));

    expect(clearOAuthNext).toHaveBeenCalledTimes(1);
  });

  /**
   * The sign-in codes of the backend's set plus an unknown one
   * (`link_conflict` returns only to a signed-in browser — see the link cases).
   *
   * The three middle codes collapsing onto the generic message is a DECISION,
   * not an omission — the user's action is the same for all three and the detail
   * lives in the backend's audit trail. Asserted explicitly so a later reader
   * cannot mistake the folding for a gap and "fix" it into an oracle.
   */
  it.each([
    ["access_denied", "/login?code=signup_disabled"],
    ["consent_cancelled", "/login?code=consent_cancelled"],
    ["email_mismatch", "/login?code=email_mismatch"],
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

  /**
   * Login CSRF on a signed-out browser (security review 2026-10-07, M-1). The
   * receiver submits itself, so a link carrying someone else's fresh code would
   * sign whoever opens it into that account. Only a browser that started the
   * dance here holds the destination cookie.
   */
  it("refuses a code when this browser never started a dance", async () => {
    readOAuthNext.mockResolvedValue(null);

    expect(await landsOn(form({ code: "attacker-code" }))).toBe("/login?code=oauth_handoff_failed");
    expect(signIn).not.toHaveBeenCalled();
  });

  /**
   * The proof check must sit AFTER the session branch and the backend-error
   * branch. A link comes back with no destination cookie (the profile's connect
   * route never sets one), and a backend error is worth its own message even
   * when the cookie has expired; moving the check up would turn both into the
   * generic handoff failure.
   */
  // The attack against a signed-in victim, or simply a tab older than the
  // cookie: refused by the session branch, and it must still land somewhere.
  it("sends a signed-in browser with a code but no destination cookie to /", async () => {
    readOAuthNext.mockResolvedValue(null);
    readActiveSession.mockResolvedValue({ user: { id: "victim" } });

    expect(await landsOn(form({ code: "attacker-code" }))).toBe("/");
    expect(signIn).not.toHaveBeenCalled();
  });

  /**
   * Backend M1: a link comes back as a one-time `link_code`, completed from
   * this session with this browser's nonce. The outcome lands on the profile.
   */
  it.each([
    ["linked", "/settings/profile?linked=1"],
    ["link_conflict", "/settings/profile?link_error=link_conflict"],
    ["failed", "/settings/profile?link_error=failed"],
  ])("completes a pending link from the session (%s)", async (outcome, expected) => {
    readOAuthNext.mockResolvedValue(null);
    readActiveSession.mockResolvedValue({ user: { id: "me" } });
    completeProviderLink.mockResolvedValue(outcome);

    expect(await landsOn(form({ link_code: "lc-1" }))).toBe(expected);
    expect(completeProviderLink).toHaveBeenCalledWith("lc-1", "binding-nonce");
  });

  it("does not complete a link this browser holds no nonce for", async () => {
    readActiveSession.mockResolvedValue({ user: { id: "me" } });
    readOAuthBindingProof.mockResolvedValue(null);

    expect(await landsOn(form({ link_code: "forwarded" }))).toBe("/settings/profile?link_error=failed");
    expect(completeProviderLink).not.toHaveBeenCalled();
  });

  it("does not complete a link without a session", async () => {
    expect(await landsOn(form({ link_code: "lc-1" }))).toBe("/login?code=oauth_handoff_failed");
    expect(completeProviderLink).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("still sends a completed link to the profile without the destination cookie", async () => {
    readOAuthNext.mockResolvedValue(null);
    readActiveSession.mockResolvedValue({ user: { id: "me" } });

    expect(await landsOn(form({ linked: "1" }))).toBe("/settings/profile?linked=1");
  });

  it("still sends a failed link to the profile without the destination cookie", async () => {
    readOAuthNext.mockResolvedValue(null);
    readActiveSession.mockResolvedValue({ user: { id: "me" } });

    expect(await landsOn(form({ error: "link_conflict" }))).toBe(
      "/settings/profile?link_error=link_conflict",
    );
  });

  it("still maps a backend error without the destination cookie", async () => {
    readOAuthNext.mockResolvedValue(null);

    expect(await landsOn(form({ error: "email_mismatch" }))).toBe("/login?code=email_mismatch");
  });

  it("redeems the code with this browser's proof, then lands on the stored destination", async () => {
    readOAuthNext.mockResolvedValue("/calendar?view=week");
    signIn.mockResolvedValue(undefined);

    expect(await landsOn(form({ code: "one-time" }))).toBe("/calendar?view=week");
    expect(signIn).toHaveBeenCalledWith("one-time", "binding-nonce");
  });

  it("lands on / when the stored destination is empty or rejected", async () => {
    readOAuthNext.mockResolvedValue("/");
    signIn.mockResolvedValue(undefined);

    expect(await landsOn(form({ code: "one-time" }))).toBe("/");
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

  /**
   * The binding (M-1 / backend L1). The nonce is the proof the backend checks;
   * without it there is nothing to redeem with, and spending the code on a
   * request the backend must refuse would only burn it.
   */
  it("refuses a code when this browser holds no binding nonce", async () => {
    readOAuthBindingProof.mockResolvedValue(null);

    expect(await landsOn(form({ code: "one-time" }))).toBe("/login?code=oauth_handoff_failed");
    expect(signIn).not.toHaveBeenCalled();
  });

  it("clears the binding on every exit, before redeeming", async () => {
    signIn.mockResolvedValue(undefined);

    await landsOn(form({ code: "one-time" }));
    expect(clearOAuthBinding.mock.invocationCallOrder[0]).toBeLessThan(signIn.mock.invocationCallOrder[0]);

    clearOAuthBinding.mockClear();
    await landsOn(form({ error: "access_denied" }));
    expect(clearOAuthBinding).toHaveBeenCalledTimes(1);
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

  /**
   * A `.code` this app did not define is not ours to forward. A dead backend
   * throws `ECONNREFUSED`; putting that in the address bar tells the user
   * nothing, renders the same generic message either way, and leaks a fact about
   * our infrastructure into their bug report and the access log.
   */
  it.each(["ECONNREFUSED", "ABORT_ERR", "javascript:alert(1)"])(
    "does not forward the foreign error code %s",
    async (code) => {
      const failure = new Error("boom") as Error & { code: string };
      failure.code = code;
      signIn.mockRejectedValue(failure);

      expect(await landsOn(form({ code: "c" }))).toBe("/login?code=oauth_handoff_failed");
    },
  );
});
