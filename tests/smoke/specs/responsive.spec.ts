import { expect, test } from "@playwright/test";

// Responsive smoke: at every configured viewport (desktop / tablet / mobile)
// the public login surface must render without horizontal overflow and the
// app shell header must be reachable. Calendar/filters live behind auth and
// are validated manually + by the UI inspector / UX reviewer skills.

test("login page has no horizontal overflow", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  const overflow = await page.evaluate(() => {
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });

  // Allow 1px rounding slack.
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
});

test("login submit control is reachable and tappable", async ({ page }) => {
  await page.goto("/login");
  const submit = page.getByTestId("login-google");
  await expect(submit).toBeVisible();

  const box = await submit.boundingBox();
  expect(box).not.toBeNull();
  // Tap target: at minimum 32px in each dimension on every viewport.
  expect(box!.height).toBeGreaterThanOrEqual(32);
  expect(box!.width).toBeGreaterThanOrEqual(32);
});
