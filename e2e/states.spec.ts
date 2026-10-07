// "A person should be able to tell what happened and what they can do next."
// Each test drives a real failure or delay and checks what the screen says.
import { expect, test, type Page } from "@playwright/test";

async function createMachine(page: Page) {
  await page.goto("/?seed=13");
  await page.getByRole("button", { name: "Boot your first machine" }).click();
  await page.getByRole("button", { name: "Create machine" }).click();
  await expect(page.getByRole("img", { name: /Lifecycle: running/ })).toBeVisible();
}

async function setNetwork(page: Page, mode: "Normal" | "Slow" | "Flaky" | "Offline") {
  await page.getByRole("button", { name: /^Simulated/ }).click();
  await page.getByRole("radio", { name: new RegExp(`^${mode}`) }).check();
  await page.keyboard.press("Escape");
}

const action = (page: Page, name: string) =>
  page.locator("main").getByRole("button", { name: new RegExp(`^${name}`) }).first();

test("offline: says the control plane is unreachable and marks statuses as last known", async ({ page }) => {
  await createMachine(page);
  await setNetwork(page, "Offline");
  await expect(page.getByRole("button", { name: /Simulated · offline/ })).toBeVisible();

  const banner = page.getByRole("status").filter({ hasText: "Can't reach the control plane" });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("last known");
  await expect(page.getByText("· last known").first()).toBeVisible();
  await expect(page.getByRole("img", { name: /\(last known\)/ })).toBeVisible();

  await setNetwork(page, "Normal");
  await expect(banner).toBeHidden();
  await expect(page.getByText("· last known")).toHaveCount(0);
});

test("offline: a failed action is reported without claiming nothing changed", async ({ page }) => {
  await createMachine(page);
  await setNetwork(page, "Offline");
  await action(page, "Sleep").click();
  // Error toasts are alerts; the message must not pretend the action definitely didn't happen.
  await expect(page.getByRole("alert").filter({ hasText: /Couldn't reach the control plane to sleep/ })).toContainText(
    "Checking the machine's real state",
  );
  await setNetwork(page, "Normal");
  await expect(page.getByRole("img", { name: /Lifecycle: running/ })).toBeVisible();
});

test("slow: the action shows it's pending, then lands", async ({ page }) => {
  await createMachine(page);
  await setNetwork(page, "Slow");
  await action(page, "Sleep").click();
  await expect(action(page, "Sleeping…")).toBeVisible();
  await expect(page.getByRole("img", { name: /Lifecycle: sleeping/ })).toBeVisible({ timeout: 10_000 });
});

test("Stop says 'stopped watching', and 'check status' reports what really happened", async ({ page }) => {
  await createMachine(page);
  const input = page.getByRole("textbox", { name: /command/i });
  await input.fill("sleep 2; echo finished > f.txt; echo done");
  await input.press("Enter");
  await page.getByRole("button", { name: "Stop", exact: true }).click();

  const log = page.getByRole("log", { name: "Command output" });
  await expect(log.getByText(/stopped watching · the command may still be running/)).toBeVisible();
  await expect(log.getByText("cancelled")).toHaveCount(0);

  await page.waitForTimeout(2_500);
  await log.getByRole("button", { name: "check status" }).click();
  await expect(log.getByText(/succeeded · exit 0/)).toBeVisible();
  await expect(log.getByText("done", { exact: true })).toBeVisible();
});

test("a failed machine explains what happened and offers the way forward", async ({ page }) => {
  await createMachine(page);
  await action(page, "Sleep").click();
  await expect(action(page, "Wake")).toBeEnabled();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("option", { name: /Fail the next boot/ }).click();
  await action(page, "Wake").click();

  const banner = page.getByRole("alert").filter({ hasText: "This machine failed to start" });
  await expect(banner).toBeVisible();
  await expect(banner.getByRole("button", { name: "Create a new machine" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Lifecycle: failed" })).toBeVisible();
  await expect(page.getByText("can't measure: this machine failed to start")).toBeVisible();
});
