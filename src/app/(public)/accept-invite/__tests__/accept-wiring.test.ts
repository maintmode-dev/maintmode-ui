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
const preview = codeOf("src/server/backend/invitations/resolve-invitation-preview.ts");

describe("the invitation page starts the dance with the invitation", () => {
  it("passes the token from the query, not a literal", () => {
    expect(page).toMatch(/startOAuthDanceAction\([\s\S]*?sp\.token\s*,?\s*\)/);
  });

  it("passes no destination, so an invited person lands on /", () => {
    // The middle argument must be `undefined`: passing a path here would send
    // someone arriving by invitation to a deep link they never asked for.
    // `[\s\S]` between arguments, not `\s`: the property is the ARGUMENT LIST,
    // and a reflow across lines (which Prettier would do if the call grew) must
    // not read as a security regression. A false failure on an auth guard
    // teaches the next reader to weaken the guard.
    expect(page).toMatch(
      /startOAuthDanceAction\(\s*"google"\s*,[\s\S]*?undefined\s*,[\s\S]*?sp\.token\s*,?\s*\)/,
    );
  });

  it("reads the session with auth(), never the cookie-writing reader", () => {
    // `readActiveSession()` writes on near-expiry refresh, which a page render
    // may not do — it would 500 only inside the rotation window. Comments are
    // stripped above, so this is about the call, not about naming the symbol.
    expect(page).toContain("await auth()");
    expect(page).not.toMatch(/readActiveSession\s*\(/);
  });

  /**
   * The page's SUPPLY of the signed-in state, not the component's use of it.
   * Replacing this with `undefined` disables the invitation-burn guard at its
   * source while every component test still passes — the component would simply
   * never be told anyone is signed in.
   */
  /**
   * Source-text, and narrower than the property it defends — worth naming so the
   * failure is legible.
   *
   * What matters behaviourally is that a session carrying
   * `RefreshAccessTokenError` STILL suppresses the button: the page's predicate
   * is deliberately broader than the action's, so the page never offers a click
   * the action would refuse. This project has no harness that renders a server
   * component, so that decision is guarded by matching the expression rather
   * than by exercising it. A refactor that keeps the behaviour (extracting a
   * helper, say) will fail this test — reread the page's comment before
   * loosening it, because the narrowing it warns against fails the same way.
   */
  it("derives the signed-in identity from the session", () => {
    expect(page).toMatch(/signedInAs\s*=\s*session\?\.user\?\.email/);
    expect(page).toMatch(/signedInAs=\{signedInAs\}/);
  });

  /**
   * A `<form>` with no `action` renders a button that does nothing — which is
   * exactly the dead page this change replaced, and the existing component test
   * (`button.closest("form")`) is satisfied by it. `receiver-form-fields.test.ts`
   * guards the same property for the sibling page.
   */
  it("binds the form to the accept action", () => {
    expect(component).toContain("action={acceptAction}");
  });

  it("names one provider, in one place", () => {
    // The component must not reintroduce a label that can disagree with the
    // action's provider.
    expect(component).not.toMatch(/github/i);
  });

  /**
   * RUK-304. The page decides availability from the backend's list, and the two
   * halves of that decision pull in opposite directions:
   *
   *  - a RESOLVED list without the provider means it is not configured, so the
   *    button must go — it would lead to raw backend JSON on another origin;
   *  - an UNRESOLVED list (`ok: false`) means the list could not be READ, which
   *    is no evidence at all. Hiding the button there would strand an invitee
   *    whose provider is fine, and unlike `/login` there is no password form to
   *    fall back to.
   *
   * The asymmetry is deliberate and easy to "simplify" into `providers.ok &&
   * …`, which reads more natural and silently inverts the second case. Asserted
   * on the source because a server page has no harness here — same reason as the
   * assertions above.
   */
  it("treats an unreadable provider list as available, not as absent", () => {
    expect(page).toMatch(/!providers\.ok\s*\|\|/);
    expect(page).toMatch(/methods\.some\(\(m\)\s*=>\s*m\.id === "google"\)/);
    expect(page).toMatch(/signInAvailable=\{signInAvailable\}/);
  });

  /**
   * The budget exists so the retry state is REACHABLE: this call blocks a
   * cold-start public route, and the shared default is 10s.
   */
  it("bounds both public reads and runs them concurrently", () => {
    expect(page).toMatch(/await Promise\.all\(/);
    expect(preview).toMatch(/signal:\s*AbortSignal\.timeout\(/);
  });
});
