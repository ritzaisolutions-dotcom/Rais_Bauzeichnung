import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Screenshot comparisons of the read-only share view with a fixed, furnished flat.
// Update the baselines after intended visual changes: npx playwright test tests/visual.spec.ts --update-snapshots

const project = JSON.parse(readFileSync("tests/fixtures/visual-project.json", "utf8"));

async function open(page: Page) {
  await page.route("**/api/share/visual", (r) => r.fulfill({ json: { project } }));
  await page.goto("/teilen/visual");
  await expect(page.getByTestId("share-view")).toBeVisible();
}

type Stats = { rendered: number; fromCache: number };
const spriteStats = (page: Page) =>
  page.evaluate(() => (window as unknown as { __raisSprites?: Stats }).__raisSprites ?? { rendered: 0, fromCache: 0 });

test("presentation plan looks as before", async ({ page }) => {
  test.setTimeout(180000);
  await open(page);
  await page.getByText("Grundriss", { exact: true }).click();
  // wait until all furniture top views are rendered (count stops changing)
  let last = -1;
  await expect
    .poll(
      async () => {
        const s = await spriteStats(page);
        const n = s.rendered + s.fromCache;
        const stable = n > 10 && n === last;
        last = n;
        return stable;
      },
      { timeout: 150000, intervals: [2000] },
    )
    .toBe(true);
  await expect(page.getByTestId("plan-canvas")).toHaveScreenshot("presentation-plan.png", {
    maxDiffPixelRatio: 0.02,
  });
});

test("3D top view looks as before", async ({ page }) => {
  test.setTimeout(180000);
  await open(page);
  await page.getByText("3D", { exact: true }).click();
  await page.getByText("Draufsicht", { exact: true }).click();
  // models load asynchronously; give them time, then compare
  await page.waitForTimeout(12000);
  await expect(page.getByTestId("scene-3d").locator("canvas").first()).toHaveScreenshot("3d-top.png", {
    maxDiffPixelRatio: 0.03,
  });
});
