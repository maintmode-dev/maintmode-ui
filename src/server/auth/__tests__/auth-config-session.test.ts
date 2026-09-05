import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * RUK-288 AC-7, session half — the boundary AGENTS.md calls non-negotiable:
 * "Browser must never receive `access_token` or `refresh_token`."
 *
 * The `signIn` half (tokens land on `account`) is covered behaviourally in
 * `built-in-sign-in-callback.test.ts`. This half cannot be: importing
 * `auth-config` boots NextAuth's module-load environment. So it reads the
 * callback's source and asserts the token fields are never assigned onto the
 * session — brittle by nature, but a named, failing check beats an AC that only
 * a comment claims is covered.
 */

const source = readFileSync(join(process.cwd(), "src/server/auth/auth-config.ts"), "utf8");

function sessionCallbackBody(): string {
  const start = source.indexOf("async session(");
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf("\n    },", start);
  return source.slice(start, end);
}

describe("AC-7 — the session callback never carries a token", () => {
  it("assigns neither access nor refresh token onto the session", () => {
    const body = sessionCallbackBody();

    expect(body).not.toMatch(/session\.\w*[Tt]oken\s*=/);
    expect(body).not.toContain("session.user.accessToken");
    expect(body).not.toContain("token.accessToken");
    expect(body).not.toContain("token.refreshToken");
  });

  it("copies only the identity fields the browser is allowed to see", () => {
    const body = sessionCallbackBody();

    // Present, so the test is not passing merely because it read an empty slice.
    expect(body).toContain("session.user");
    expect(body.length).toBeGreaterThan(50);
  });
});
