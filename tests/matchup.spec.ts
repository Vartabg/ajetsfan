import { test, expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { RateMetrics, SeasonAnalytics, TeamAnalytics } from "../src/lib/analytics";
import type { CurrentSnapshot } from "../src/lib/current";
import { nextScheduledGame } from "../src/lib/current";

const data = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/analytics.json"), "utf8")) as SeasonAnalytics;
const current = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/current.json"), "utf8")) as CurrentSnapshot;
const fixture = nextScheduledGame(current);
const jets = data.teams.find((team) => team.team === "NYJ");
const opponent = data.teams.find((team) => team.team === fixture?.game.opponent);
const ready = data.season === current.season && !!jets?.completedGames && !!opponent?.completedGames &&
  !!jets.offense.plays && !!jets.defense.plays && !!opponent.offense.plays && !!opponent.defense.plays;

const metrics: { label: string; field: "epaPerPlay" | "successRate" | "passEpaPerPlay" | "rushEpaPerPlay"; count: "plays" | "passPlays" | "rushPlays"; unit: string }[] = [
  { label: "EPA / play", field: "epaPerPlay", count: "plays", unit: "plays" },
  { label: "Success rate", field: "successRate", count: "plays", unit: "plays" },
  { label: "Dropback EPA / play", field: "passEpaPerPlay", count: "passPlays", unit: "dropbacks" },
  { label: "Non-dropback rush EPA / play", field: "rushEpaPerPlay", count: "rushPlays", unit: "rush plays" },
];

async function openMatchup(page: Page) {
  await page.goto("/game-day");
  const filmRoom = page.locator("summary").filter({ hasText: "See every unit number" });
  await filmRoom.focus();
  await page.keyboard.press("Enter");
  return page.getByRole("region", { name: "Know the matchup.", exact: true });
}

async function checkUnit(table: Locator, offense: TeamAnalytics, defense: TeamAnalytics) {
  await expect(table).toBeVisible();
  await expect(table.getByRole("columnheader").nth(1)).toContainText("Offense · produced");
  await expect(table.getByRole("columnheader").nth(2)).toContainText("Defense · allowed");
  for (const metric of metrics) {
    const row = table.getByRole("rowheader", { name: metric.label, exact: true }).locator("..");
    const cells = row.getByRole("cell");
    for (const [index, sample] of [offense.offense, defense.defense].entries()) {
      const value = (sample as RateMetrics)[metric.field];
      if (value === null) await expect(cells.nth(index).locator("strong")).toHaveText("—");
      else if (metric.field === "successRate") await expect(cells.nth(index).locator("strong")).toHaveText(`${(value * 100).toFixed(1)}%`);
      else {
        const displayed = await cells.nth(index).locator("strong").innerText();
        expect(displayed).toMatch(/^[+-]?\d+\.\d{3}$/);
        // A rate that rounds to zero prints as 0.000, never -0.000; compare -0 as 0.
        expect(Number(displayed)).toBe(Number(value.toFixed(3)) || 0);
      }
      await expect(cells.nth(index)).toContainText(`${sample[metric.count].toLocaleString("en-US")} ${metric.unit}`);
    }
  }
  const success = table.getByRole("rowheader", { name: "Success rate", exact: true }).locator("..");
  await expect(success.getByRole("cell").nth(0)).toContainText("Offensive success");
  await expect(success.getByRole("cell").nth(1)).toContainText("Defensive success allowed");
}

test("the matchup pairs each offense with the defense it faces and publishes each rate's own sample", async ({ page }) => {
  test.skip(!fixture, "No remaining scheduled fixture");
  const matchup = await openMatchup(page);
  if (!ready) {
    await expect(matchup.getByRole("table")).toHaveCount(0);
    await expect(matchup).toContainText("Team efficiency will appear here");
    return;
  }
  await checkUnit(matchup.getByRole("table", { name: `Jets offense vs ${fixture!.game.opponentDisplay} defense`, exact: true }), jets!, opponent!);
  const otherUnit = matchup.locator("summary").filter({ hasText: `When ${fixture!.game.opponentDisplay} has the ball` });
  await otherUnit.focus();
  await page.keyboard.press("Enter");
  await checkUnit(matchup.getByRole("table", { name: `${fixture!.game.opponentDisplay} offense vs Jets defense`, exact: true }), opponent!, jets!);
  await expect(matchup.getByRole("table")).toHaveCount(2);
  await expect(matchup).toContainText(`highest included week: Week ${data.throughWeek}`);
  await expect(matchup).toContainText("All game situations are included; rates are not opponent-adjusted");
  await expect(matchup).toContainText("Early-season samples can change quickly");
  const jetsTable = matchup.getByRole("table", { name: `Jets offense vs ${fixture!.game.opponentDisplay} defense`, exact: true });
  const epaRow = jetsTable.getByRole("rowheader", { name: "EPA / play", exact: true }).locator("..");
  await expect(epaRow.getByRole("cell").nth(0)).toContainText(`#${jets!.ranks.offenseEpa} of ${data.teams.filter((team) => team.completedGames > 0 && team.offense.epaPerPlay !== null).length} offenses`);
  await expect(epaRow.getByRole("cell").nth(1)).toContainText(`#${opponent!.ranks.defenseEpa} of ${data.teams.filter((team) => team.completedGames > 0 && team.defense.epaPerPlay !== null).length} defenses`);
});

for (const view of [{ width: 320, enlarged: false }, { width: 320, enlarged: true }, { width: 768, enlarged: true }]) {
  test(`unit tables remain readable and keyboard-scrollable at ${view.width}px${view.enlarged ? " with 200% text" : ""}`, async ({ page }) => {
    test.skip(!fixture || !ready, "Both scheduled teams need usable samples");
    await page.setViewportSize({ width: view.width, height: 1000 });
    const matchup = await openMatchup(page);
    if (view.enlarged) await page.addStyleTag({ content: "html { font-size: 200% !important; } body { font-size: 32px !important; }" });
    await page.evaluate(() => document.fonts.ready);
    const otherUnit = matchup.locator("summary").filter({ hasText: `When ${fixture!.game.opponentDisplay} has the ball` });
    await otherUnit.focus();
    await page.keyboard.press("Enter");
    for (const name of [`Jets offense vs ${fixture!.game.opponentDisplay} defense`, `${fixture!.game.opponentDisplay} offense vs Jets defense`]) {
      const scroller = matchup.getByRole("region", { name: `${name}, scroll if needed`, exact: true });
      await scroller.focus();
      await expect(scroller).toBeFocused();
      const initial = await scroller.evaluate((element) => ({ width: element.clientWidth, contents: element.scrollWidth, left: element.scrollLeft }));
      if (initial.contents > initial.width) {
        await page.keyboard.press("ArrowRight");
        await expect.poll(() => scroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(initial.left);
      }
      const geometry = await scroller.evaluate((element) => {
        const table = element.querySelector("table")!;
        const rows = Array.from(table.querySelectorAll("tr"));
        return {
          scrollerRight: element.getBoundingClientRect().right,
          scrollerLeft: element.getBoundingClientRect().left,
          viewportWidth: innerWidth,
          overlapping: rows.some((row) => {
            const cells = Array.from(row.children);
            return cells.some((cell, index) => index > 0 && cell.getBoundingClientRect().left < cells[index - 1].getBoundingClientRect().right - 1);
          }),
          clippedText: Array.from(table.querySelectorAll("th, td, strong, small")).some((cell) => cell.scrollWidth > cell.clientWidth + 1),
        };
      });
      expect(geometry.scrollerLeft).toBeGreaterThanOrEqual(0);
      expect(geometry.scrollerRight).toBeLessThanOrEqual(geometry.viewportWidth + 1);
      expect(geometry.overlapping).toBe(false);
      expect(geometry.clippedText).toBe(false);
      await expect(scroller.getByRole("table").getByRole("columnheader").last()).toContainText("Defense · allowed");
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("the full schedule opens by keyboard and includes every current regular-season fixture", async ({ page }) => {
  await page.goto("/game-day");
  const summary = page.locator("summary").filter({ hasText: `See the full ${current.season} schedule` });
  await summary.focus();
  await page.keyboard.press("Enter");
  const schedule = page.locator("details[open] ol");
  await expect(schedule.locator("li")).toHaveCount(current.schedule.filter((game) => game.seasonType === "REG").length);
  const final = current.schedule.filter((game) => game.seasonType === "REG").at(-1)!;
  await expect(schedule).toContainText(`${final.atHome ? "vs" : "at"} ${final.opponentDisplay}`);
});
