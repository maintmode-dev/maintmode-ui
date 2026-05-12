import { expect, test } from "@playwright/test";

import { expectNoSeriousViolations, runAxe } from "../fixtures/axe";

// Backend-free a11y coverage on the auth surface — the only view that renders
// deterministically without a real backend or an authenticated session today.
// Extend with calendar/details once RUK-18/19 land authenticated fixtures.

test.describe("@a11y login surface", () => {
  test("login page has no serious/critical axe violations", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    const results = await runAxe(page);
    expectNoSeriousViolations(results);
  });

  test("login page with normalized OAuth error alert has no serious/critical axe violations", async ({
    page,
  }) => {
    await page.goto("/login?error=oauth_handoff_failed");
    await expect(page.getByRole("alert")).toBeVisible();
    const results = await runAxe(page);
    expectNoSeriousViolations(results);
  });
});
