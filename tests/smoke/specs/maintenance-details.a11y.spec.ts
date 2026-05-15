import { expect, test } from "@playwright/test";

import { expectNoSeriousViolations, runAxe } from "../fixtures/axe";
import { signIn } from "../fixtures/auth-fixture";
import { FIXTURE_MAINTENANCE_PLANNED } from "../fixtures/maintenance-data";
import { installMaintenanceBackendMocks } from "../fixtures/mock-backend";

// Backend-mocked a11y coverage for the maintenance details surface:
// the full-page read-only view and the edit-mode form.

test.describe("@a11y maintenance details", () => {
  test.beforeEach(async ({ context, page, baseURL }) => {
    await installMaintenanceBackendMocks(page);
    await signIn(context, baseURL ?? "http://localhost:3000");
  });

  test("read-only details page has no serious/critical axe violations", async ({ page }) => {
    await page.goto(`/maintenance/${FIXTURE_MAINTENANCE_PLANNED.id}`);
    await expect(
      page.getByRole("heading", { level: 2, name: FIXTURE_MAINTENANCE_PLANNED.title }),
    ).toBeVisible({ timeout: 10_000 });

    const results = await runAxe(page);
    expectNoSeriousViolations(results);
  });

  test("edit form has no serious/critical axe violations", async ({ page }) => {
    await page.goto(`/maintenance/${FIXTURE_MAINTENANCE_PLANNED.id}?edit=1`);

    // The form mounts client-side after the details query resolves. Anchor
    // to the title field, which is always present in edit mode.
    await expect(page.getByLabel(/title/i)).toBeVisible({ timeout: 10_000 });

    const results = await runAxe(page);
    expectNoSeriousViolations(results);
  });
});
