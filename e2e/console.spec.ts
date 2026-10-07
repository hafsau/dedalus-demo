import { expect, test, type Page } from "@playwright/test";

/** Every test starts with a clean, seeded simulator. */
async function freshConsole(page: Page) {
  await page.goto("/?seed=7");
  await expect(page.getByRole("heading", { name: "Machines" })).toBeVisible();
}

async function createMachine(page: Page) {
  const empty = page.getByRole("button", { name: "Boot your first machine" });
  if (await empty.isVisible()) await empty.click();
  else await page.getByRole("button", { name: "New machine" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Create machine" }).click();
  await expect(page).toHaveURL(/\/machines\/[0-9a-f-]{36}/);
  // Not getByText("running"): the ring always shows "running" as a label.
  await expect(page.getByRole("img", { name: /Lifecycle: running/ })).toBeVisible();
}

const header = (page: Page) => page.locator("main").getByRole("button", { name: /^(Wake|Sleep|Reboot|Destroy|Confirm destroy)/ });
const action = (page: Page, name: string) => header(page).filter({ hasText: new RegExp(`^${name}`) }).first();

async function runCommand(page: Page, command: string) {
  const input = page.getByRole("textbox", { name: /command/i });
  await expect(input).toBeEnabled();
  await input.fill(command);
  await input.press("Enter");
}

test("creates a machine from the empty state and lands on its detail page", async ({ page }) => {
  await freshConsole(page);
  await expect(page.getByText("No machines yet")).toBeVisible();
  await createMachine(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^dm-[0-9a-f]{8}$/);
  await expect(page.getByRole("img", { name: /Lifecycle: running, desired running/ })).toBeVisible();
});

test("disables actions the API would reject, and says why", async ({ page }) => {
  await freshConsole(page);
  await createMachine(page);
  const wake = action(page, "Wake");
  await expect(wake).toBeDisabled();
  await expect(wake).toHaveAccessibleName(/Already running/);
  await expect(action(page, "Sleep")).toBeEnabled();
});

test("files survive sleep, and a command on a sleeping machine wakes it", async ({ page }) => {
  await freshConsole(page);
  await createMachine(page);
  const log = page.getByRole("log", { name: "Command output" });

  await runCommand(page, "echo persisted > notes.txt && echo scratch > /tmp/x");
  await expect(log.getByText("succeeded · exit 0").first()).toBeVisible();

  await action(page, "Sleep").click();
  await expect(page.getByRole("img", { name: /Lifecycle: sleeping/ })).toBeVisible();

  await runCommand(page, "cat notes.txt");
  await expect(log.getByText("✓ woke the machine for this command")).toBeVisible();
  await expect(log.getByText("persisted", { exact: true })).toBeVisible();

  await runCommand(page, "cat /tmp/x");
  await expect(log.getByText("cat: /tmp/x: No such file or directory")).toBeVisible();
});

test("streams long output as it arrives", async ({ page }) => {
  await freshConsole(page);
  await createMachine(page);
  const log = page.getByRole("log", { name: "Command output" });
  await runCommand(page, "seq 1 300");
  // Partial output is on screen before the command finishes.
  await expect(log.getByText(/^running…?$/)).toBeVisible();
  await expect(log).toContainText("300");
  await expect(log.getByText(/succeeded · exit 0/)).toBeVisible();
});

test("measures a wake", async ({ page }) => {
  await freshConsole(page);
  await createMachine(page);
  await action(page, "Sleep").click();
  await expect(action(page, "Wake")).toBeEnabled();
  await action(page, "Wake").click();
  const panel = page.getByRole("region", { name: "Wake latency" });
  await expect(panel.getByText(/wake request → running/)).toBeVisible();
  await expect(panel.getByRole("img", { name: /Histogram of 1 wakes/ })).toBeVisible();
});

test("the command palette drives the machine", async ({ page }) => {
  await freshConsole(page);
  await createMachine(page);
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await palette.getByRole("combobox").fill("sleep");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("img", { name: /Lifecycle: sleeping/ })).toBeVisible();
});

test("the fleet survives a reload", async ({ page }) => {
  await freshConsole(page);
  await createMachine(page);
  const name = await page.getByRole("heading", { level: 1 }).textContent();
  await page.goto("/"); // no ?seed: restore from storage
  await expect(page.getByRole("link", { name: name! })).toBeVisible();
});

test("destroy needs confirmation and returns to the fleet", async ({ page }) => {
  await freshConsole(page);
  await createMachine(page);
  await action(page, "Destroy").click();
  await action(page, "Confirm destroy").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("No machines yet")).toBeVisible({ timeout: 15_000 });
});

test("an injected boot failure shows the error state", async ({ page }) => {
  await freshConsole(page);
  await createMachine(page);
  await action(page, "Sleep").click();
  await expect(action(page, "Wake")).toBeEnabled();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("option", { name: /Fail the next boot/ }).click();
  await action(page, "Wake").click();
  await expect(page.getByText(/simulated failure/)).toBeVisible();
  await expect(action(page, "Wake")).toHaveAccessibleName(/can't be woken/);
});

test("a machine created right before a reload isn't lost", async ({ page }) => {
  // Regression: saves were debounced by 250ms, so a reload inside that window
  // dropped the machine. Create and reload in the same tick to hit it every time.
  await page.goto("/?seed=8");
  await expect(page.getByText("No machines yet")).toBeVisible();
  await expect(page.getByText(/Fleet · 0\/5 machines/)).toBeVisible(); // simulator is up
  const id = await page.evaluate(async () => {
    const res = await fetch("/dcs/v1/machines", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const { machine_id } = await res.json();
    // A real reload is the point of this test, not a client-side navigation.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    location.href = "/"; // no ?seed: the next page restores from storage
    return machine_id as string;
  });
  await page.waitForURL((url) => url.pathname === "/" && !url.search);
  await expect(page.getByRole("link", { name: `dm-${id.slice(0, 8)}` })).toBeVisible();
});
