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
  await page.getByRole("button", { name: "Alle Räume einrichten" }).click();
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

async function syntheticPlan() {
  const sharp = (await import("sharp")).default;
  // one 6 × 4 m room with 24 cm walls at 100 px/m, at (400, 300) on a 1600 × 1200 sheet
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><rect width="1600" height="1200" fill="#fff"/><rect x="400" y="300" width="600" height="400" fill="none" stroke="#000" stroke-width="24"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

test("tracing snaps to the walls of the drawing and takes their thickness", async ({ page }) => {
  await newProject(page, "Leerer Grundriss");
  await page.getByTestId("import-button").click();
  await page
    .getByTestId("import-file")
    .setInputFiles({ name: "plan.png", mimeType: "image/png", buffer: await syntheticPlan() });
  await page.getByText("Als Unterlage übernehmen und nachzeichnen").click();
  await page.getByTestId("tool-wall").click();
  const axes = page.getByTestId("drawn-walls").locator("line");
  await expect(axes).toHaveCount(4, { timeout: 15000 });
  const rects = await axes.evaluateAll((ls) =>
    ls.map((l) => {
      const r = l.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
    }),
  );
  const hs = rects
    .filter((r) => r.w > r.h)
    .map((r) => r.y)
    .sort((a, b) => a - b);
  const vs = rects
    .filter((r) => r.h > r.w)
    .map((r) => r.x)
    .sort((a, b) => a - b);
  // click 4 px off each corner; the drawing's corners must catch the clicks
  const corners: [number, number][] = [
    [vs[0] + 4, hs[0] - 3],
    [vs[1] - 3, hs[0] + 4],
    [vs[1] + 4, hs[1] + 3],
    [vs[0] - 4, hs[1] - 3],
    [vs[0] + 4, hs[0] - 3],
  ];
  for (const [x, y] of corners) await page.mouse.click(x, y);
  await expect(page.locator('[data-kind="room"]')).toHaveCount(1);
  await expect(page.getByTestId("plan-canvas")).toContainText("21,66 m²");
  await page.getByTestId("tool-select").click();
  await page.locator('[data-kind="wall"]').first().click();
  await expect(page.locator('input[value="0,240"]')).toHaveCount(1);
});

test("AI import shows a preview for a crop and only applies it on accept", async ({ page }) => {
  const png = await syntheticPlan();
  let sent: { width: number; height: number; textItems: unknown[] } | null = null;
  await page.route("**/api/ai/import", async (r) => {
    sent = r.request().postDataJSON();
    // the crop starts at (300, 200) and is small enough to be sent unscaled: room at (100,100)-(700,500)
    await r.fulfill({
      json: {
        plan: {
          walls: [
            { x1: 100, y1: 100, x2: 700, y2: 100, thickness_px: 24, type: "aussen" },
            { x1: 700, y1: 100, x2: 700, y2: 500, thickness_px: 24, type: "aussen" },
            { x1: 700, y1: 500, x2: 100, y2: 500, thickness_px: 24, type: "aussen" },
            { x1: 100, y1: 500, x2: 100, y2: 100, thickness_px: 24, type: "aussen" },
          ],
          openings: [{ x: 400, y: 500, kind: "tuer", width_px: 90 }],
          rooms: [{ name: "Wohnen", x: 400, y: 300, area_m2: 21.5 }],
          notes: "Testplan",
        },
      },
    });
  });
  await newProject(page, "Leerer Grundriss");
  await page.getByTestId("import-button").click();
  await page.getByTestId("import-file").setInputFiles({ name: "plan.png", mimeType: "image/png", buffer: png });
  const preview = page.getByTestId("plan-preview");
  await expect(preview).toBeVisible();
  // drag a crop from image (300, 200) to (1100, 800)
  const box = (await preview.boundingBox())!;
  const at = (x: number, y: number) => [box.x + (x / 1600) * box.width, box.y + (y / 1200) * box.height] as const;
  await page.mouse.move(...at(300, 200));
  await page.mouse.down();
  await page.mouse.move(...at(700, 500), { steps: 4 });
  await page.mouse.move(...at(1100, 800), { steps: 4 });
  await page.mouse.up();
  await expect(page.getByText(/Ausschnitt gewählt/)).toBeVisible();
  await page.getByText("Ausschnitt mit KI erkennen").click();
  await expect(page.getByTestId("ai-result")).toContainText("4 Wände, 1 Öffnungen, 1 Räume");
  expect(sent!.width).toBeGreaterThan(780);
  expect(sent!.width).toBeLessThan(820);
  // nothing has been applied yet
  await page.screenshot({ path: "test-results/ai-preview.png" });
  await page.getByTestId("ai-accept").click();
  await expect(page.getByText(/KI-Ergebnis übernommen/)).toBeVisible();
  // room area label from the derived room (5.76 × 3.76 m)
  await expect(page.getByTestId("plan-canvas")).toContainText("21,66 m²");
});

test("frame selection, copy and paste onto another floor", async ({ page }) => {
  await newProject(page, "Beispielwohnung", "Kopieren");
  const walls = await page.locator('[data-kind="wall"]').count();
  expect(walls).toBeGreaterThan(5);
  const box = (await page.getByTestId("plan-canvas").boundingBox())!;
  // shift + drag around the whole canvas
  await page.keyboard.down("Shift");
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
  await page.mouse.move(box.x + box.width - 5, box.y + box.height - 5, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await page.keyboard.press("Control+c");
  await expect(page.getByText(/Kopiert/)).toBeVisible();
  // new empty floor, paste at the same position
  await page.getByTestId("floor-menu").locator("button").first().click();
  await page.getByText("Neue leere Etage").click();
  await expect(page.locator('[data-kind="wall"]')).toHaveCount(0);
  await page.keyboard.press("Control+v");
  await expect(page.locator('[data-kind="wall"]')).toHaveCount(walls);
  await expect(page.locator('[data-kind="room"]').first()).toBeVisible();
  // undo removes the paste in one step
  await page.keyboard.press("Control+z");
  await expect(page.locator('[data-kind="wall"]')).toHaveCount(0);
});

test("help opens with ? and the intro can be dismissed", async ({ page }) => {
  await newProject(page, "Leerer Grundriss");
  await expect(page.getByTestId("intro")).toBeVisible();
  await page.getByTestId("intro").getByText("Verstanden").click();
  await expect(page.getByTestId("intro")).toHaveCount(0);
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Tastenkürzel und Bedienung" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByTestId("plan-canvas")).toBeVisible();
  await expect(page.getByTestId("intro")).toHaveCount(0);
});

test("custom furniture from an uploaded GLB model", async ({ page }) => {
  await newProject(page, "Leerer Grundriss");
  await page.getByText("Eigenes Möbel").click();
  await page.getByTestId("glb-file").setInputFiles("public/models/ceramic_vase_01.glb");
  await expect(page.getByTestId("glb-size")).toContainText("Modell geladen");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("ceramic_vase_01").first()).toBeVisible();
});

test("a roof slope reduces the living area (WoFlV)", async ({ page }) => {
  await newProject(page, "Beispielwohnung", "Dachgeschoss");
  const living = page.locator("tr", { hasText: "Wohnfläche" }).locator("td").nth(1);
  const before = await living.innerText();
  // the outer walls come first; one of them borders living rooms
  const wall = page.locator('[data-kind="wall"]').first();
  const b = (await wall.boundingBox())!;
  // near the end of the wall, away from its window
  await wall.click({ position: b.width > b.height ? { x: 30, y: b.height / 2 } : { x: b.width / 2, y: 30 } });
  await page.getByTestId("wall-slope").check();
  const canvas = (await page.getByTestId("plan-canvas").boundingBox())!;
  await page.mouse.click(canvas.x + 8, canvas.y + 8);
  await expect(living).not.toHaveText(before);
  await expect(page.getByTestId("plan-canvas")).toContainText("2,00 m");
});

test("room wall colour and time of day in 3D", async ({ page }) => {
  await newProject(page, "Beispielwohnung", "Farben");
  await page.locator("table").getByText("Bad", { exact: true }).click();
  await expect(page.getByText("Wandfarbe (3D)")).toBeVisible();
  await page.getByLabel("Fliesen bis").fill("1,2");
  await page.getByLabel("Fliesen bis").press("Enter");
  await page.getByTestId("view-split").click();
  await expect(page.getByTestId("scene-3d")).toBeVisible();
  await page.getByTestId("daytime").fill("21");
  await expect(page.getByTestId("scene-3d")).toContainText("21:00");
});

test("exports a to-scale PDF plan with title block", async ({ page }) => {
  await newProject(page, "Beispielwohnung", "PDF-Test");
  await page.getByRole("button", { name: /Export/ }).click();
  await page.getByText("PDF-Plan maßstäblich").click();
  await page.getByRole("dialog").locator("select").nth(0).selectOption("A4");
  await page.getByRole("dialog").locator("select").nth(2).selectOption("100");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("pdf-export").click()]);
  const path = "test-results/plan.pdf";
  await dl.saveAs(path);
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.load(readFileSync(path));
  const { width, height } = doc.getPage(0).getSize();
  // A4 landscape in points
  expect(width).toBeCloseTo((297 * 72) / 25.4, 0);
  expect(height).toBeCloseTo((210 * 72) / 25.4, 0);
});

