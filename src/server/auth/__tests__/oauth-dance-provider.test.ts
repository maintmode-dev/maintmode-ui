import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * RUK-292 — the `oauth-dance` provider must be reachable.
 *
 * Same failure mode the `backend-login` guard was written for, and the reason
 * this file exists rather than trusting the suite: the `signIn` callback ends in
 * `return false`, so a misspelled id or a deleted branch fails *silently*. The
 * backend has already spent the one-time code by then, the user lands on
 * `/login` with a generic message, and nothing reports why. Verified: renaming
 * the id to "oauth-dancE" breaks 100% of provider sign-ins and leaves the whole
 * suite green.
 *
 * Asserted against the source text rather than by booting NextAuth: importing
 * `auth-config` evaluates the real config at module load, so a behavioural test
 * would assert more about the harness than about the wiring.
 */

const source = readFileSync(join(process.cwd(), "src/server/auth/auth-config.ts"), "utf8");
const actions = readFileSync(join(process.cwd(), "src/server/auth/oauth-dance-actions.ts"), "utf8");

describe("oauth-dance is wired into the signIn callback", () => {
  it("registers the provider under the id the receiver action calls", () => {
    expect(source).toContain('const OAUTH_DANCE_PROVIDER_ID = "oauth-dance"');
    expect(source).toMatch(/Credentials\(\{\s*id:\s*OAUTH_DANCE_PROVIDER_ID/);
    // The other half of the contract: the caller's literal must match. These two
    // files are the only places the id appears, and a rename in one of them is
    // exactly the silent break described above.
    expect(actions).toContain('signIn("oauth-dance"');
  });

  it("branches on that id in the signIn callback, before the catch-all rejection", () => {
    const branch = source.indexOf("account.provider === OAUTH_DANCE_PROVIDER_ID");
    expect(branch).toBeGreaterThan(-1);

    const catchAll = source.lastIndexOf("return false;");
    expect(branch).toBeLessThan(catchAll);
  });

  it("carries the code from authorize to the callback under the name the callback reads", () => {
    // A mismatch here registers a provider that authorizes fine and then redeems
    // an empty string, which the backend answers 401 — indistinguishable from an
    // expired code.
    expect(source).toMatch(/danceCode:\s*code/);
    expect(source).toMatch(/user\?\.danceCode/);
  });

  it("refuses an empty code before it reaches the backend", () => {
    // Without the guard an empty `danceCode` is redeemed and answered 401,
    // which is indistinguishable from an expired code — so the operator log the
    // change added points at the wrong cause.
    expect(source).toMatch(/if \(!code\) \{[\s\S]*?throw new BackendExchangeError/);
  });

  it("redeems in the callback, not in authorize", () => {
    // `authorize` must stay a shape check. The code is single-use with a 60s
    // life: redeeming in both halves spends it twice for one sign-in.
    const start = source.indexOf("id: OAUTH_DANCE_PROVIDER_ID");
    const end = source.indexOf("}),\n);", start);
    const authorizeBody = source.slice(start, end);

    expect(authorizeBody).not.toContain("redeemOAuthDanceCode");
    expect(authorizeBody).not.toContain("fetchBackendMe");
  });

  it("delegates the redemption to the extracted module", () => {
    // The stage split itself is covered behaviorally in
    // `oauth-dance-redemption.test.ts`. What this file still owns is the
    // wiring: that the callback calls into that module at all.
    expect(source).toContain("runDanceRedemption(account, code)");
    expect(source).toContain("OAuthDanceError");
  });
});
