import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { CurrentSnapshot } from "../src/lib/current";
import { currentSeasonSummary, nextScheduledGame } from "../src/lib/current";
import type { SeasonAnalytics } from "../src/lib/analytics";
import { epaLabel } from "../src/lib/analytics";
import { leagueMetric } from "../src/lib/analytics-context";
import { record } from "../src/lib/focus-format";
import { previewQuestions } from "../src/lib/football-preview";
import { selectMatchdayReport } from "../src/lib/matchday-report";
import { ordinal } from "../src/components/SundayBriefing";

const snapshot = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/current.json"), "utf8")) as CurrentSnapshot;
const fixture = nextScheduledGame(snapshot);
const report = fixture ? selectMatchdayReport(fixture.game) : null;
const analytics = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/analytics.json"), "utf8")) as SeasonAnalytics;
const comparisons = fixture && !fixture.overdue ? previewQuestions(fixture.game, analytics) : [];
const briefingOf = (page: import("@playwright/test").Page) => page.locator("#sunday-briefing");

test("ordinals read as a stranger expects", () => {
  expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 32].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "32nd"]);
});

test("the matchup is a focus moment: one plain sentence, each unit pairing as ranked bars, the stakes, and where to watch", async ({ page }) => {
  test.skip(!fixture || fixture.overdue, "No upcoming fixture in this edition");
  await page.goto("/game-day#sunday-briefing");
  const briefing = briefingOf(page);
  await expect(briefing).toBeVisible();
  await expect(briefing.locator("#briefing-heading")).toContainText(/the better (offense|defense)|unit by unit/);
  await expect(briefing.locator("#briefing-heading")).not.toContainText("in numbers");
  await expect(briefing).not.toContainText("The Sunday briefing");
  if (comparisons.length) {
    const items = briefing.getByRole("list", { name: "Measured unit comparisons" }).getByRole("listitem");
    await expect(items).toHaveCount(comparisons.length);
    await expect(briefing).toContainText("A longer bar is a better rank");
    await expect(briefing).toContainText("these rates do not predict this game’s result");
    for (const comparison of comparisons) {
      const metric = comparison.unit === "dropback" ? "passEpaPerPlay" : "rushEpaPerPlay";
      const units = briefing.locator(`dl[aria-label="${comparison.title} comparison"] > div`);
      await expect(units).toHaveCount(2);
      for (const [index, sample] of [comparison.offense, comparison.defense].entries()) {
        const side = index === 0 ? "offense" : "defense";
        const unit = units.nth(index);
        const measure = leagueMetric(analytics.teams, side, metric);
        const rank = measure.entries.find((entry) => entry.team === sample.team)?.rank;
        await expect(unit.locator("dt")).toContainText(side);
        await expect(unit.locator("strong")).toHaveText(rank ? `${ordinal(rank)} of ${measure.teams}` : "Unranked");
        await expect(unit.locator("small")).toContainText(`${epaLabel(sample.epa, 3)} EPA ${side === "offense" ? "per" : "allowed per"}`);
        await expect(unit.locator("small")).toContainText(`${sample.plays} plays · ${sample.games} completed game`);
        // The bar is the rank: first of N fills the track, last of N barely shows.
        if (rank) {
          const width = await unit.locator("span span").evaluate((bar) => parseFloat((bar as HTMLElement).style.width));
          expect(width).toBeCloseTo((measure.teams - rank + 1) / measure.teams * 100, 3);
        }
      }
    }
    await expect(briefing.getByRole("link", { name: "EPA, sample rules & sources" })).toHaveAttribute("href", "/how-made#efficiency");
  } else {
    await expect(briefing).toContainText("Validated offensive and defensive play samples are not available");
  }
  const summary = currentSeasonSummary(snapshot);
  if (fixture!.game.seasonType === "REG") {
    await expect(briefing).toContainText(`A win makes them ${record(summary.wins + 1, summary.losses, summary.ties)}. A loss makes them ${record(summary.wins, summary.losses + 1, summary.ties)}.`);
  }
  const desk = briefing.getByRole("complementary", { name: "Where to watch and listen." });
  await expect(desk.getByRole("link", { name: /Latest official injury report/ })).toHaveAttribute("href", "https://www.newyorkjets.com/team/injury-report/");
  await expect(page.locator("details").filter({ has: page.locator("summary").filter({ hasText: "See every unit number" }) })).not.toHaveAttribute("open", "");
  await expect(page).toHaveURL(/\/game-day#sunday-briefing$/);
  await expect(page.getByRole("navigation", { name: "Site sections" }).locator('[aria-current="page"]')).toHaveAttribute("href", "/game-day");
});

test("the matchup and its unit numbers use the focus palette, with no paper tint or display capitals", async ({ page }) => {
  test.skip(!fixture, "No upcoming fixture in this edition");
  await page.goto("/game-day#sunday-briefing");
  await page.locator("summary").filter({ hasText: "See every unit number" }).click();
  const looks = await page.locator("#briefing").evaluate((moment) => {
    // The old block's paper cream, forest panel and stamp orange, as the browser reports them.
    const newspaper = new Set(["rgb(247, 244, 235)", "rgb(240, 234, 223)", "rgb(237, 226, 187)", "rgb(161, 75, 55)"]);
    return Array.from(moment.querySelectorAll<HTMLElement>("*"))
      .map((node) => ({ tag: node.tagName, text: node.textContent?.trim().slice(0, 40), style: getComputedStyle(node) }))
      .filter(({ style, tag }) => newspaper.has(style.backgroundColor) || newspaper.has(style.color) || style.textTransform === "uppercase" || (parseFloat(style.fontSize) < 13 && tag !== "SPAN"))
      .map(({ tag, text, style }) => ({ tag, text, background: style.backgroundColor, color: style.color, transform: style.textTransform, size: style.fontSize }));
  });
  expect(looks).toEqual([]);
});

for (const width of [320, 768]) {
  test(`unit bars and sample labels reflow at ${width}px with 200% text`, async ({ page }) => {
    test.skip(!comparisons.length, "No current validated unit comparison");
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/game-day#sunday-briefing");
    await page.addStyleTag({ content: "html { font-size: 200% !important; } body { font-size: 32px !important; }" });
    await page.evaluate(() => document.fonts.ready);
    const briefing = briefingOf(page);
    await expect(briefing).toBeVisible();
    const geometry = await briefing.evaluate((element) => ({
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
      viewport: innerWidth,
      clipped: Array.from(element.querySelectorAll("h2, h3, dl, dt, dd, strong, small, p, a"))
        .filter((node) => node.scrollWidth > node.clientWidth + 1)
        .map((node) => ({ tag: node.tagName, text: node.textContent?.trim(), width: node.clientWidth, contentWidth: node.scrollWidth })),
      overlap: Array.from(element.querySelectorAll("dl")).some((node) => {
        const [first, second] = Array.from(node.children).map((child) => child.getBoundingClientRect());
        return first && second && second.top < first.bottom - 1 && second.left < first.right - 1;
      }),
    }));
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 1);
    expect(geometry.clipped).toEqual([]);
    expect(geometry.overlap).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("dated availability is attributed and opens by keyboard without implying game clearance", async ({ page }) => {
  test.skip(!report, "No current reviewed game-week report");
  await page.clock.install({ time: new Date(Date.parse(report!.reviewedAt) + 60_000) });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/game-day#sunday-briefing");
  const desk = page.getByRole("complementary", { name: "Where to watch and listen." });
  await expect(desk).toContainText(report!.watch.network);
  await expect(desk).toContainText(report!.watch.venue);
  await expect(desk.getByRole("link", { name: /Official watch & listen guide/ })).toHaveAttribute("href", report!.watch.url);
  const disclosure = desk.locator("summary");
  await disclosure.focus();
  await page.keyboard.press("Enter");
  await expect(desk).toContainText("not final game status");
  for (const note of report!.availability) {
    await expect(desk.getByRole("heading", { name: note.title })).toBeVisible();
    await expect(desk).toContainText(note.body);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const link of await desk.getByRole("link").all()) {
    const size = await link.boundingBox();
    expect(size?.height).toBeGreaterThanOrEqual(44);
  }
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
  const violations = await desk.evaluate(async (element) => {
    const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: unknown[] }> } }).axe;
    return (await axe.run(element, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations;
  });
  expect(violations).toEqual([]);
});

test("a static game-day desk warns when old and removes fixture-specific reporting at kickoff", async ({ page }) => {
  test.skip(!report, "No current reviewed game-week report");
  await page.clock.install({ time: new Date(Date.parse(report!.reviewedAt) + 25 * 60 * 60_000) });
  await page.goto("/game-day#sunday-briefing");
  await expect(page.getByRole("status", { name: "Game-week reporting update status" })).toContainText("Availability can change");
  await page.clock.setSystemTime(new Date(Date.parse(report!.expiresAt) + 60_000));
  await page.clock.runFor(60_000);
  const desk = page.getByRole("complementary", { name: "Where to watch and listen." });
  await expect(desk).toContainText("This game-week briefing has expired");
  await expect(desk.getByText(report!.watch.network, { exact: true })).toHaveCount(0);
  await expect(desk.locator("summary")).toHaveCount(0);
  await expect(desk.getByRole("link", { name: /Latest official injury report/ })).toBeVisible();
});
