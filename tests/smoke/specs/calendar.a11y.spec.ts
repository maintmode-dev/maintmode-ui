import { expect, test } from "@playwright/test";

import { expectNoSeriousViolations, runAxe } from "../fixtures/axe";
import { signIn } from "../fixtures/auth-fixture";
import { installMaintenanceBackendMocks } from "../fixtures/mock-backend";

// Backend-mocked a11y coverage for the authenticated calendar surface.
// Complements the login-surface specs (`login.a11y.spec.ts`,
// `auth-redirect.a11y.spec.ts`) that cover the unauthenticated entry-point.

test.describe("@a11y calendar shell", () => {
  test.beforeEach(async ({ context, page, baseURL }) => {
    await installMaintenanceBackendMocks(page);
    await signIn(context, baseURL ?? "http://localhost:3000");
  });

  test("calendar page has no serious/critical axe violations", async ({ page }) => {
    await page.goto("/");

    // Wait for the fixture data to be rendered so axe scans a stable DOM.
    await expect(page.getByText("Quarterly API gateway rollout").first()).toBeVisible({
      timeout: 10_000,
    });

    const results = await runAxe(page);
    expectNoSeriousViolations(results);
  });

  test("calendar filter drawer open state has no serious/critical axe violations", async ({
    page,
    viewport,
  }) => {
    await page.goto("/");
    await expect(page.getByText("Quarterly API gateway rollout").first()).toBeVisible({
      timeout: 10_000,
    });

    // The "Open filters" button is hidden on >=lg viewports. Skip if the
    // current project viewport doesn't expose it — the lg+ projects already
    // surface the always-visible filter aside, which the page-level scan
    // above covers.
    const openFilters = page.getByRole("button", { name: "Open filters" });
    if (!(await openFilters.isVisible().catch(() => false))) {
      test.skip(true, `filter drawer is only mounted on small viewports (current ${viewport?.width}px)`);
      return;
    }

    await openFilters.click();
    await expect(page.getByRole("dialog")).toBeVisible();

    const results = await runAxe(page);
    expectNoSeriousViolations(results);
  });
});
