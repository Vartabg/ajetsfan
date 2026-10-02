import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Game } from "../src/lib/games";
import type { RateMetrics, SeasonAnalytics } from "../src/lib/analytics";
import { epaLabel, rateLabel } from "../src/lib/analytics";
import type { CurrentSnapshot } from "../src/lib/current";
import { selectLead } from "../src/lib/current";
import { evidenceBar, gameEvidence } from "../src/lib/game-evidence";

const game: Game = {
  id: "2026_03_NYJ_DET", season: 2026, week: 3, seasonType: "REG", date: "2026-09-27", opponent: "DET", opponentDisplay: "DET", atHome: false,
  jetsScore: 20, oppScore: 24, outcome: "loss", dataSuspect: false, swing: .7, peakH2Wp: .7, troughH2Wp: .2,
  wentToOt: false, roof: null, temp: null, wind: null, keyPlay: { desc: null, wpa: null, qtr: null, secondsLeft: null },
};
const rates = (changes: Partial<RateMetrics> = {}): RateMetrics => ({ plays: 60, epaPerPlay: .123456, successRate: .45, passPlays: 40, passEpaPerPlay: .285, rushPlays: 20, rushEpaPerPlay: -.2, ...changes });
const statistics = (changes: Partial<SeasonAnalytics["games"][number]> = {}): SeasonAnalytics["games"][number] => ({
  id: game.id, date: game.date, week: game.week, opponent: game.opponent, opponentDisplay: game.opponentDisplay, atHome: game.atHome,
  offense: rates(), defense: rates({ plays: 50, epaPerPlay: -.3, successRate: .6, passPlays: 30, rushPlays: 20, passEpaPerPlay: -.2, rushEpaPerPlay: -.45 }), bigSwings: [], ...changes,
});

test.describe("game evidence helper", () => {
  test("opponent production keeps Jets-allowed EPA orientation and each real denominator", () => {
    const evidence = gameEvidence(game, statistics())!;
    expect(evidence.rows.map((row) => [row.metric, row.jets.value, row.jets.plays, row.opponent.value, row.opponent.plays])).toEqual([
      ["epaPerPlay", .123456, 60, -.3, 50], ["successRate", .45, 60, .6, 50],
      ["passEpaPerPlay", .285, 40, -.2, 30], ["rushEpaPerPlay", -.2, 20, -.45, 20],
    ]);
    expect(evidence.rows.filter((row) => row.kind === "epa").map((row) => row.axis)).toEqual(Array(3).fill({ kind: "epa", minimum: -.5, maximum: .5, zero: 50 }));
    expect(evidence.rows[1].axis).toEqual({ kind: "rate", minimum: 0, maximum: 1, zero: 0 });
  });

  test("no wrong fixture, suspect analysis, postseason or missing snapshot can supply evidence", () => {
    expect(gameEvidence(game, null)).toBeNull();
    for (const change of [{ id: "2026_02_NYJ_DET" }, { date: "2026-09-28" }, { week: 2 }, { opponent: "NE" }, { opponentDisplay: "NE" }, { atHome: true }]) {
      expect(gameEvidence(game, statistics(change))).toBeNull();
    }
    expect(gameEvidence({ ...game, dataSuspect: true }, statistics())).toBeNull();
    expect(gameEvidence({ ...game, seasonType: "POST" }, statistics())).toBeNull();
  });

  test("zero is a measured value with a real sample, rather than missing analysis", () => {
    const evidence = gameEvidence(game, statistics({ offense: rates({ epaPerPlay: 0, successRate: 0 }) }))!;
    expect(evidence.rows[0].jets).toEqual({ value: 0, plays: 60 });
    expect(evidenceBar(evidence.rows[0].jets.value, evidence.rows[0].axis)).toEqual({ left: 50, width: 0, zeroValue: true });
    expect(evidenceBar(evidence.rows[1].jets.value, evidence.rows[1].axis)).toEqual({ left: 0, width: 0, zeroValue: true });
    expect(epaLabel(0, 3)).toBe("0.000");
  });

  test("missing and zero samples are not plotted, while the other offense remains readable", () => {
    const empty = rates({ plays: 0, passPlays: 0, rushPlays: 0, epaPerPlay: 0, successRate: 0 });
    const evidence = gameEvidence(game, statistics({ offense: empty }))!;
    expect(evidence.rows.every((row) => row.jets.value === null && row.jets.plays === 0)).toBe(true);
    expect(evidenceBar(null, evidence.rows[0].axis)).toBeNull();
    expect(gameEvidence(game, statistics({ offense: empty, defense: empty }))).toBeNull();
    const missingRush = gameEvidence(game, statistics({ offense: rates({ rushEpaPerPlay: null }), defense: rates({ rushEpaPerPlay: null }) }))!;
    expect(missingRush.rows.map((row) => row.metric)).not.toContain("rushEpaPerPlay");
  });

  test("invalid denominators, missing rates and out-of-range success cannot invent numeric evidence", () => {
    const evidence = gameEvidence(game, statistics({ offense: rates({ plays: 10.5, successRate: 1.2 }), defense: rates() }))!;
    expect(evidence.rows.every((row) => row.jets.value === null)).toBe(true);
    const ratesOnly = gameEvidence(game, statistics({ offense: rates({ epaPerPlay: NaN, successRate: 2 }), defense: rates() }))!;
    expect(ratesOnly.rows[0].jets.value).toBeNull(); expect(ratesOnly.rows[1].jets.value).toBeNull();
    const badSplit = gameEvidence(game, statistics({ offense: rates({ passPlays: 70 }), defense: rates() }))!;
    expect(badSplit.rows.filter((row) => row.metric.includes("EpaPerPlay")).every((row) => row.jets.value === null)).toBe(true);
  });

  test("negative, positive and rate bars use distance from zero on their actual scales", () => {
    const evidence = gameEvidence(game, statistics())!;
    expect(evidenceBar(-.3, evidence.rows[0].axis)).toEqual({ left: 20, width: 30, zeroValue: false });
    expect(evidenceBar(.285, evidence.rows[2].axis)).toEqual({ left: 50, width: 28.5, zeroValue: false });
    expect(evidenceBar(.6, evidence.rows[1].axis)).toEqual({ left: 0, width: 60, zeroValue: false });
    expect(evidenceBar(1.2, evidence.rows[1].axis)).toBeNull();
    expect(evidenceBar(Infinity, evidence.rows[0].axis)).toBeNull();
  });
});

