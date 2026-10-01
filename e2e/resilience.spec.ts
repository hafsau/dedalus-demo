import { expect, test } from "@playwright/test";

// Regression test for a bug found on the live deployment: browsers stop idle
// Service Workers (e.g. in a background tab). MSW's worker keeps its list of
// mocked tabs in memory, so after a restart every request fell through to the
// real network and the console broke. The client now notices (missing
// simulator header), reconnects, and retries.
test("keeps working after the browser stops the Service Worker", async ({ page, context }) => {
  await page.goto("/?seed=5");
  await page.getByRole("button", { name: "Boot your first machine" }).click();
  await page.getByRole("button", { name: "Create machine" }).click();
  await expect(page.getByRole("img", { name: /Lifecycle: running/ })).toBeVisible();

  // Exactly what the browser does to an idle worker.
  const cdp = await context.newCDPSession(page);
  await cdp.send("ServiceWorker.enable");
  await cdp.send("ServiceWorker.stopAllWorkers");

  const sleep = page.locator("main").getByRole("button", { name: /^Sleep/ }).first();
  await sleep.click();
  await expect(page.getByRole("img", { name: /Lifecycle: sleeping/ })).toBeVisible();

  await cdp.send("ServiceWorker.stopAllWorkers");
  const input = page.getByRole("textbox", { name: /command/i });
  await input.fill("whoami");
  await input.press("Enter");
  await expect(page.getByRole("log", { name: "Command output" }).getByText("root", { exact: true })).toBeVisible();
});
