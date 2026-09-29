import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { SeasonAnalytics } from "../src/lib/analytics";
import type { CurrentSnapshot } from "../src/lib/current";
import { nextScheduledGame } from "../src/lib/current";

const data = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/analytics.json"), "utf8")) as SeasonAnalytics;
const current = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/current.json"), "utf8")) as CurrentSnapshot;

test("the matchup compares the scheduled opponent using the published analysis cutoff", async ({ page }) => {
  const fixture = nextScheduledGame(current);
  test.skip(!fixture, "No remaining scheduled fixture");
  await page.goto("/");
  const table = page.getByRole("table", { name: `Current-season efficiency comparison: Jets versus ${fixture!.game.opponentDisplay}` });
  const jets = data.teams.find((team) => team.team === "NYJ");
  const opponent = data.teams.find((team) => team.team === fixture!.game.opponent);
  if (data.season !== current.season || !jets?.completedGames || !opponent?.completedGames || !jets.offense.plays || !opponent.offense.plays) {
    await expect(table).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Know the matchup." })).toContainText("Team efficiency will appear here");
    return;
  }
  await expect(table).toBeVisible();
  const offense = table.getByRole("row", { name: /Offense EPA \/ play/ });
  await expect(offense.getByRole("cell").nth(0)).toContainText(jets.offense.epaPerPlay!.toFixed(2));
  await expect(offense.getByRole("cell").nth(1)).toContainText(opponent.offense.epaPerPlay!.toFixed(2));
  const defense = table.getByRole("row", { name: /Defense EPA allowed/ });
  await expect(defense).toContainText("Lower is better");
  await expect(defense.getByRole("cell").nth(0)).toContainText(`#${jets.ranks.defenseEpa} in league`);
  await expect(page.getByRole("region", { name: "Know the matchup." })).toContainText(`through Week ${data.throughWeek}`);
});

test("the full schedule opens by keyboard and includes every current regular-season fixture", async ({ page }) => {
  await page.goto("/");
  const summary = page.locator("summary").filter({ hasText: `See the full ${current.season} schedule` });
  await summary.focus();
  await page.keyboard.press("Enter");
  const schedule = page.locator("details[open] ol");
  await expect(schedule.locator("li")).toHaveCount(current.schedule.filter((game) => game.seasonType === "REG").length);
  const final = current.schedule.filter((game) => game.seasonType === "REG").at(-1)!;
  await expect(schedule).toContainText(`${final.atHome ? "vs" : "at"} ${final.opponentDisplay}`);
});
