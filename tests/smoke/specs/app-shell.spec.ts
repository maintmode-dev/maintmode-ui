import { expect, test } from "@playwright/test";

test("home route renders the operational scaffold shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Maintenance calendar" })).toBeVisible();
  await expect(page.getByText("Production BFF contracts are wired.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Create maintenance is unavailable/ })).toBeDisabled();
});

test("maintenance details route renders a stable route shell", async ({ page }) => {
  await page.goto("/maintenance/test-id");

  await expect(page.getByRole("heading", { name: "Maintenance details" })).toBeVisible();
  await expect(page.getByText("test-id")).toBeVisible();
  await expect(page.getByText("Details data is not loaded yet")).toBeVisible();
});

test("maintenance BFF validates requests without serving mock data", async ({ request }) => {
  const response = await request.get("/api/maintenance");

  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toEqual({
    error: "Validation failed",
    code: "VALIDATION_ERROR",
    fieldErrors: [
      {
        field: "from",
        message: "must be provided as YYYY-MM-DD",
      },
      {
        field: "to",
        message: "must be provided as YYYY-MM-DD",
      },
    ],
  });
});
