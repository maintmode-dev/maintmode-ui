import { expect, test } from "@playwright/test";

import { signIn } from "../fixtures/auth-fixture";
import { installMaintenanceBackendMocks } from "../fixtures/mock-backend";

// Structural smoke for the authenticated calendar shell. The real backend is
// never reached — `/api/maintenance` and `/api/resources` are intercepted
// with deterministic fixtures so layout/structure can be asserted against a
// stable DOM. We assert presence of landmarks and absence of horizontal
// overflow rather than taking pixel screenshots, per the RUK-29 brief
// (structural visual regression, not brittle pixel checks).

test.describe("calendar shell (authenticated, mocked backend)", () => {
  test.beforeEach(async ({ context, page, baseURL }) => {
    await installMaintenanceBackendMocks(page);
    await signIn(context, baseURL ?? "http://localhost:3000");
  });

  test("renders header, top panel, and calendar grid with mocked data", async ({ page }) => {
    await page.goto("/");

    // App header is the only `<header>` landmark on the calendar shell.
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("link", { name: "Maintmode home" })).toBeVisible();

    // Primary navigation must include Calendar + Resources for any logged-in user.
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(page.getByTestId("nav-resources")).toBeVisible();

    // Top panel range controls.
    await expect(page.getByRole("button", { name: "Previous range" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next range" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Today" })).toBeVisible();

    // Calendar surface should mount — FullCalendar renders a grid with the
    // .fc-view-harness wrapper. We wait for one of the fixture maintenance
    // titles to be visible so we know the BFF intercept fired.
    await expect(page.getByText("Quarterly API gateway rollout").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("calendar shell has no horizontal overflow", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Quarterly API gateway rollout").first()).toBeVisible({
      timeout: 10_000,
    });

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });

  test("the active user email is rendered in the header", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("active-user-email")).toBeVisible();
  });
});
