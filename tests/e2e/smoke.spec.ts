import { expect, test } from "@playwright/test";

test("Caleris Masters public entry point loads", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveTitle(/Caleris Masters/i);
  await expect(page.locator("#root")).not.toBeEmpty();
  expect(pageErrors).toEqual([]);
});
