import { expect, test } from "@playwright/test";

import { expectNoSeriousViolations, runAxe } from "../fixtures/axe";

// Validates a11y on the post-redirect landing page after an unauthenticated
// visit to the calendar root. Backend-free: redirect lands on /login, so this
// effectively re-tests the login surface from the redirect entry-point with
// the `next` query param preserved.

test.describe("@a11y unauthenticated redirect", () => {
  test("redirected login view has no serious/critical axe violations", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    const results = await runAxe(page);
    expectNoSeriousViolations(results);
  });
});
