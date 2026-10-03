import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * RUK-292 — the first hop of the sign-in flow.
 *
 * `oauth-dance-start.test.ts` proves the action builds the right URL *for the
 * id it is handed*. Nothing proved the page hands it the right one, and the gap
 * is not theoretical: hardcoding `startOAuthDanceAction("github", …)` sends
 * every "Continue with Google" click to the wrong provider's start endpoint,
 * and it passed 1540 tests plus `tsc --noEmit`. Dropping the second argument
 * silently lands every deep link on `/` after sign-in — the `next` plumbing is
 * tested at both ends and was untested at the one place it is wired.
 *
 * Source-text, like the sibling provider guard: the page is a server component
 * this project has no harness to render, and the property is which arguments
 * one call receives.
 */

const page = readFileSync(join(process.cwd(), "src/app/(public)/login/page.tsx"), "utf8");

describe("the login page starts the dance with what the user clicked", () => {
  it("forwards the provider id it was given, not a literal", () => {
    expect(page).toMatch(/startOAuthDanceAction\(\s*providerId\s*,/);
    // A literal in that first position is the mutation that survives everything
    // else: every provider button would lead to the same backend endpoint.
    expect(page).not.toMatch(/startOAuthDanceAction\(\s*["'`]/);
  });

  it("forwards the sanitized destination as the second argument", () => {
    expect(page).toMatch(/startOAuthDanceAction\(\s*providerId\s*,\s*redirectTo\s*\)/);
  });

  it("derives that destination through safeNext rather than from the query directly", () => {
    // `redirectTo` is closed over by the action, so a client cannot supply a
    // destination of its own; `safeNext` is what makes the query-supplied one
    // safe to store.
    expect(page).toMatch(/const redirectTo = sp\.next \? safeNext\(sp\.next\) : "\/"/);
  });

  it("no longer calls NextAuth signIn for a provider", () => {
    expect(page).not.toContain('signIn("google"');
    expect(page).not.toMatch(/signIn\(\s*providerId/);
  });
});

/**
 * UX-12 (v0.2.0-rc): the resumed reset countdown needs the deadline the binding
 * carries, and this page is the one place it is handed across. Dropping the
 * prop compiles — it is optional — and quietly brings back the countdown that
 * restarts at five minutes on every reload.
 */
describe("the login page hands a resumed reset its deadline", () => {
  it("passes the binding's deadline alongside its address", () => {
    expect(page).toMatch(/resetInProgressEmail=\{resetBinding\?\.email\}/);
    expect(page).toMatch(/resetInProgressExpiresAt=\{resetBinding\?\.expiresAt\}/);
  });
});

/**
 * `/login/recovery` is a server page this project has no harness to render, so
 * its three load-bearing choices are pinned in its source, like the page above.
 */
describe("the recovery page", () => {
  const recovery = readFileSync(join(process.cwd(), "src/app/(public)/login/recovery/page.tsx"), "utf8");

  it("signs in through the break-glass action, not /login's email-and-password one", () => {
    expect(recovery).toContain("breakGlassSignInAction={breakGlassSignInAction}");
    expect(recovery).not.toMatch(/credentialsSignInAction/);
  });

  it("takes no destination from the query", () => {
    // The action lands on a fixed `/`; a page that read `?next=` here would add
    // an open parameter to the emergency entrance.
    expect(recovery).not.toMatch(/searchParams|safeNext/);
  });

  it("asks search engines not to index it", () => {
    expect(recovery).toMatch(/robots: \{ index: false, follow: false \}/);
  });
});
