import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function audit(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}

test("fleet (empty) has no serious accessibility violations", async ({ page }) => {
  await page.goto("/?seed=1");
  await expect(page.getByText("No machines yet")).toBeVisible();
  await audit(page);
});

test("machine detail has no serious accessibility violations", async ({ page }) => {
  await page.goto("/?seed=1");
  await page.getByRole("button", { name: "Boot your first machine" }).click();
  await page.getByRole("button", { name: "Create machine" }).click();
  await expect(page.getByRole("img", { name: /Lifecycle: running/ })).toBeVisible();
  // Next streams metadata on client navigation; the title lands just after content.
  await expect(page).toHaveTitle(/^dm-[0-9a-f]{8} · Workshop$/);
  await audit(page);
});

test("case study has no serious accessibility violations", async ({ page }) => {
  await page.goto("/about");
  await audit(page);
});

test("works with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?seed=1");
  await page.getByRole("button", { name: "Boot your first machine" }).click();
  await page.getByRole("button", { name: "Create machine" }).click();
  await expect(page.getByRole("img", { name: /Lifecycle: running/ })).toBeVisible();
});
