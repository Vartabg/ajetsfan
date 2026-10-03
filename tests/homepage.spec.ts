import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { CurrentSnapshot } from "../src/lib/current";
import type { Game } from "../src/lib/games";
import { completedGames, currentSeasonSummary, nextScheduledGame } from "../src/lib/current";

const snapshot = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/current.json"), "utf8")) as CurrentSnapshot;
const games = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/games.json"), "utf8")) as Game[];

test("the front page follows the latest confirmed final and current season", async ({ page }) => {
  await page.goto("/");
  const latest = completedGames(snapshot).filter((game) => game.season === snapshot.season).at(-1);
  if (latest) {
    const article = page.locator("#latest-game");
    await expect(article).toContainText(`Latest final · Week ${latest.week}`);
    await expect(article).toContainText(`Jets ${latest.jetsScore}, ${latest.opponentDisplay} ${latest.oppScore}`);
    await expect(article.getByLabel(`Final score: Jets ${latest.jetsScore}, ${latest.opponentDisplay} ${latest.oppScore}`, { exact: true }).locator(`time[datetime="${latest.date}"]`)).toBeVisible();
  } else {
    await expect(page.locator("main")).toContainText("From the archive");
  }
  const summary = currentSeasonSummary(snapshot);
  const season = page.getByRole("region", { name: `The ${snapshot.season} season` });
  await expect(season).toContainText(`${summary.wins}–${summary.losses}${summary.ties ? `–${summary.ties}` : ""}`);
  const next = nextScheduledGame(snapshot);
  if (next) await expect(season).toContainText(`Jets ${next.game.atHome ? "vs" : "at"} ${next.game.opponentDisplay}`);
  await expect(page.getByRole("region", { name: "Data freshness" }).locator("time")).toHaveAttribute("datetime", snapshot.checkedAt);
  await expect(page.getByRole("contentinfo")).toContainText(`holds ${games.length} games`);
});

for (const width of [1280, 390, 320]) {
  test(`current front page reflows and passes automated accessibility at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: unknown[] }> } }).axe;
      return (await axe.run({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations;
    });
    expect(violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator("main")).toHaveCount(1);
  });
}

test("the front page has clear destinations without mounting every experience", async ({ page }) => {
  await page.goto("/");
  const doors = page.getByRole("region", { name: "Explore Jets reporting and seasons" });
  expect(await doors.locator("a").evaluateAll((links) => links.map((link) => link.getAttribute("href")))).toEqual(["/media", "/seasons", "/film-room", "/morgue"]);
  await expect(page.locator("main details, [data-home-disclosure], #visual-story, #fan-stand, #game-evidence")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Read the game report" })).toHaveAttribute("href", /^\/games\//);
  await expect(page.locator('main a[href="/game-day"]')).toBeVisible();
  await expect(page.locator('main a[href="/stories"]')).toBeVisible();
  await expect(page.locator('main a[href="/history"]')).toBeVisible();
});

test("old section bookmarks open the new destination and preserve unrelated URL state", async ({ page }) => {
  for (const [hash, path, target] of [
    ["postgame", "/games/", "#game-report-heading"],
    ["game-evidence", "/games/", "#game-evidence"],
    ["sunday-briefing", "/game-day", "#sunday-briefing"],
    ["visual-story", "/stories", "#visual-story"],
    ["fan-stand", "/history", "#fan-stand"],
    ["remembered-cases", "/history", "#remembered-cases"],
    ["rivalry-desk", "/history", "#rivalry-desk"],
  ]) {
    await page.goto(`/?keep=orientation#${hash}`);
    await expect.poll(() => new URL(page.url()).pathname).toContain(path);
    await expect(page.locator(target)).toBeVisible();
    expect(new URL(page.url()).searchParams.get("keep")).toBe("orientation");
    expect(new URL(page.url()).hash).toBe(target);
  }
});

test("front-page destinations reflow at 320px with 200% text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/");
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  for (const link of await page.locator('main a[href="/game-day"], main a[href="/team"], main a[href="/stories"], main a[href="/history"]').all()) {
    const rect = await link.boundingBox();
    expect(rect!.width).toBeGreaterThanOrEqual(44);
    expect(rect!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("page exploration still works with JavaScript disabled", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("link", { name: "Read the game report" }).click();
  await expect(page).toHaveURL(/\/games\//);
  await expect(page.locator("#game-report-heading")).toBeVisible();
  await page.goto("/game-day");
  const schedule = page.locator("details").filter({ has: page.locator("summary").filter({ hasText: "See the full" }) });
  await schedule.locator("summary").click();
  await expect(schedule.locator("ol")).toBeVisible();
  await context.close();
});

test("a stale static edition warns the reader after the updater stops", async ({ page }) => {
  await page.clock.install({ time: new Date(Date.parse(snapshot.checkedAt) + 3 * 24 * 60 * 60_000) });
  await page.goto("/");
  await expect(page.getByRole("status", { name: "Results update status" })).toContainText("Update overdue.");
  await expect(page.getByRole("status", { name: "Results update status" })).toContainText("newer results may be missing");
});
