import { test, expect } from "@playwright/test";
import { focusOf, historyFor, lineText, playText, sumLines, type PlayerSeasonFile } from "../src/lib/player-history";

const file = (season: number, games: PlayerSeasonFile["players"][string]["games"], plays: PlayerSeasonFile["players"][string]["plays"] = []): PlayerSeasonFile =>
  ({ schemaVersion: 1, season, source: `s${season}`, checkedAt: `${season}-12-31T00:00:00.000Z`, players: { "00-0037740": { name: "Garrett Wilson", short: "G.Wilson", position: "WR", games, plays } } });

test("a history adds each Jets season, keeps the latest season's games and the three biggest plays overall", () => {
  const history = historyFor("00-0037740", [
    file(2026, [{ week: 1, gameId: "2026_01_NYJ_TEN", post: false, opponent: "TEN", rec: [6, 9, 88, 1] }, { week: 2, gameId: "2026_02_GB_NYJ", post: false, opponent: "GB", rec: [3, 5, 40, 0] }],
      [{ gameId: "2026_02_GB_NYJ", playId: 7, q: 4, d: 0.2, desc: "pass to 5-G.Wilson" }]),
    file(2025, [{ week: 3, gameId: "2025_03_NYJ_MIA", post: false, opponent: "MIA", rec: [9, 12, 120, 2], rush: [1, 5, 0] }],
      [{ gameId: "2025_03_NYJ_MIA", playId: 1, q: 1, d: 0.05, desc: "a" }, { gameId: "2025_03_NYJ_MIA", playId: 2, q: 2, d: 0.3, desc: "b" }, { gameId: "2025_03_NYJ_MIA", playId: 3, q: 3, d: 0.1, desc: "c" }]),
  ])!;
  expect(history.seasons.map((season) => [season.season, season.games, season.totals.rec])).toEqual([[2025, 1, [9, 12, 120, 2]], [2026, 2, [9, 14, 128, 1]]]);
  expect(history.latest?.season).toBe(2026);
  expect(history.plays.map((play) => [play.season, play.playId, play.week])).toEqual([[2025, 2, 3], [2026, 7, 2], [2025, 3, 3]]);
  expect(historyFor("00-0000000", [file(2026, [])])).toBeNull();
});

test("the bars measure what the player does: passing, tackles, or the larger yards", () => {
  expect(focusOf({ pass: [20, 30, 250, 2, 0], rush: [4, 30, 0] })?.unit).toBe("passing yards");
  expect(focusOf({ def: [40, 2, 1, 5, 0] })?.unit).toBe("tackles");
  expect(focusOf({ rush: [100, 450, 3], rec: [20, 30, 160, 1] })?.unit).toBe("rushing yards");
  expect(focusOf({ rush: [2, 10, 0], rec: [60, 90, 800, 5] })?.unit).toBe("receiving yards");
  expect(focusOf({})).toBeNull();
  expect(sumLines([{ def: [3, 0.5, 0, 0, 0] }, { def: [2, 1, 1, 0, 0] }]).def).toEqual([5, 1.5, 1, 0, 0]);
});

test("lines and plays read as words", () => {
  expect(lineText({ pass: [19, 24, 215, 1, 0], rush: [3, 12, 0] })).toBe("19 of 24 passing, 215 yards, 1 TD · 3 carries, 12 yards");
  expect(lineText({ rec: [6, 9, 1088, 1] })).toBe("6 catches on 9 targets, 1,088 yards, 1 TD");
  expect(lineText({ def: [1, 0.5, 1, 2, 1] })).toBe("1 tackle, 0.5 sacks, 1 INT, 2 passes defended, 1 forced fumble");
  expect(lineText({ def: [0, 0, 0, 1, 0] })).toBe("1 pass defended");
  expect(playText("(4:11) (Shotgun) 7-G.Smith pass deep right to 5-G.Wilson to DET 1 for 22 yards.")).toBe("7-G.Smith pass deep right to 5-G.Wilson to DET 1 for 22 yards.");
  expect(playText(`(:04) ${"word ".repeat(60)}`).endsWith("…")).toBe(true);
});

test("a player page shows the season game by game, the career as a Jet and the biggest plays", async ({ page }) => {
  await page.goto("/players/00-0037740");
  const ids = await page.locator("[data-focus-moment]").evaluateAll((moments) => moments.map((moment) => moment.id));
  test.skip(!ids.includes("player"), "Garrett Wilson is not on this edition's roster.");
  expect(ids.slice(0, 4)).toEqual(["player", "profile-games", "profile-career", "profile-plays"]);
  await expect(page.locator("#profile-games-heading")).toContainText("receiving yards");
  await expect(page.locator("#profile-games li").first()).toContainText("Week 1");
  await expect(page.locator("#profile-career li a").first()).toHaveAttribute("href", "/seasons/2022");
  await expect(page.locator("#profile-plays li")).toHaveCount(3);
  await expect(page.locator("#profile-plays-heading")).toContainText("win chance");
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
