import { test, expect } from "@playwright/test";
import path from "node:path";

test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: "reduce" }); });

test("season directory links the 2010 playoff run and marks earlier coverage as selected", async ({ page }) => {
  await page.goto("/seasons");
  await page.getByRole("link", { name: "Explore the playoff run", exact: false }).click();
  await expect(page).toHaveURL(/\/seasons\/2010\?phase=playoffs$/);
  await expect(page.locator("[data-season-archive]")).toHaveAttribute("data-season-phase", "playoffs");
  await expect(page.locator("[data-season-record]")).toHaveText("2–1");
  await expect(page.locator("[data-season-game]")).toHaveCount(3);
  await expect(page.locator("[data-season-game='2010_19_NYJ_NE']")).toContainText("Jan 16, 2011");
  await expect(page.locator("[data-season-media]")).toHaveCount(2);
  await expect(page.getByRole("navigation", { name: "Site sections" }).locator('[aria-current="page"]')).toHaveAttribute("href", "/seasons");
  await page.goto("/seasons/1968?phase=playoffs");
  await expect(page.locator("[data-season-record]")).toHaveText("—");
  await expect(page.locator("[data-season-game]")).toHaveCount(0);
  await expect(page.locator("[data-season-fact='super-bowl-iii']")).toContainText("January 12, 1969");
  await expect(page.getByText("Full season results, player totals and play-by-play are not in this archive yet.", { exact: false })).toBeVisible();
});

test("phase and search retain football-season totals, shareable URLs and browser history", async ({ page }) => {
  await page.goto("/seasons/2010?keep=source#main");
  const archive = page.locator("[data-season-archive]");
  await archive.locator('[data-season-scope="regular"]').click();
  await expect(archive.locator("[data-season-record]")).toHaveText("11–5");
  await expect(archive.locator("[data-season-game]")).toHaveCount(16);
  await archive.locator('[data-season-scope="playoffs"]').click();
  await expect(archive.locator("[data-season-record]")).toHaveText("2–1");
  await archive.locator("[data-season-search]").fill("NE");
  await expect(archive.locator("[data-season-game]")).toHaveCount(1);
  await expect(archive.locator("[data-season-record]")).toHaveText("2–1");
  expect(new URL(page.url()).searchParams.get("keep")).toBe("source");
  expect(new URL(page.url()).hash).toBe("#main");
  await page.reload();
  await expect(archive.locator("[data-season-search]")).toHaveValue("NE");
  await expect(archive.locator("[data-season-game]")).toHaveCount(1);
  await page.goBack();
  await expect(archive).toHaveAttribute("data-season-phase", "regular");
  await expect(archive.locator("[data-season-game]")).toHaveCount(16);
});

test("year selection preserves the requested phase and does not attach today's player statistics", async ({ page }) => {
  await page.goto("/seasons/2010?phase=playoffs");
  await page.locator("[data-season-year]").selectOption("2002");
  await expect(page).toHaveURL(/\/seasons\/2002\?phase=playoffs$/);
  await expect(page.locator("[data-season-record]")).toHaveText("1–1");
  await expect(page.locator("[data-season-game]")).toHaveCount(2);
  await expect(page.locator("[data-season-fact='2002_18_IND_NYJ']")).toContainText("Chad Pennington");
  await expect(page.getByRole("link", { name: "Current-season player statistics", exact: false })).toHaveCount(0);
});

test("game evidence and the historical reporting open their exact destinations", async ({ page }) => {
  await page.goto("/seasons/2010?phase=playoffs");
  await page.locator('[data-season-case="2010_19_NYJ_NE"]').click();
  await expect(page).toHaveURL(/\/games\/2010_19_NYJ_NE$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goBack();
  await page.locator('[data-season-media="espn-2010-divisional-rapid-reaction"] h3 a').click();
  await expect(page.locator("[data-media-room]")).toHaveAttribute("data-media-selected", "espn-2010-divisional-rapid-reaction");
  await expect(page.locator("[data-media-season]")).toHaveValue("2010");
});

test("unavailable years return 404 while a no-JavaScript visit retains the season evidence", async ({ browser, request }) => {
  for (const year of ["1960", "2050", "02010", "bad-year"]) expect((await request.get(`/seasons/${year}`)).status()).toBe(404);
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:" + (process.env.PORT ?? "3107") + "/seasons/2010");
  await expect(page.locator("[data-season-game]")).toHaveCount(19);
  await expect(page.locator("[data-season-case='2010_19_NYJ_NE']")).toHaveAttribute("href", "/games/2010_19_NYJ_NE");
  await expect(page.locator("[data-season-media]")).toHaveCount(2);
  await context.close();
});

test("season share cards render the selected year's image and unavailable years remain 404", async ({ page, request }) => {
  await page.goto("/seasons/2010");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /2010 Jets Season/);
  const image = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(image).toContain("/seasons/2010/opengraph-image");
  for (const year of ["2010", "1968"]) {
    const response = await request.get(`/seasons/${year}/opengraph-image`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    const bytes = await response.body();
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(bytes.readUInt32BE(16)).toBe(1200);
    expect(bytes.readUInt32BE(20)).toBe(630);
  }
  expect((await request.get("/seasons/2050/opengraph-image")).status()).toBe(404);
});

test("narrow season controls preserve 44px targets, readable evidence and accessible states at 200% text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto("/seasons/2010?phase=playoffs");
  await page.addStyleTag({ content: "html{font-size:200%!important}body{font-size:32px!important}" });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("[data-season-game]")).toHaveCount(3);
  for (const control of await page.locator("[data-season-scope], [data-season-search], [data-season-year], [data-season-case]").all()) {
    const box = await control.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44); expect(box?.width).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
  const violations = await page.evaluate(async () => (await (window as unknown as { axe: { run: (node: Document, options: unknown) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations);
  expect(violations).toEqual([]);
});
