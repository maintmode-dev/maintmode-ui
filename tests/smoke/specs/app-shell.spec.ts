import { expect, test } from "@playwright/test";

test("home route renders the operational scaffold shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Maintenance calendar" })).toBeVisible();
  await expect(page.getByText("No production data is wired yet")).toBeVisible();
  await expect(page.getByRole("button", { name: /Create maintenance is unavailable/ })).toBeDisabled();
});

test("maintenance details route renders a stable route shell", async ({ page }) => {
  await page.goto("/maintenance/test-id");

  await expect(page.getByRole("heading", { name: "Maintenance details" })).toBeVisible();
  await expect(page.getByText("test-id")).toBeVisible();
  await expect(page.getByText("Details data is not loaded yet")).toBeVisible();
});

test("BFF route stubs fail explicitly without serving mock data", async ({ request }) => {
  const response = await request.get("/api/maintenance");

  expect(response.status()).toBe(501);
  expect(response.headers()["cache-control"]).toBe("no-store");
  await expect(response.json()).resolves.toEqual({
    error: {
      code: "NOT_IMPLEMENTED",
      message: "This BFF route is intentionally scaffolded and does not serve prototype mock data.",
      route: "/api/maintenance",
    },
  });
});
