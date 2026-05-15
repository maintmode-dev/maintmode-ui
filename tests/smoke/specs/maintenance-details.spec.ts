import { expect, test } from "@playwright/test";

import { signIn } from "../fixtures/auth-fixture";
import {
  FIXTURE_MAINTENANCE_PLANNED,
} from "../fixtures/maintenance-data";
import { installMaintenanceBackendMocks } from "../fixtures/mock-backend";

// Structural smoke for the full-page maintenance details surface. Reaches
// `/maintenance/:id` directly, exercising the same `MaintenanceDetailsPage`
// component the in-app navigation lands on. Backend reads are intercepted
// with fixtures so the assertions below are stable.

test.describe("maintenance details page (authenticated, mocked backend)", () => {
  test.beforeEach(async ({ context, page, baseURL }) => {
    await installMaintenanceBackendMocks(page);
    await signIn(context, baseURL ?? "http://localhost:3000");
  });

  test("renders maintenance title, planned range, and status badge", async ({ page }) => {
    await page.goto(`/maintenance/${FIXTURE_MAINTENANCE_PLANNED.id}`);

    await expect(
      page.getByRole("heading", { level: 2, name: FIXTURE_MAINTENANCE_PLANNED.title }),
    ).toBeVisible({ timeout: 10_000 });

    // Status badge label comes from MAINTENANCE_STATUS_LABEL — keep this loose
    // (case-insensitive contains) so changes to label casing don't churn.
    await expect(page.locator("text=/planned/i").first()).toBeVisible();

    // "Back to calendar" link must be reachable as a recovery affordance.
    await expect(page.getByRole("link").filter({ hasText: /calendar/i }).first()).toBeVisible();
  });

  test("details page has no horizontal overflow", async ({ page }) => {
    await page.goto(`/maintenance/${FIXTURE_MAINTENANCE_PLANNED.id}`);
    await expect(
      page.getByRole("heading", { level: 2, name: FIXTURE_MAINTENANCE_PLANNED.title }),
    ).toBeVisible({ timeout: 10_000 });

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });
});
