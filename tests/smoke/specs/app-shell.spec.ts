import { expect, test } from "@playwright/test";

test("unauthenticated visit to / redirects to the login page", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByTestId("login-google")).toBeVisible();
});

test("login page surfaces a normalized OAuth error", async ({ page }) => {
  await page.goto("/login?error=oauth_handoff_failed");
  await expect(page.getByRole("alert")).toContainText("OAuth handoff");
});

test("BFF maintenance route requires authentication", async ({ request }) => {
  const response = await request.get("/api/maintenance?from=2026-05-11&to=2026-05-17");
  expect(response.status()).toBe(401);
  const body = await response.json();
  expect(body.code).toBe("AUTH_REQUIRED");
});

test("BFF maintenance route still validates the input contract before auth", async ({ request }) => {
  const response = await request.get("/api/maintenance");
  // Validation runs before the authenticated wrapper for query-shape errors,
  // so an unauthenticated client can still see the field-error contract.
  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body.code).toBe("VALIDATION_ERROR");
  expect(body.fieldErrors).toContainEqual({ field: "from", message: "must be provided as YYYY-MM-DD" });
});
