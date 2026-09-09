import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The invitation page's wiring.
 *
 * Source-text, like the sibling guards (`login-wiring.test.ts`,
 * `receiver-form-fields.test.ts`): this project has no harness for server page
 * components, and the properties here are which symbol the page calls and with
 * what.
 *
 * The provider assertion exists because the two halves DID drift: the button's
 * label switched on the backend's `suggested_provider` while the action passed
 * "google" unconditionally, so a backend that ever returned "github" would have
 * rendered a GitHub button that started a Google dance. There is now one
 * provider named in one place, and this is what keeps it that way.
 */

/** File text with comments stripped — the assertions below are about code. */
function codeOf(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const page = codeOf("src/app/(public)/accept-invite/page.tsx");
const component = codeOf("src/features/auth/accept-invite-page.tsx");

describe("the invitation page starts the dance with the invitation", () => {
  it("passes the token from the query, not a literal", () => {
    expect(page).toMatch(/startOAuthDanceAction\([^)]*sp\.token\s*\)/);
  });

  it("passes no destination, so an invited person lands on /", () => {
    // The middle argument must be `undefined`: passing a path here would send
    // someone arriving by invitation to a deep link they never asked for.
    expect(page).toMatch(/startOAuthDanceAction\(\s*"google"\s*,\s*undefined\s*,\s*sp\.token\s*\)/);
  });

  it("reads the session with auth(), never the cookie-writing reader", () => {
    // `readActiveSession()` writes on near-expiry refresh, which a page render
    // may not do — it would 500 only inside the rotation window. Comments are
    // stripped above, so this is about the call, not about naming the symbol.
    expect(page).toContain("await auth()");
    expect(page).not.toMatch(/readActiveSession\s*\(/);
  });

  it("names one provider, in one place", () => {
    // The component must not reintroduce a label that can disagree with the
    // action's provider.
    expect(component).not.toMatch(/github/i);
  });
});
