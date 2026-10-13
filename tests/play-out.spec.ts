import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { seasonWeeks } from "../src/lib/focus";
import type { CurrentSnapshot } from "../src/lib/current";
import { playoffSentence, type LeagueHistory } from "../src/lib/league-history";

const data = (file: string) => JSON.parse(readFileSync(path.join(process.cwd(), "public", "data", file), "utf8"));
const snapshot = data("current.json") as CurrentSnapshot;
const history = data("league-history.json") as LeagueHistory;
const season = seasonWeeks(snapshot)!;
const open = season.weeks.filter((week) => week.state === "next" || week.state === "upcoming");

test("the playoff sentence states counts, including all, none and no such club", () => {
  const rows = [{ wins: 7, clubs: 17, playoffs: 0 }, { wins: 9, clubs: 23, playoffs: 9 }, { wins: 11, clubs: 12, playoffs: 12 }];
  expect(playoffSentence(rows, [2021, 2025], 9)).toBe("9 of the 23 clubs that won 9 games since 2021 made the playoffs.");
  expect(playoffSentence(rows, [2021, 2025], 11)).toBe("Every club that won 11 games since 2021 made the playoffs (12 of 12).");
  expect(playoffSentence(rows, [2021, 2025], 7)).toBe("None of the 17 clubs that won 7 games since 2021 made the playoffs.");
  expect(playoffSentence(rows, [2021, 2025], 1)).toBe("No club has won exactly 1 game since 2021.");
});

test("picking every remaining game gives a final record and the playoff count; picks survive a reload and clear", async ({ page }) => {
  await page.goto("/game-day");
  const moment = page.locator("#play-out");
  if (!open.length) return expect(moment).toHaveCount(0);
  const picks = moment.getByRole("button", { name: /Change pick/ });
  await expect(picks).toHaveCount(open.length);
  for (const name of open.map((week) => new RegExp(`^Week ${week.week},`))) await moment.getByRole("button", { name }).click();
  const wins = season.wins + open.length;
  const final = `${wins}–${season.losses}${season.ties ? `–${season.ties}` : ""}`;
  await expect(moment.getByRole("heading")).toHaveText(`${final} is your final record.`);
  await expect(moment.getByRole("status")).toHaveText(playoffSentence(history.playoffsByWins.rows, history.playoffsByWins.seasons, wins));
  await page.reload();
  await expect(page.locator("#play-out").getByRole("heading")).toHaveText(`${final} is your final record.`);
  await page.locator("#play-out").getByRole("button", { name: "Clear my picks" }).click();
  await expect(page.locator("#play-out").getByRole("heading")).toContainText("Play out the season.");
});
