import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Game } from "../src/lib/games";
import type { CurrentSnapshot, ScheduledGame } from "../src/lib/current";
import { rivalryLedger, rivalryRecord, rivalAnalysisHref } from "../src/lib/rivalries";

const analyzed = (overrides: Partial<Game> = {}): Game => ({
  id: "2026_01_NYJ_NE", season: 2026, week: 1, seasonType: "REG", date: "2026-09-13",
  opponent: "NE", opponentDisplay: "NE", atHome: false, jetsScore: 23, oppScore: 10,
  outcome: "win", dataSuspect: false, swing: 0.2, peakH2Wp: 0.98, troughH2Wp: 0.2,
  wentToOt: false, roof: null, temp: null, wind: null,
  keyPlay: { desc: null, wpa: null, qtr: null, secondsLeft: null }, ...overrides,
});
const scheduled = (overrides: Partial<ScheduledGame> = {}): ScheduledGame => ({
  id: "2026_01_NYJ_NE", season: 2026, week: 1, seasonType: "REG", date: "2026-09-13",
  kickoff: "2026-09-13T17:00:00Z", opponent: "NE", opponentDisplay: "NE", atHome: false,
  jetsScore: 23, oppScore: 10, outcome: "win", status: "final", ...overrides,
});
const snapshot = (schedule: ScheduledGame[], overrides: Partial<CurrentSnapshot> = {}): CurrentSnapshot => ({
  schemaVersion: 1, season: 2026, checkedAt: "2026-09-29T18:00:00Z",
  analysisUpdatedAt: null, latestAnalyzedGameId: null,
  sources: { schedule: "https://example.com/schedule", pbp: "https://example.com/pbp" },
  schedule, ...overrides,
});
const ne = (games: Game[], current: CurrentSnapshot | null = null) => rivalryLedger(games, current).entries.find((entry) => entry.opponent === "NE")!;

test("the sampled ledger counts zero scores and ties once, excluding postseason and other opponents", () => {
  const games = [
    analyzed({ jetsScore: 0, oppScore: 10, outcome: "loss" }),
    analyzed({ id: "2026_02_NE_NYJ", week: 2, date: "2026-09-20", jetsScore: 0, oppScore: 0, outcome: "tie" }),
    analyzed({ id: "2026_03_NYJ_NE", week: 3, date: "2026-09-27", jetsScore: 10, oppScore: 0, outcome: "win" }),
    analyzed({ id: "2025_19_NYJ_NE", season: 2025, seasonType: "POST", date: "2026-01-18" }),
    analyzed({ id: "2026_03_NYJ_IND", opponent: "IND", opponentDisplay: "IND" }),
  ];
  const entry = ne([...games, games[0], games[1]]);
  expect([entry.wins, entry.losses, entry.ties, entry.count]).toEqual([1, 1, 1, 3]);
  expect(rivalryRecord(entry)).toBe("1–1–1");
  expect(entry.latest?.id).toBe("2026_03_NYJ_NE");
  expect(rivalryLedger([], null).entries.map((entry) => entry.count)).toEqual([0, 0, 0]);
  expect(rivalryLedger([], null).throughDate).toBeNull();
});

test("confirmed corrections replace old analysis, and scheduled fixtures suppress archive finals", () => {
  const archived = analyzed();
  const corrected = scheduled({ jetsScore: 7, oppScore: 10, outcome: "loss" });
  const correction = ne([archived], snapshot([corrected]));
  expect([correction.wins, correction.losses, correction.count]).toEqual([0, 1, 1]);
  expect(correction.latest?.jetsScore).toBe(7);
  expect(correction.latestAnalysisHref).toBeNull();
  expect(ne([archived], snapshot([scheduled({ status: "scheduled", jetsScore: null, oppScore: null, outcome: null })])).count).toBe(0);
  expect(ne([], snapshot([corrected])).count).toBe(1);
});

test("flagged or invalid archive scores need confirmation and never create an analysis link", () => {
  const flagged = analyzed({ dataSuspect: true });
  const invalid = analyzed({ id: "2026_02_NE_NYJ", jetsScore: 30, oppScore: 10, outcome: "loss" });
  expect(ne([flagged, invalid]).count).toBe(0);
  expect(rivalryLedger([flagged, invalid], null).excludedArchiveResults).toBe(2);
  const confirmed = rivalryLedger([flagged, invalid], snapshot([scheduled()]));
  expect(confirmed.entries.find((entry) => entry.opponent === "NE")?.count).toBe(1);
  expect(confirmed.excludedArchiveResults).toBe(1);
  expect(confirmed.entries.find((entry) => entry.opponent === "NE")?.latestAnalysisHref).toBeNull();
  for (const change of [
    { date: "2026-02-30" }, { jetsScore: NaN }, { oppScore: -1 }, { jetsScore: 0.5 }, { week: 0 },
  ]) expect(ne([analyzed(change)]).count).toBe(0);
});

test("analysis links require a matching eligible result, including its date and venue direction", () => {
  const game = analyzed();
  expect(rivalAnalysisHref(game, [game])).toBe("/morgue?game=2026_01_NYJ_NE&board=miracle");
  for (const change of [
    { date: "2026-09-14" }, { atHome: true }, { swing: null }, { swing: NaN },
    { dataSuspect: true }, { seasonType: "POST" }, { opponent: "BUF" }, { opponentDisplay: "BUF" },
  ]) expect(rivalAnalysisHref(game, [analyzed(change)])).toBeNull();
  const tie = analyzed({ jetsScore: 10, oppScore: 10, outcome: "tie" });
  expect(rivalAnalysisHref(tie, [tie])).toBeNull();
});

