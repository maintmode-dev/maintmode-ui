import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * RUK-292 — the receiver page and its action agree on two field names.
 *
 * The split design (page renders, action redeems) put a contract between two
 * files, and each side's own tests assert only its own half:
 * `oauth-dance-complete.test.ts` proves the action reads `code` and `error` out
 * of FormData, but nothing proved the page ever puts them in under those names.
 * Verified: deleting the hidden `code` input sends every user to
 * `/login?code=oauth_handoff_failed` with the whole suite green — nobody can
 * sign in.
 *
 * Source-text rather than a render: this project has no harness for server page
 * components, and the property is two string literals matching across a file
 * boundary, which reading gives directly.
 */

const page = readFileSync(join(process.cwd(), "src/app/(public)/auth/oauth/callback/page.tsx"), "utf8");
const action = readFileSync(join(process.cwd(), "src/server/auth/oauth-dance-actions.ts"), "utf8");

describe("the receiver form carries what the action reads", () => {
  it.each(["code", "error"])("submits the %s parameter under that name", (field) => {
    // Matched across newlines: Prettier reflows a long `<input>` onto several
    // lines, and a single-line regex here failed on formatting rather than on
    // the property it guards.
    expect(page).toMatch(new RegExp(`<input[\\s\\S]*?name="${field}"[\\s\\S]*?value=\\{sp\\.${field}`));
    expect(action).toContain(`formData.get("${field}")`);
  });

  it("posts to the completing action", () => {
    expect(page).toContain("action={completeOAuthDanceAction}");
  });
});
