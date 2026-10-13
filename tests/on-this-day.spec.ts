import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { etDay } from "../src/lib/focus-format";
import type { LeagueHistory } from "../src/lib/league-history";
import { onThisDay } from "../src/lib/on-this-day";

const history = JSON.parse(readFileSync(path.join(process.cwd(), "public", "data", "league-history.json"), "utf8")) as LeagueHistory;
const game = (id: string) => history.games.find((entry) => entry.id === id)!;

test("earlier Jets games on the same date, newest first, with a published case linked and today's own game left out", () => {
  const day = onThisDay(history.games, "2026-10-13", new Set(["2019_06_DAL_NYJ"]))!;
  expect(day.day).toBe("Oct 13");
  expect(day.games.map((entry) => [entry.year, entry.opponent, entry.outcome])).toEqual([[2019, "Dallas", "win"], [2013, "Pittsburgh", "loss"]]);
  expect([day.wins, day.losses, day.from, day.to]).toEqual([1, 1, 1999, 2025]);
  expect(day.games[0].href).toBe("/games/2019_06_DAL_NYJ");
  expect(day.games[1].href).toBe("/seasons/2013");
  const played = game("2026_05_CLE_NYJ");
  expect(onThisDay(history.games, played.date, new Set())?.games.some((entry) => entry.id === played.id) ?? false).toBe(false);
});

test("an offseason date has no moment, and January dates start with the 2000 calendar year", () => {
  expect(onThisDay(history.games, "2026-06-15", new Set())).toBeNull();
  const january = history.games.find((entry) => entry.status === "final" && entry.date.slice(5, 7) === "01")!;
  expect(onThisDay(history.games, `2027-${january.date.slice(5)}`, new Set())?.from).toBe(2000);
});

test("the home page shows today's date in Jets history when there is one", async ({ page }) => {
  const expected = onThisDay(history.games, etDay(Date.now()), new Set());
  await page.goto("/");
  const moment = page.locator("#today");
  if (!expected) return expect(moment).toHaveCount(0);
  await expect(moment).toContainText(`On this day · ${expected.day}`);
  await expect(moment.locator("ul li")).toHaveCount(expected.games.length);
  await expect(moment.locator("ul li a").first()).toHaveAttribute("href", /^\/(games|seasons)\//);
});