test("coverage uses included result dates and season labels, with future scores held back", () => {
  const older = analyzed({ id: "2010_19_NYJ_NE", season: 2010, date: "2011-01-16", week: 19 });
  const future = analyzed({ id: "2026_06_NYJ_NE", week: 6, date: "2026-10-18" });
  const ledger = rivalryLedger([future, analyzed(), older], snapshot([]));
  expect([ledger.firstSeason, ledger.lastSeason, ledger.throughDate]).toEqual([2010, 2026, "2026-09-13"]);
  expect(ledger.entries.find((entry) => entry.opponent === "NE")?.count).toBe(2);
  expect(ledger.scheduleSource).toBe("https://example.com/schedule");
  expect(rivalryLedger([], snapshot([], { sources: { schedule: "javascript:alert(1)", pbp: "" } })).scheduleSource).toBeNull();
});

test("next meetings follow the checked schedule and keep overdue finals honest", () => {
  const pending = scheduled({ id: "2026_03_NYJ_NE", week: 3, date: "2026-09-27", kickoff: "2026-09-27T17:00:00Z", status: "scheduled", jetsScore: null, oppScore: null, outcome: null });
  const future = scheduled({ id: "2026_06_NYJ_NE", week: 6, date: "2026-10-18", kickoff: "2026-10-18T17:00:00Z", status: "scheduled", jetsScore: null, oppScore: null, outcome: null });
  const next = ne([], snapshot([future, pending])).next;
  expect(next?.game.id).toBe(pending.id);
  expect(next?.overdue).toBe(true);
  expect(ne([], snapshot([future])).next?.overdue).toBe(false);
  expect(ne([], snapshot([pending], { checkedAt: "2026-09-27T12:00:00Z" })).next?.overdue).toBe(false);
  expect(ne([], snapshot([{ ...pending, kickoff: null }], { checkedAt: "2026-09-27T12:00:00Z" })).next).toMatchObject({ overdue: true, kickoffKnown: false });
  expect(ne([], null).next).toBeNull();
  expect(ne([], snapshot([future], { checkedAt: "invalid" })).next).toBeNull();
});

const games = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/games.json"), "utf8")) as Game[];
const current = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/current.json"), "utf8")) as CurrentSnapshot;
const actual = rivalryLedger(games, current);

test("the rendered rivalry ledger matches the archive sample and opens the intended cases", async ({ page }) => {
  await page.goto("/");
  const desk = page.getByRole("region", { name: "AFC East record.", exact: true });
  await expect(desk).toBeVisible();
  await expect(desk.getByRole("article")).toHaveCount(3);
  await expect(desk).toContainText("Today’s AFC East opponents");
  await expect(desk).toContainText("postseason excluded");
  for (const entry of actual.entries) {
    const column = desk.getByRole("article", { name: entry.name, exact: true });
    await expect(column).toContainText(rivalryRecord(entry));
    await expect(column).toContainText(`${entry.count} meetings`);
    await expect(column.getByRole("link", { name: `Browse ${entry.name} losses` })).toHaveAttribute("href", entry.archiveHref);
    if (entry.latest) {
      await expect(column).toContainText(`NYJ ${entry.latest.jetsScore} · ${entry.opponent} ${entry.latest.oppScore}`);
      await expect(column.locator(`time[datetime="${entry.latest.date}"]`)).toHaveCount(1);
    }
    const analysis = column.getByRole("link", { name: `Explore the latest included ${entry.name} meeting` });
    if (entry.latestAnalysisHref) await expect(analysis).toHaveAttribute("href", entry.latestAnalysisHref);
    else await expect(analysis).toHaveCount(0);
    if (entry.next) await expect(column.locator(`time[datetime="${entry.next.game.date}"]`)).toHaveCount(1);
  }
  await expect(desk.getByRole("link", { name: "Where the scores come from" })).toHaveAttribute("href", "/how-made#rivalries");
});

for (const view of [{ width: 320, enlarged: false }, { width: 320, enlarged: true }, { width: 768, enlarged: true }]) {
  test(`the rivalry columns reflow at ${view.width}px${view.enlarged ? " with 200% text" : ""}`, async ({ page }) => {
    await page.setViewportSize({ width: view.width, height: 1000 });
    await page.goto("/");
    if (view.enlarged) await page.addStyleTag({ content: "html { font-size: 200% !important; } body { font-size: 32px !important; }" });
    await page.evaluate(() => document.fonts.ready);
    const desk = page.getByRole("region", { name: "AFC East record.", exact: true });
    await expect(desk).toBeVisible();
    const geometry = await desk.evaluate((element) => ({
      width: innerWidth,
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
      clipping: Array.from(element.querySelectorAll("article, h2, h3, p, strong, time, a")).some((node) => node.scrollWidth > node.clientWidth + 1),
      overlap: Array.from(element.querySelectorAll("article")).some((node, index, columns) => index > 0 &&
        node.getBoundingClientRect().top < columns[index - 1].getBoundingClientRect().bottom - 1 &&
        node.getBoundingClientRect().left < columns[index - 1].getBoundingClientRect().right - 1),
    }));
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.width + 1);
    expect(geometry.clipping).toBe(false);
    expect(geometry.overlap).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const link = desk.getByRole("link", { name: "Browse Buffalo losses" });
    await link.focus();
    await expect(link).toBeFocused();
  });
}
