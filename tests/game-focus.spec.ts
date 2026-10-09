import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { CurrentSnapshot } from "../src/lib/current";
import type { Game } from "../src/lib/games";
import { publishedGames } from "../src/lib/published-pages";

const current = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/current.json"), "utf8")) as CurrentSnapshot;
const games = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/games.json"), "utf8")) as Game[];
const published = publishedGames(games, current);
// A current game with a photograph, replays and measured offenses, and an archive game with none of them.
const recent = published.find((game) => game.id === "2026_03_NYJ_DET")!;
const archive = published.find((game) => game.id === "2010_02_NE_NYJ")!;

async function axe(page: Page) {
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
  return page.evaluate(async () => {
    const run = (window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: { id: string }[] }> } }).axe;
    return (await run.run({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations.map((violation) => violation.id);
  });
}

test.describe("a game page", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("opens on the final score and gives each part of the game its own screen", async ({ page }) => {
    expect(recent, "2026_03_NYJ_DET is published").toBeTruthy();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/games/${recent.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${recent.outcome === "win" ? "Won" : "Lost"} ${recent.jetsScore}–${recent.oppScore} at Detroit.`);
    await expect(page.locator("[data-focus-moment]")).toHaveCount(6);
    const index = page.getByRole("navigation", { name: "On this page" });
    await expect(index.getByRole("link")).toHaveText([/Final/, /Summary|The account/, /Win chance/, /Featured play/, /Both offenses/, /Everything else/]);
    // The old masthead gives way to the page's own frame; the site's sections sit in the last moment.
    await expect(page.locator("body > header, body > footer")).toHaveCount(0);
    await expect(page.locator("#more").getByRole("navigation", { name: "Site sections" })).toHaveCount(1);
    await expect(page.locator("#game-replays-heading")).toHaveText("Watch it back.");
    await expect(page.locator("#numbers #game-evidence")).toHaveCount(1);
  });

  test("leaves out the parts an archive game does not have", async ({ page }) => {
    expect(archive, "2010_02_NE_NYJ is published").toBeTruthy();
    await page.goto(`/games/${archive.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(`${archive.jetsScore}–${archive.oppScore}`);
    await expect(page.locator("#final figure")).toHaveCount(0);
    await expect(page.locator(`#final time[datetime="${archive.date}"]`)).toHaveCount(1);
    await expect(page.locator("#numbers")).toHaveCount(0);
    await expect(page.locator("#play").getByText("About this analysis", { exact: true })).toHaveCount(1);
  });

  for (const width of [1280, 390, 320]) {
    test(`passes automated accessibility and reflows at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/games/${recent.id}`);
      expect(await axe(page)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }

  test("reflows at 320px with 200% text", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(`/games/${recent.id}`);
    await page.addStyleTag({ content: "html { font-size: 200% !important; } body { font-size: 32px !important; }" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
