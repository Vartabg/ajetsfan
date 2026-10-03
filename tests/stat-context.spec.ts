import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { completedGames, type CurrentSnapshot } from "../src/lib/current";
import { gameHref } from "../src/lib/explorer";
import { keyPlayIndex } from "../src/lib/curve";
import { wpaLabel } from "../src/lib/analytics-context";
import type { Game } from "../src/lib/games";

const games = JSON.parse(readFileSync("public/data/games.json", "utf8")) as Game[];
const example = games.find((game) => game.id === "2018_16_GB_NYJ")!;
const points = JSON.parse(readFileSync(`public/data/curves/${example.id}.json`, "utf8"));
const snapshot = JSON.parse(readFileSync("public/data/current.json", "utf8")) as CurrentSnapshot;

test("selected play separates pre-play probability from Jets-oriented probability change", async ({ page }) => {
  await page.goto(gameHref(example.id, "heartbreak"));
  const readout = page.getByRole("status", { name: "Selected play", exact: true });
  await expect(readout).toContainText("Before this play:");
  const key = keyPlayIndex(points, example.keyPlay);
  expect(key).toBeGreaterThanOrEqual(0);
  await expect(readout).toContainText(`Change on this play: ${wpaLabel(points[key].d)}`);
  await expect(readout).toContainText(points[key].desc);
});

test("probability changes keep a valid zero distinct from an unavailable observation", async ({ page }) => {
  await page.route(`**/data/curves/${example.id}.json`, (route) => route.fulfill({ json: [
    { q: 3, t: 1700, wp: .5, d: .02, desc: "Positive change", type: "pass" },
    { q: 3, t: 1600, wp: .52, d: -.168, desc: "Negative change", type: "pass" },
    { q: 4, t: 500, wp: .352, d: 0, desc: "No change", type: "run" },
    { q: 4, t: 0, wp: .352, d: null, desc: "Missing estimate", type: "run" },
  ] }));
  await page.goto(gameHref(example.id, "heartbreak"));
  const slider = page.getByRole("slider", { name: "Play sequence", exact: true });
  const readout = page.getByRole("status", { name: "Selected play", exact: true });
  await expect(slider).toBeVisible();
  await slider.focus(); await slider.press("Home");
  await expect(readout).toContainText("Change on this play: +2.0 percentage points");
  await slider.press("ArrowRight");
  await expect(readout).toContainText("Change on this play: -16.8 percentage points");
  await slider.press("ArrowRight");
  await expect(readout).toContainText("Change on this play: 0.0 percentage points");
  await slider.press("End");
  await expect(readout).toContainText("Change on this play: Unavailable");
  await expect(readout).toContainText("Missing estimate");
});

test("season margins reconcile confirmed scores and leave space for enlarged labels", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/game-day#season-trend");
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await page.evaluate(() => document.fonts.ready);
  const region = page.getByRole("region", { name: "Season margins, scroll to explore every game" });
  const finals = completedGames(snapshot).filter((game) => game.season === snapshot.season && game.seasonType === "REG");
  const scored = finals.reduce((sum, game) => sum + game.jetsScore, 0);
  const allowed = finals.reduce((sum, game) => sum + game.oppScore, 0);
  await expect(page.locator("#season-trend")).toContainText(`${scored} points scored / ${allowed} allowed across ${finals.length} confirmed`);
  for (const [index, game] of finals.entries()) {
    const column = region.getByRole("listitem").nth(index);
    await expect(column).toContainText(`NYJ ${game.jetsScore}–${game.oppScore}`);
    const separation = await column.evaluate((el) => {
      const label = el.querySelector("strong")!.getBoundingClientRect();
      const opponent = el.querySelector(":scope > span")!.getBoundingClientRect();
      return opponent.top - label.bottom;
    });
    expect(separation).toBeGreaterThanOrEqual(0);
    const analysis = column.getByRole("link");
    if (await analysis.count()) await expect(analysis).toHaveAttribute("href", gameHref(game.id, game.outcome === "win" ? "miracle" : "heartbreak"));
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});