test("the latest game's visible evidence names both offenses and gives source values with sample counts", async ({ page }) => {
  const read = <T,>(file: string) => JSON.parse(readFileSync(path.join(process.cwd(), "public", "data", file), "utf8")) as T;
  const games = read<Game[]>("games.json"), current = read<CurrentSnapshot>("current.json"), analytics = read<SeasonAnalytics>("analytics.json");
  const lead = selectLead(games, current).analysis!;
  const stats = analytics.games.find((row) => row.id === lead.id)!;
  await page.goto("/#game-evidence");
  const section = page.getByRole("region", { name: "What each offense produced." });
  await expect(section).toBeVisible();
  const measures = [
    ["epaPerPlay", "plays"], ["successRate", "plays"], ["passEpaPerPlay", "passPlays"], ["rushEpaPerPlay", "rushPlays"],
  ] as const;
  for (const [metric, denominator] of measures) {
    const measure = section.locator(`[data-evidence-metric="${metric}"]`);
    const offenses = measure.locator("dl > div");
    await expect(offenses.nth(0).locator("dt")).toContainText("Jets");
    await expect(offenses.nth(1).locator("dt")).toContainText(lead.opponentDisplay);
    for (const [index, rates] of [stats.offense, stats.defense].entries()) {
      const label = metric === "successRate" ? rateLabel(rates[metric]) : epaLabel(rates[metric], 3);
      await expect(offenses.nth(index).locator("strong")).toHaveText(label);
      await expect(offenses.nth(index).locator("dd")).toContainText(rates[denominator].toLocaleString("en-US"));
    }
  }
  await expect(section.getByRole("link", { name: "Method & included plays" })).toHaveAttribute("href", "/how-made#efficiency");
  await expect(section).toContainText("EPA charts share one signed scale.");
});

test("game evidence reflows at 320px with 200% text and keeps all readouts visible", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/#game-evidence");
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  const section = page.getByRole("region", { name: "What each offense produced." });
  await expect(section).toBeVisible();
  const geometry = await section.evaluate((element) => ({ width: element.getBoundingClientRect().width, scroll: element.scrollWidth }));
  expect(geometry.scroll).toBeLessThanOrEqual(Math.ceil(geometry.width));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await expect(section.locator("figure strong")).toHaveCount(8);
});
