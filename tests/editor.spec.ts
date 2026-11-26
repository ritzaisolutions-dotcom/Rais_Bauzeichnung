import { existsSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  const res = await page.request.post("/api/login", { data: { password: "test-passwort" } });
  expect(res.ok()).toBe(true);
}

async function newProject(page: Page, template: "Leerer Grundriss" | "Beispielwohnung", name = "Testprojekt") {
  await login(page);
  await page.goto("/");
  await page.getByTestId("new-project").click();
  await page.getByTestId("project-name").fill(name);
  await page.getByText(template, { exact: true }).click();
  await page.getByTestId("create-project").click();
  await page.waitForURL(/\/project\//);
  await expect(page.getByTestId("plan-canvas")).toBeVisible();
}

const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(e.message));
});
test.afterEach(() => expect(errors).toEqual([]));

test("sample flat shows rooms with areas and can be staged", async ({ page }) => {
  await newProject(page, "Beispielwohnung");
  const table = page.locator("table");
  for (const name of ["Wohnen / Essen", "Schlafen", "Bad", "WC", "HWR", "Flur", "Zimmer"]) {
    await expect(table.getByText(name, { exact: true })).toBeVisible();
  }
  await page.getByText("Alle Räume einrichten").click();
  await expect(page.locator('[data-kind="item"]').first()).toBeVisible();
  expect(await page.locator('[data-kind="item"]').count()).toBeGreaterThan(15);
  // one undo step removes all staged furniture
  await page.keyboard.press("Control+z");
  await expect(page.locator('[data-kind="item"]')).toHaveCount(0);
  await page.keyboard.press("Control+Shift+z");
  expect(await page.locator('[data-kind="item"]').count()).toBeGreaterThan(15);
});

test("draws a room with the room tool and a wall with a typed length", async ({ page }) => {
  await newProject(page, "Leerer Grundriss");
  const box = (await page.getByTestId("plan-canvas").boundingBox())!;
  await page.getByTestId("tool-room").click();
  await page.mouse.move(box.x + 200, box.y + 150);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 350, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('[data-kind="room"]')).toHaveCount(1);
  await expect(page.locator('[data-kind="wall"]')).toHaveCount(4);

  // a dividing wall splits the room in two
  await page.getByTestId("tool-wall").click();
  await page.mouse.click(box.x + 350, box.y + 150);
  await page.mouse.move(box.x + 350, box.y + 360);
  await page.mouse.click(box.x + 350, box.y + 350);
  await expect(page.locator('[data-kind="room"]')).toHaveCount(2);

  // typed length: 2,5 m from a free point
  await page.getByTestId("tool-wall").click();
  await page.mouse.click(box.x + 700, box.y + 200);
  await page.mouse.move(box.x + 800, box.y + 200);
  await page.keyboard.type("2,5");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await page.getByTestId("tool-select").click();
  await page.locator('[data-kind="wall"]').last().click();
  await expect(page.locator('input[value="2,50"]')).toHaveCount(1);
});

test("places furniture from the library and persists after reload", async ({ page }) => {
  await newProject(page, "Beispielwohnung", "Persistenz");
  const box = (await page.getByTestId("plan-canvas").boundingBox())!;
  await page.getByText("Sofa 3-Sitzer").click();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('[data-kind="item"]')).toHaveCount(1);
  await page.keyboard.press("r");
  await expect(page.getByText("Gespeichert")).toBeVisible({ timeout: 5000 });
  await page.reload();
  await expect(page.locator('[data-kind="item"]')).toHaveCount(1);
});

test("3D view renders and the assistant reports a missing key", async ({ page }) => {
  await newProject(page, "Beispielwohnung");
  await page.getByTestId("view-3d").click();
  await expect(page.getByTestId("scene-3d").locator("canvas")).toBeVisible({ timeout: 15000 });
  await page.getByTestId("chat-toggle").click();
  await page.getByPlaceholder(/Richte das Kinderzimmer/).fill("Richte das Bad ein");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("chat-panel").getByText(/Kein Claude-API-Key/)).toBeVisible({ timeout: 15000 });
});

const pdf = "tests/fixtures/bauzeichnung-beispiel.pdf";
test("imports a construction drawing PDF with scale and room labels", async ({ page }) => {
  test.skip(!existsSync(pdf), "no local PDF fixture");
  await newProject(page, "Leerer Grundriss");
  await page.getByTestId("import-button").click();
  await page.getByTestId("import-file").setInputFiles(pdf);
  await expect(page.getByText("Maßstab erkannt: 1:100")).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Raumbeschriftungen gefunden/)).toBeVisible();
  await page.getByText("Als Unterlage übernehmen und nachzeichnen").click();
  await expect(page.getByTestId("plan-canvas").locator("image")).toHaveCount(1);
  await expect(page.getByText("Raumnamen übernehmen")).toBeVisible();
});

test("the app and the AI routes require the password", async ({ page, request }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await page.getByTestId("login-password").fill("falsch");
  await page.getByTestId("login-submit").click();
  await expect(page.getByText("Das Passwort ist falsch.")).toBeVisible();
  const api = await request.post("/api/ai/chat", { data: { messages: [] } });
  expect(api.status()).toBe(401);
  await page.getByTestId("login-password").fill("test-passwort");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("new-project")).toBeVisible();
  await page.getByTitle("Abmelden").click();
  await expect(page).toHaveURL(/\/login/);
});

test("projects API needs the password; share links are public but checked", async ({ page, request }) => {
  expect((await request.get("/api/projects")).status()).toBe(401);
  // without a configured cloud the list answers with local mode
  await login(page);
  const list = await page.request.get("/api/projects");
  expect(await list.json()).toMatchObject({ cloud: false });
  // share pages are reachable without login and reject unknown tokens
  const ctx = await page.context().browser()!.newContext();
  const anon = await ctx.newPage();
  await anon.goto("/teilen/unbekannt123");
  await expect(anon).toHaveURL(/\/teilen\/unbekannt123/);
  await expect(anon.getByText(/nicht geladen werden|ungültig/)).toBeVisible();
  await ctx.close();
});

test("shared view shows plan, 3D and areas read-only", async ({ browser }) => {
  const project = JSON.parse(readFileSync("tests/fixtures/share-project.json", "utf8"));
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/share/demo-token", (r) => r.fulfill({ json: { project } }));
  await page.goto("/teilen/demo-token");
  await expect(page.getByTestId("share-view")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Musterwohnung" })).toBeVisible();
  await expect(page.getByTestId("share-areas")).toContainText("Wohnfläche");
  await expect(page.getByTestId("plan-canvas")).toBeVisible();
  // no editing tools in the shared view
  await expect(page.getByTestId("new-project")).toHaveCount(0);
  await expect(page.getByTestId("import-button")).toHaveCount(0);
  await page.screenshot({ path: "test-results/share-view.png" });
  await ctx.close();
});