test("DXF export can be imported again and walls derived from it", async ({ page }) => {
  await newProject(page, "Beispielwohnung", "DXF-Quelle");
  await page.getByRole("button", { name: /Export/ }).click();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByText("DXF für CAD (mm)").click()]);
  const path = "test-results/plan.dxf";
  await dl.saveAs(path);
  expect(readFileSync(path, "utf8")).toContain("WAENDE");

  await page.goto("/");
  await page.getByTestId("new-project").click();
  await page.getByTestId("project-name").fill("DXF-Import");
  await page.getByText("Leerer Grundriss", { exact: true }).click();
  await page.getByTestId("create-project").click();
  await expect(page.getByTestId("plan-canvas")).toBeVisible();
  await page.getByTestId("import-button").click();
  await page.getByTestId("import-file").setInputFiles(path);
  await expect(page.getByText("Maßstäblich aus DXF in mm")).toBeVisible();
  await page.getByTestId("derive-walls").click();
  await expect(page.getByText(/Wände und \d+ Öffnungen aus der Zeichnung abgeleitet/)).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: "test-results/dxf-derived.png" });
  expect(await page.locator('[data-kind="room"]').count()).toBeGreaterThanOrEqual(5);
});

test("DWG files get a conversion hint", async ({ page }) => {
  await newProject(page, "Leerer Grundriss");
  await page.getByTestId("import-button").click();
  await page
    .getByTestId("import-file")
    .setInputFiles({ name: "plan.dwg", mimeType: "application/octet-stream", buffer: Buffer.from("AC1032") });
  await expect(page.getByText(/DWG-Dateien können nicht direkt gelesen werden/)).toBeVisible();
});

