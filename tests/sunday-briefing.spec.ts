import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { CurrentSnapshot } from "../src/lib/current";
import { currentSeasonSummary, nextScheduledGame } from "../src/lib/current";
import { selectMatchdayReport } from "../src/lib/matchday-report";

const snapshot = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/current.json"), "utf8")) as CurrentSnapshot;
const fixture = nextScheduledGame(snapshot);
const report = fixture ? selectMatchdayReport(fixture.game) : null;

test("the Sunday briefing exposes football context and season stakes before the film room", async ({ page }) => {
  test.skip(!fixture || fixture.overdue, "No upcoming fixture in this edition");
  await page.goto("/");
  const briefing = page.getByRole("region", { name: "Before we do this again." });
  await expect(briefing).toBeVisible();
  await expect(briefing).toContainText("Fan analysis");
  await expect(briefing).toContainText("These are things to watch, not predictions.");
  const record = currentSeasonSummary(snapshot);
  if (fixture!.game.seasonType === "REG") {
    await expect(briefing).toContainText(`Win: ${record.wins + 1}–${record.losses}`);
    await expect(briefing).toContainText(`Lose: ${record.wins}–${record.losses + 1}`);
  }
  await expect(page.locator("details").filter({ has: page.locator("summary").filter({ hasText: "Open the film room" }) })).not.toHaveAttribute("open", "");
  await expect(page.getByRole("link", { name: "Sunday briefing", exact: false })).toHaveAttribute("href", "#sunday-briefing");
});

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
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: unknown[] }> } }).axe;
    return (await axe.run({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations;
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
