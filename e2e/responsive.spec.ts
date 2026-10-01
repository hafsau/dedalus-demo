import { expect, test } from "@playwright/test";

for (const path of ["/?seed=1", "/about"]) {
  test(`no horizontal scroll on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("machine detail fits a phone", async ({ page }) => {
  await page.goto("/?seed=1");
  await page.getByRole("button", { name: "Boot your first machine" }).click();
  await page.getByRole("button", { name: "Create machine" }).click();
  await expect(page.getByRole("img", { name: /Lifecycle: running/ })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
