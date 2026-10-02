import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { CurrentSnapshot } from "../src/lib/current";
import { currentSeasonSummary, nextScheduledGame } from "../src/lib/current";
import type { SeasonAnalytics } from "../src/lib/analytics";
import { epaLabel } from "../src/lib/analytics";
import { previewQuestions } from "../src/lib/football-preview";
import { selectMatchdayReport } from "../src/lib/matchday-report";

const snapshot = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/current.json"), "utf8")) as CurrentSnapshot;
const fixture = nextScheduledGame(snapshot);
const report = fixture ? selectMatchdayReport(fixture.game) : null;
const analytics = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/analytics.json"), "utf8")) as SeasonAnalytics;
const comparisons = fixture && !fixture.overdue ? previewQuestions(fixture.game, analytics) : [];

test("the Sunday briefing shows measured opposing units and season stakes before the film room", async ({ page }) => {
  test.skip(!fixture || fixture.overdue, "No upcoming fixture in this edition");
  await page.goto("/");
  const briefing = page.getByRole("region", { name: "The matchup, in numbers." });
  await expect(briefing).toBeVisible();
  if (comparisons.length) {
    await expect(briefing.getByRole("list", { name: "Measured unit comparisons" }).getByRole("listitem")).toHaveCount(comparisons.length);
    await expect(briefing).toContainText("Current-season regular-season plays");
    await expect(briefing).toContainText("Higher offensive EPA and lower defensive EPA allowed");
    await expect(briefing).toContainText("these rates do not predict this game’s result");
    for (const comparison of comparisons) {
      const units = briefing.locator(`dl[aria-label="${comparison.title} comparison"] > div`);
      await expect(units).toHaveCount(2);
      for (const [index, sample] of [comparison.offense, comparison.defense].entries()) {
        const unit = units.nth(index);
        await expect(unit.locator("dt")).toHaveText(`${sample.team} ${index === 0 ? "offense" : "defense"}`);
        await expect(unit.locator("strong")).toHaveText(epaLabel(sample.epa, 3));
        await expect(unit.locator("dd > span")).toHaveText(`EPA ${index === 0 ? "per" : "allowed per"} ${comparison.unit}`);
        await expect(unit.locator("small")).toHaveText(`${sample.plays} plays · ${sample.games} completed games`);
      }
    }
    await expect(briefing.getByRole("link", { name: "EPA, sample rules & sources" })).toHaveAttribute("href", "/how-made#efficiency");
  } else {
    await expect(briefing).toContainText("Validated offensive and defensive play samples are not available");
  }
  const record = currentSeasonSummary(snapshot);
  if (fixture!.game.seasonType === "REG") {
    await expect(briefing).toContainText(`With a win: ${record.wins + 1}–${record.losses}`);
    await expect(briefing).toContainText(`With a loss: ${record.wins}–${record.losses + 1}`);
  }
  await expect(page.locator("details").filter({ has: page.locator("summary").filter({ hasText: "Open league and unit comparisons" }) })).not.toHaveAttribute("open", "");
  await expect(page.getByRole("link", { name: "Sunday briefing", exact: false })).toHaveAttribute("href", "#sunday-briefing");
});

for (const width of [320, 768]) {
  test(`unit values and sample labels reflow at ${width}px with 200% text`, async ({ page }) => {
    test.skip(!comparisons.length, "No current validated unit comparison");
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await page.addStyleTag({ content: "html { font-size: 200% !important; } body { font-size: 32px !important; }" });
    await page.evaluate(() => document.fonts.ready);
    const briefing = page.getByRole("region", { name: "The matchup, in numbers." });
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
    const pageBounds = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: innerWidth,
      outside: Array.from(document.querySelectorAll("body *"))
        .filter((node) => {
          const bounds = node.getBoundingClientRect();
          if (!bounds.width || !bounds.height || bounds.right <= innerWidth) return false;
          for (let parent = node.parentElement; parent; parent = parent.parentElement) {
            if (/auto|scroll|hidden|clip/.test(getComputedStyle(parent).overflowX) &&
              parent.getBoundingClientRect().right <= innerWidth) return false;
          }
          return true;
        })
        .map((node) => ({ tag: node.tagName, class: node.className, text: node.textContent?.trim().slice(0, 80), parent: `${node.parentElement?.tagName}.${node.parentElement?.className}: ${node.parentElement?.textContent?.trim().slice(0, 80)}`, right: node.getBoundingClientRect().right, width: node.clientWidth, content: node.scrollWidth }))
        .slice(0, 10),
    }));
    expect(pageBounds.document, JSON.stringify(pageBounds.outside)).toBeLessThanOrEqual(pageBounds.viewport);
  });
}

test("dated availability is attributed and opens by keyboard without implying game clearance", async ({ page }) => {
  test.skip(!report, "No current reviewed game-week report");
  await page.clock.install({ time: new Date(Date.parse(report!.reviewedAt) + 60_000) });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/");
  const desk = page.getByRole("complementary", { name: "Get your Sunday sorted." });
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
  // Check the opened desk here; homepage.spec.ts scans the complete page.
  // The focused disclosure may scroll unrelated targets behind the sticky nav.
  const violations = await desk.evaluate(async (element) => {
    const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: unknown[] }> } }).axe;
    return (await axe.run(element, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations;
  });
  expect(violations).toEqual([]);
});

test("a static game-day desk warns when old and removes fixture-specific reporting at kickoff", async ({ page }) => {
  test.skip(!report, "No current reviewed game-week report");
  await page.clock.install({ time: new Date(Date.parse(report!.reviewedAt) + 25 * 60 * 60_000) });
  await page.goto("/");
  await expect(page.getByRole("status", { name: "Game-week reporting update status" })).toContainText("Availability can change");
  await page.clock.setSystemTime(new Date(Date.parse(report!.expiresAt) + 60_000));
  await page.clock.runFor(60_000);
  const desk = page.getByRole("complementary", { name: "Get your Sunday sorted." });
  await expect(desk).toContainText("This game-week briefing has expired");
  await expect(desk.getByText(report!.watch.network, { exact: true })).toHaveCount(0);
  await expect(desk.locator("summary")).toHaveCount(0);
  await expect(desk.getByRole("link", { name: /Latest official injury report/ })).toBeVisible();
});
