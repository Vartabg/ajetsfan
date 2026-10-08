import { test, expect } from "@playwright/test";
import path from "node:path";

test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: "reduce" }); });

test("Seasons is a focus page: every year as its record, the 2010 run, then the best and worst", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto("/seasons");
  await expect(page.locator("#top")).toHaveCount(0);
  const ids = await page.locator("[data-focus-moment]").evaluateAll((moments) => moments.map((moment) => moment.id));
  expect(ids).toEqual(["years", "run", "extremes", "more"]);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Pick one.");
  const years = page.locator("#years li a");
  expect(await years.count()).toBeGreaterThan(20);
  await expect(page.locator('#years a[data-archive-year="2010"]')).toContainText("11–5, 2–1 playoffs");
  await expect(page.locator("#run h2")).toContainText("Won at Indianapolis, won at New England, lost at Pittsburgh.");
  await expect(page.getByRole("navigation", { name: "Site sections" }).locator('[aria-current="page"]')).toHaveAttribute("href", "/seasons");
  await page.locator('#years a[data-archive-year="2010"]').click();
  await expect(page).toHaveURL(/\/seasons\/2010$/);
});

for (const width of [1280, 390, 320]) {
  test(`Seasons passes automated accessibility and reflows at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/seasons");
    await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: { id: string }[] }> } }).axe;
      return (await axe.run({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations.map((violation) => violation.id);
    });
    expect(violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("Seasons reflows at 320px with 200% text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/seasons");
  await page.addStyleTag({ content: "html { font-size: 200% !important; } body { font-size: 32px !important; }" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Each season page wears the green the Jets wore that year", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  for (const [year, era, green] of [["1968", "Kelly green", "#007A3D"], ["1986", "Sack Exchange green", "#046A38"], ["2010", "Hunter green", "#003F2D"], ["2026", "Legacy green", "#125740"]]) {
    await page.goto(`/seasons/${year}`);
    await expect(page.locator("#year p").first()).toContainText(era);
    expect(await page.locator('[data-focus-page="season"]').evaluate((node) => getComputedStyle(node).getPropertyValue("--forest").trim())).toBe(green);
  }
});

test("A season page is a focus page: the record, the best and worst day, a moment to remember, then every game", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/seasons/2010");
  await expect(page.locator("#top")).toHaveCount(0);
  const ids = await page.locator("[data-focus-moment]").evaluateAll((moments) => moments.map((moment) => moment.id));
  expect(ids).toEqual(["year", "swing", "moment", "explore", "more"]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("11–5. 2–1 in the playoffs.");
  await expect(page.locator("#explore [data-focus-tools] [data-season-archive]")).toHaveAttribute("data-season-archive", "2010");
  await page.goto("/seasons/1968");
  expect(await page.locator("[data-focus-moment]").evaluateAll((moments) => moments.map((moment) => moment.id))).toEqual(["year", "moment", "explore", "more"]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("1968. Selected moments.");
});