test("furniture top views come from the cache after a reload", async ({ page }) => {
  test.setTimeout(120000);
  await newProject(page, "Beispielwohnung", "Cache");
  await page.getByRole("button", { name: "Alle Räume einrichten" }).click();
  await page.getByTestId("presentation-toggle").click();
  const stats = () =>
    page.evaluate(
      () => (window as unknown as { __raisSprites: { rendered: number; fromCache: number } }).__raisSprites,
    );
  await expect.poll(async () => (await stats()).rendered, { timeout: 60000 }).toBeGreaterThan(10);
  // let the queue finish and the cache writes land
  let last = -1;
  await expect
    .poll(
      async () => {
        const n = (await stats()).rendered;
        const stable = n === last;
        last = n;
        return stable;
      },
      { timeout: 60000, intervals: [1500] },
    )
    .toBe(true);
  await expect(page.getByText("Gespeichert")).toBeVisible({ timeout: 10000 });
  await page.reload();
  await expect(page.getByTestId("plan-canvas")).toBeVisible();
  await page.getByTestId("presentation-toggle").click();
  await expect.poll(async () => (await stats()).fromCache, { timeout: 30000 }).toBeGreaterThan(10);
  await page.waitForTimeout(1500);
  expect((await stats()).rendered).toBe(0);
  await page.getByTestId("intro").getByText("Verstanden").click();
  await page.screenshot({ path: "test-results/wohnkueche-staging.png" });
});

test("photoreal image (path tracing) is rendered and downloaded", async ({ page }) => {
  test.setTimeout(300000);
  await newProject(page, "Beispielwohnung", "Foto");
  await page.getByRole("button", { name: "Alle Räume einrichten" }).click();
  await page.getByTestId("view-3d").click();
  await expect(page.getByTestId("scene-3d")).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.getByRole("button", { name: /Export/ }).click();
  await page.getByText("Fotorealistisches Bild (Pathtracing)").click();
  const dialog = page.getByRole("dialog", { name: "Fotorealistisches Bild" });
  await dialog.locator("select").nth(0).selectOption("klein");
  await dialog.locator("select").nth(1).selectOption("entwurf");
  await page.getByTestId("photo-start").click();
  // software WebGL in CI is slow: save the image after the first full pass ("Jetzt speichern")
  const save = dialog.getByRole("button", { name: "Jetzt speichern" });
  const fallback = page.waitForEvent("download", { timeout: 240000 });
  const saved = expect(save)
    .toBeEnabled({ timeout: 240000 })
    .then(() => Promise.all([page.waitForEvent("download"), save.click()]).then(([d]) => d));
  const dl = await Promise.race([saved, fallback]);
  const name = dl.suggestedFilename();
  console.log("photo download:", name);
  expect(name).toMatch(/_(foto|3d)_1280\.png$/);
  const path = `test-results/${name}`;
  await dl.saveAs(path);
  const png = readFileSync(path);
  // PNG header: width at byte 16
  expect(png.readUInt32BE(16)).toBe(1280);
});

test("without WebGL the plan still works and 3D explains why", async ({ browser }) => {
  const project = JSON.parse(readFileSync("tests/fixtures/share-project.json", "utf8"));
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type === "webgl" || type === "webgl2") return null;
      return (orig as (...a: unknown[]) => RenderingContext | null).call(this, type, ...rest);
    } as typeof orig;
  });
  const page = await ctx.newPage();
  const logged: string[] = [];
  await page.route("**/api/share/no-webgl", (r) => r.fulfill({ json: { project } }));
  await page.route("**/api/log", (r) => {
    logged.push(r.request().postData() ?? "");
    return r.fulfill({ status: 204 });
  });
  await page.goto("/teilen/no-webgl");
  await expect(page.getByTestId("plan-canvas")).toBeVisible();
  await expect(page.getByText("3D ist in diesem Browser nicht verfügbar")).toBeVisible();
  await expect.poll(() => logged.some((l) => l.includes('"webgl"'))).toBe(true);
  await ctx.close();
});

test("client errors can be logged without login and are validated", async ({ request }) => {
  expect((await request.post("/api/log", { data: { kind: "error", message: "Test" } })).status()).toBe(204);
  expect((await request.post("/api/log", { data: { kind: "spam" } })).status()).toBe(400);
});
