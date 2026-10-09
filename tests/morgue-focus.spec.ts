import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pct, rank, type Game } from "../src/lib/games";

const games = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/games.json"), "utf8")) as Game[];
const [loss] = rank(games, "heartbreak");
const [win] = rank(games, "miracle");

async function axe(page: Page) {
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
  return page.evaluate(async () => {
    const run = (window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: { id: string }[] }> } }).axe;
    return (await run.run({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations.map((violation) => violation.id);
  });
}

test.describe("the game archive", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("says what it is, then leads with the top-ranked loss and win before the full archive", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/morgue");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${games.length} Jets games, on the record.`);
    await expect(page.getByRole("navigation", { name: "On this page" }).getByRole("link")).toHaveText([/Game archive/, /Hardest loss/, /Unlikeliest win/, /Classic cases/, /Find a game/, /Everything else/]);
    await expect(page.locator("#hardest-loss-heading")).toContainText(`${loss.jetsScore}–${loss.oppScore}`);
    await expect(page.locator("#hardest-loss-heading")).toContainText(pct(loss.swing));
    await expect(page.locator("#unlikeliest-win-heading")).toContainText(`${win.jetsScore}–${win.oppScore}`);
    await expect(page.locator("#unlikeliest-win-heading")).toContainText(pct(win.swing));
    await expect(page.locator("#find").getByRole("region", { name: "Game explorer" })).toHaveCount(1);
    await expect(page.locator("body > header, body > footer")).toHaveCount(0);
  });

  for (const width of [1280, 390, 320]) {
    test(`passes automated accessibility and reflows at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/morgue");
      expect(await axe(page)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }

  test("reflows at 320px with 200% text", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/morgue");
    await page.addStyleTag({ content: "html { font-size: 200% !important; } body { font-size: 32px !important; }" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
