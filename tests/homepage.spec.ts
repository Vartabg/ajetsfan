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
    const article = page.locator("main article");
    await expect(article).toContainText(`Latest final · Week ${latest.week}`);
    await expect(article).toContainText(`Jets ${latest.jetsScore}, ${latest.opponentDisplay} ${latest.oppScore}`);
    await expect(article.locator(`time[datetime="${latest.date}"]`)).toBeVisible();
  } else {
    await expect(page.locator("main")).toContainText("From the archive");
  }
  const summary = currentSeasonSummary(snapshot);
  const season = page.getByRole("region", { name: `The ${snapshot.season} season` });
  await expect(season).toContainText(`${summary.wins}–${summary.losses}${summary.ties ? `–${summary.ties}` : ""}`);
  const next = nextScheduledGame(snapshot);
  if (next) await expect(season).toContainText(`Jets ${next.game.atHome ? "vs" : "at"} ${next.game.opponentDisplay}`);
  await expect(page.getByRole("region", { name: "Data freshness" }).locator("time")).toHaveAttribute("datetime", snapshot.checkedAt);
  await expect(page.locator("footer")).toContainText(`holds ${games.length} games`);
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

test("the front page keeps deeper analysis available through keyboard disclosures", async ({ page }) => {
  await page.goto("/");
  const film = page.locator("details").filter({ has: page.locator("summary").filter({ hasText: "Open the film room" }) });
  await expect(film).not.toHaveAttribute("open", "");
  await film.locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  await expect(film).toHaveAttribute("open", "");
  await expect(film.getByText("The season in margins.", { exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(film).not.toHaveAttribute("open", "");
});

test("a stale static edition warns the reader after the updater stops", async ({ page }) => {
  await page.clock.install({ time: new Date(Date.parse(snapshot.checkedAt) + 3 * 24 * 60 * 60_000) });
  await page.goto("/");
  await expect(page.getByRole("status", { name: "Results update status" })).toContainText("Update overdue.");
  await expect(page.getByRole("status", { name: "Results update status" })).toContainText("newer results may be missing");
});
