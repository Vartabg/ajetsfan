import { test, expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { SeasonAnalytics, TeamAnalytics } from "../src/lib/analytics";
import type { CurrentSnapshot } from "../src/lib/current";
import { nextScheduledGame } from "../src/lib/current";

const analytics = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/analytics.json"), "utf8")) as SeasonAnalytics;
const current = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/current.json"), "utf8")) as CurrentSnapshot;
const next = nextScheduledGame(current);
const jets = analytics.teams.find((team) => team.team === "NYJ");
const label = (value: number) => `${Number(value.toFixed(3)) > 0 ? "+" : ""}${Number(value.toFixed(3)).toFixed(3)}`;
const eligible = (side: "offense" | "defense") => analytics.teams.filter((team) => team.completedGames > 0 && team[side].plays > 0 && team[side].epaPerPlay != null && Number.isFinite(team[side].epaPerPlay));
const row = (figure: Locator, team: string) => figure.locator("dl > div").filter({ hasText: new RegExp(`^${team}`) });

async function openLeague(page: Page) {
  test.skip(analytics.season !== current.season || !jets || !eligible("offense").length, "This edition has no current-season league sample.");
  await page.goto("/game-day");
  const summary = page.locator("summary").filter({ hasText: "Open league and unit comparisons" });
  await summary.focus();
  await page.keyboard.press("Enter");
  const league = page.getByRole("region", { name: "Where the Jets sit." });
  await expect(league).toBeVisible();
  return league;
}

test("the league view reports pooled play baselines, each unit's own sample, and the analysis cutoff", async ({ page }) => {
  const league = await openLeague(page);
  for (const side of ["offense", "defense"] as const) {
    const title = side === "offense" ? "Offense EPA / play league comparison" : "Defense EPA allowed / play league comparison";
    const figure = league.getByRole("figure", { name: title, exact: true });
    const teams = eligible(side);
    const plays = teams.reduce((sum, team) => sum + team[side].plays, 0);
    const weighted = teams.reduce((sum, team) => sum + team[side].epaPerPlay! * team[side].plays, 0) / plays;
    const average = row(figure, "League average");
    await expect(average).toContainText(label(weighted));
    await expect(average).toContainText(`${plays.toLocaleString("en-US")} plays · ${teams.length} teams`);
    await expect(average).toContainText("Weighted by plays");
    const jetsRow = row(figure, "NYJ");
    await expect(jetsRow).toContainText(label(jets![side].epaPerPlay!));
    await expect(jetsRow).toContainText(`${jets![side].plays.toLocaleString("en-US")} plays · ${jets!.completedGames} analyzed ${jets!.completedGames === 1 ? "game" : "games"}`);
  }
  await expect(league).toContainText(`${analytics.season} regular season · ${analytics.analyzedGameIds.length} analyzed league finals · highest included week: ${analytics.throughWeek}`);
  await expect(league).toContainText("All situations included; not opponent adjusted.");
});

test("the native comparison control starts with the next opponent and updates both units without changing the Jets", async ({ page }) => {
  test.skip(!next, "This edition has no remaining scheduled opponent.");
  const league = await openLeague(page);
  const selector = league.getByRole("combobox", { name: "Compare the Jets with", exact: true });
  await expect(selector).toHaveValue(next!.game.opponent);
  await expect(selector.getByRole("option", { name: "NYJ", exact: true })).toHaveCount(0);
  const comparison = analytics.teams.find((team) => team.team !== "NYJ" && team.team !== next!.game.opponent && eligible("offense").includes(team) && eligible("defense").includes(team));
  test.skip(!comparison, "This edition has no alternate team with both unit samples.");
  await selector.selectOption(comparison!.team);
  await expect(league.getByRole("status")).toHaveText(`Comparing NYJ with ${comparison!.team}.`);
  for (const side of ["offense", "defense"] as const) {
    const figure = league.getByRole("figure", { name: side === "offense" ? "Offense EPA / play league comparison" : "Defense EPA allowed / play league comparison", exact: true });
    await expect(row(figure, comparison!.team)).toContainText(label(comparison![side].epaPerPlay!));
    await expect(row(figure, comparison!.team)).toContainText(`${comparison![side].plays.toLocaleString("en-US")} plays`);
    await expect(row(figure, next!.game.opponent)).toHaveCount(0);
    await expect(row(figure, "NYJ")).toContainText(label(jets![side].epaPerPlay!));
  }
});

test("the disclosed league tables rank higher offense and lower defensive EPA first", async ({ page }) => {
  const league = await openLeague(page);
  await expect(league.getByRole("figure", { name: "Offense EPA / play league comparison", exact: true })).toContainText("Higher is better");
  await expect(league.getByRole("figure", { name: "Defense EPA allowed / play league comparison", exact: true })).toContainText("Lower allowed EPA is better");
  const summary = league.locator("summary").filter({ hasText: "Read the full league tables" });
  await summary.focus();
  await page.keyboard.press("Enter");
  for (const side of ["offense", "defense"] as const) {
    const sorted = eligible(side).sort((left, right) => (side === "offense" ? right[side].epaPerPlay! - left[side].epaPerPlay! : left[side].epaPerPlay! - right[side].epaPerPlay!) || left.team.localeCompare(right.team));
    const table = league.getByRole("table", { name: side === "offense" ? /Offense EPA \/ play/ : /Defense EPA allowed \/ play/ });
    await expect(table).toBeVisible();
    await expect(table.locator("tbody tr")).toHaveCount(sorted.length);
    const first = table.locator("tbody tr").first();
    await expect(first.getByRole("rowheader")).toHaveText(sorted[0].team);
    await expect(first.getByRole("cell").nth(0)).toHaveText("1");
    await expect(first.getByRole("cell").nth(1)).toHaveText(label(sorted[0][side].epaPerPlay!));
    const jetsRow = table.locator("tbody tr").filter({ hasText: "NYJ" });
    const rank = 1 + sorted.filter((team: TeamAnalytics) => side === "offense" ? team[side].epaPerPlay! > jets![side].epaPerPlay! + 1e-12 : team[side].epaPerPlay! < jets![side].epaPerPlay! - 1e-12).length;
    await expect(jetsRow.getByRole("cell").nth(0)).toHaveText(String(rank));
  }
  await expect(summary).toBeFocused();
  await expect(summary).toHaveAccessibleName("Close the full league tables");
  await page.keyboard.press("Space");
  await expect(summary).toBeFocused();
  await expect(summary).toHaveAccessibleName("Read the full league tables");
  await expect(league.getByRole("table")).toHaveCount(0);
});

for (const enlarged of [false, true]) {
  test(`league plots and textual values reflow at 320px${enlarged ? " with 200% text" : ""}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 1000 });
    const league = await openLeague(page);
    if (enlarged) await page.addStyleTag({ content: "html { font-size: 200% !important; } body { font-size: 32px !important; }" });
    await page.evaluate(() => document.fonts.ready);
    await expect(league.getByRole("combobox", { name: "Compare the Jets with", exact: true })).toBeVisible();
    await expect(league.getByRole("figure")).toHaveCount(2);
    const summary = league.locator("summary").filter({ hasText: "Read the full league tables" });
    await summary.click();
    await expect(league.getByRole("table")).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const outside = await league.evaluate((element) => Array.from(element.querySelectorAll("figure dl, figure figcaption, label, select")).filter((item) => item.getBoundingClientRect().right > innerWidth + 1).length);
    expect(outside).toBe(0);
  });
}
