import type { Page } from "@playwright/test";

import {
  FIXTURE_CALENDAR_RESPONSE,
  FIXTURE_MAINTENANCE_BY_ID,
  FIXTURE_RESOURCES_RESPONSE,
} from "./maintenance-data";

/**
 * Installs Playwright route handlers that satisfy the browser-side data
 * surface used by the calendar and maintenance details routes:
 *
 *   - GET /api/maintenance?from=...&to=...
 *   - GET /api/maintenance/:id
 *   - GET /api/resources (and /api/resources/directory if hit)
 *
 * Every backend-bound `/api/*` request stays inside the Playwright process —
 * the real BFF route handlers (which would need a reachable backend) are
 * never reached. This keeps smoke/a11y specs fully hermetic.
 */
export async function installMaintenanceBackendMocks(page: Page): Promise<void> {
  await page.route("**/api/maintenance", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(FIXTURE_CALENDAR_RESPONSE),
      });
      return;
    }
    await route.fallback();
  });

  await page.route("**/api/maintenance?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(FIXTURE_CALENDAR_RESPONSE),
    });
  });

  await page.route(/\/api\/maintenance\/[^/?]+(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    const match = url.pathname.match(/\/api\/maintenance\/([^/]+)$/);
    const id = match ? decodeURIComponent(match[1]) : null;
    const payload = id ? FIXTURE_MAINTENANCE_BY_ID[id] : null;
    if (!payload) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ code: "NOT_FOUND", message: "maintenance not found" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });

  await page.route("**/api/resources", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(FIXTURE_RESOURCES_RESPONSE),
      });
      return;
    }
    await route.fallback();
  });

  await page.route("**/api/resources?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(FIXTURE_RESOURCES_RESPONSE),
    });
  });
}
