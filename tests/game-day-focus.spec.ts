import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { CurrentSnapshot } from "../src/lib/current";
import { divisionPicture, nextScheduledGame } from "../src/lib/current";
import { placeName } from "../src/lib/focus";

const snapshot = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/current.json"), "utf8")) as CurrentSnapshot;
const next = nextScheduledGame(snapshot);
const picture = divisionPicture(snapshot.standings);
const regular = snapshot.schedule.filter((game) => game.seasonType === "REG");

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route((url) => url.pathname === "/_next/image", (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"/>' }));
});

test("Game Day is a focus page: the next game first, then the matchup, your call, standings, the season and the league", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto("/game-day");
  await expect(page.locator("#top")).toHaveCount(0);
  const ids = await page.locator("[data-focus-moment]").evaluateAll((moments) => moments.map((moment) => moment.id));
  expect(ids).toEqual(["kickoff", ...(next ? ["briefing"] : []), "ticket", "standings", "season", ...(await page.locator("#league").count() ? ["league"] : []), "more"]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  if (next) await expect(page.getByRole("heading", { level: 1 })).toContainText(next.game.atHome ? placeName(next.game.opponentDisplay) : `At ${placeName(next.game.opponentDisplay)}`);
  const index = page.getByRole("navigation", { name: "On this page" });
  await expect(index.getByRole("link")).toHaveCount(ids.length);
  await expect(page.getByRole("navigation", { name: "Site sections" }).locator('[aria-current="page"]')).toHaveAttribute("href", "/game-day");
  if (next) {
    await page.locator("#kickoff").getByRole("link", { name: /^Make your call/ }).click();
    await expect(page).toHaveURL(/#ticket$/);
    await expect(index.locator("a[aria-current]")).toHaveAttribute("href", "#ticket");
  }
});

test("standings and the schedule keep their facts, and the unit numbers open in place", async ({ page }) => {
  await page.goto("/game-day");
  const standings = page.locator("#standings");
  if (picture) {
    await expect(standings.locator("h2")).toContainText(picture.leads ? "in the" : placeName(picture.leader.team));
    await expect(standings.locator("[data-standings] tbody tr")).toHaveCount(snapshot.standings!.teams.length);
  } else await expect(standings.locator("[data-standings-pending]")).toBeVisible();
  const schedule = page.locator("#season > details");
  await expect(schedule.locator("li").first()).toBeHidden();
  await schedule.locator("> summary").click();
  await expect(schedule.locator("li")).toHaveCount(regular.length);
  for (const game of regular.filter((entry) => entry.status === "final")) {
    await expect(schedule.locator(`li:has(time[datetime="${game.date}"])`)).toContainText(`${game.jetsScore}–${game.oppScore}`);
  }
  if (next) {
    const units = page.locator("#briefing > details");
    await expect(page.getByRole("region", { name: "Know the matchup.", exact: true })).toBeHidden();
    await units.locator("> summary").click();
    await expect(page.getByRole("region", { name: "Know the matchup.", exact: true })).toBeVisible();
  }
});

test("old Game Day bookmarks still land on their part of the page", async ({ page }) => {
  for (const anchor of ["standings", "season", "season-trend", ...(next ? ["sunday-briefing"] : []), "game-day-ticket"]) {
    await page.goto(`/game-day#${anchor}`);
    await expect(page.locator(`#${anchor}`)).toBeInViewport();
  }
});

for (const width of [1280, 390, 320]) {
  test(`Game Day passes automated accessibility and reflows at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/game-day");
    await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: { id: string }[] }> } }).axe;
      return (await axe.run({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations.map((violation) => violation.id);
    });
    expect(violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("Game Day reflows at 320px with 200% text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/game-day");
  await page.addStyleTag({ content: "html { font-size: 200% !important; } body { font-size: 32px !important; }" });
  for (const summary of await page.locator("#briefing > details > summary, #season > details > summary").all()) await summary.click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
