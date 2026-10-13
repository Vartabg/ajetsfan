import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { LeagueHistory } from "../src/lib/league-history";
import { buildCarousel } from "../src/lib/quarterbacks";

const history = JSON.parse(readFileSync(path.join(process.cwd(), "public", "data", "league-history.json"), "utf8")) as LeagueHistory;
const carousel = buildCarousel(history.games)!;
const played = history.games.filter((game) => game.status === "final" && game.qb).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

test("every played game is counted once, and neighbouring starters never share a colour", () => {
  const qbs = carousel.quarterbacks;
  expect(qbs.reduce((total, qb) => total + qb.starts, 0)).toBe(played.length);
  expect(carousel.seasons.reduce((total, row) => total + row.games.length, 0)).toBe(played.length);
  expect(qbs.length).toBe(new Set(played.map((game) => game.qb!.id)).size);
  const color = new Map(qbs.map((qb) => [qb.id, qb.color]));
  played.forEach((game, index) => {
    const previous = played[index - 1];
    if (previous && previous.qb!.id !== game.qb!.id) expect(color.get(previous.qb!.id), `${previous.id} → ${game.id}`).not.toBe(color.get(game.qb!.id));
  });
  for (const row of carousel.seasons) {
    const starters = [...new Set(row.games.map((entry) => entry[0]))];
    expect(new Set(starters.map((index) => qbs[index].color)).size, `${row.season}`).toBe(starters.length);
  }
  expect(carousel.changes).toBe(played.filter((game, index) => index && game.qb!.id !== played[index - 1].qb!.id).length);
});

test("the longest run and busiest season agree with the game record", () => {
  const runner = carousel.quarterbacks[carousel.run.qb];
  const run = played.filter((game) => game.date >= carousel.run.first && game.date <= carousel.run.last);
  expect(run).toHaveLength(carousel.run.games);
  expect(run.every((game) => game.qb!.id === runner.id)).toBe(true);
  const busiest = played.filter((game) => game.season === carousel.busiest.season);
  expect(carousel.busiest.stints.reduce((total, stint) => total + stint.games, 0)).toBe(busiest.length);
});

test("the page names the count, reads out a pointed game and picks out a quarterback by name", async ({ page }) => {
  await page.goto("/history/quarterbacks");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${carousel.quarterbacks.length} quarterbacks have started for the Jets since ${carousel.from}.`);
  const first = page.locator("[data-focus-chart] i").first();
  await first.hover();
  const [qb, , week, opponent] = carousel.seasons[0].games[0];
  await expect(page.locator("#carousel [aria-live]")).toContainText(`${carousel.quarterbacks[qb].name} · ${carousel.seasons[0].season} week ${week}`);
  await expect(page.locator("#carousel [aria-live]")).toContainText(opponent);
  await page.getByRole("button", { name: "Show the names" }).click();
  const names = page.locator("#carousel ul button");
  await expect(names).toHaveCount(carousel.quarterbacks.length);
  await names.nth(2).click();
  await expect(names.nth(2)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#carousel [aria-live]")).toContainText(`${carousel.quarterbacks[2].name} · ${carousel.quarterbacks[2].starts} starts`);
  await expect(page.locator("[data-focus-chart]")).toHaveAttribute("data-chosen", "");
});

test("the quarterbacks page passes automated accessibility and reflows at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/history/quarterbacks");
  await page.getByRole("button", { name: "Show the names" }).click();
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
  const violations = await page.evaluate(async () => {
    const run = (window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: { id: string }[] }> } }).axe;
    return (await run.run({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations.map((violation) => violation.id);
  });
  expect(violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
