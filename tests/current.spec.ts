import { test, expect } from "@playwright/test";
import type { Game } from "../src/lib/games";
import type { CurrentSnapshot, ScheduledGame } from "../src/lib/current";
import { currentSeasonSummary, divisionPicture, gamesBehindLabel, mergeResults, nextScheduledGame, recordLabel, selectLead } from "../src/lib/current";
import type { StandingsRow } from "../src/lib/current";
import { currentStreak } from "../src/lib/paper";

const result = (overrides: Partial<ScheduledGame> = {}): ScheduledGame => ({
  id: "2026_01_NYJ_TEN", season: 2026, week: 1, seasonType: "REG",
  date: "2026-09-13", kickoff: "2026-09-13T17:00:00Z", opponent: "TEN",
  opponentDisplay: "TEN", atHome: false, jetsScore: 23, oppScore: 10,
  outcome: "win", status: "final", ...overrides,
});
const snapshot = (schedule: ScheduledGame[]): CurrentSnapshot => ({
  schemaVersion: 1, season: 2026, checkedAt: "2026-09-29T18:00:00Z",
  analysisUpdatedAt: null, latestAnalyzedGameId: null,
  sources: { schedule: "https://example.com/schedule", pbp: "https://example.com/pbp" }, schedule,
});
const analyzed = (overrides: Partial<Game> = {}): Game => ({
  ...result(), jetsScore: 23, oppScore: 10, outcome: "win", seasonType: "REG",
  dataSuspect: false, swing: 0.2, peakH2Wp: 0.98, troughH2Wp: 0.2,
  wentToOt: false, roof: null, temp: null, wind: null,
  keyPlay: { desc: null, wpa: null, qtr: null, secondsLeft: null }, ...overrides,
});

test("latest confirmed result leads while its analysis is pending", () => {
  const archive = analyzed({ id: "2018_16_GB_NYJ", season: 2018, date: "2018-12-23", outcome: "loss", swing: 0.978 });
  const current = result();
  const lead = selectLead([archive], snapshot([current]));
  expect(lead.kind).toBe("current");
  expect(lead.result?.id).toBe(current.id);
  expect(lead.analysisStatus).toBe("pending");
  expect(lead.analysis).toBeNull();
});

test("corrected scores cannot display old analysis and future finals cannot lead", () => {
  const game = result();
  const future = result({ id: "2026_05_NYJ_NE", week: 5, date: "2026-10-11" });
  const lead = selectLead([analyzed({ jetsScore: 20 })], snapshot([game, future]));
  expect(lead.result?.id).toBe(game.id);
  expect(lead.analysisStatus).toBe("pending");
  expect(lead.analysis).toBeNull();
  expect(selectLead([analyzed()], snapshot([game])).analysisStatus).toBe("ready");
  expect(selectLead([analyzed({ dataSuspect: true })], snapshot([game])).analysisStatus).toBe("suspect");
});

test("season totals count zero scores and ties and exclude postseason and unconfirmed games", () => {
  const games = [
    result(),
    result({ id: "2026_02_GB_NYJ", week: 2, date: "2026-09-20", jetsScore: 0, oppScore: 0, outcome: "tie" }),
    result({ id: "2026_03_NYJ_DET", week: 3, date: "2026-09-27", status: "scheduled", jetsScore: null, oppScore: null, outcome: null }),
    result({ id: "2026_19_NYJ_KC", week: 19, seasonType: "POST", date: "2027-01-10" }),
  ];
  const summary = currentSeasonSummary(snapshot(games));
  expect([summary.wins, summary.losses, summary.ties]).toEqual([1, 0, 1]);
  expect(summary.pointDifferential).toBe(13);
  expect(summary.recent.map((game) => game.week)).toEqual([2, 1]);
});

test("pending final results update the streak without double counting the analysis copy", () => {
  const games = [result(), result({ id: "2026_02_GB_NYJ", week: 2, date: "2026-09-20", jetsScore: 17, oppScore: 20, outcome: "loss" })];
  const merged = mergeResults([analyzed({ outcome: "loss" })], snapshot(games));
  expect(merged).toHaveLength(2);
  expect(currentStreak(merged)?.type).toBe("loss");
  expect(currentStreak(merged)?.count).toBe(1);
});

test("passed schedule entries show overdue status instead of implying an upcoming kickoff", () => {
  const pending = result({ id: "2026_03_NYJ_DET", week: 3, date: "2026-09-27", kickoff: "2026-09-27T17:00:00Z", status: "scheduled", jetsScore: null, oppScore: null, outcome: null });
  const future = result({ id: "2026_04_NYJ_CHI", week: 4, date: "2026-10-04", kickoff: "2026-10-04T17:00:00Z", status: "scheduled", jetsScore: null, oppScore: null, outcome: null });
  expect(nextScheduledGame(snapshot([result(), pending, future]))?.overdue).toBe(true);
  expect(nextScheduledGame(snapshot([result(), future]))?.game.id).toBe(future.id);
  expect(nextScheduledGame(snapshot([result(), future]))?.overdue).toBe(false);
});

const row = (team: string, wins: number, losses: number, ties = 0): StandingsRow => ({
  team, games: wins + losses + ties, wins, losses, ties, pointsFor: 0, pointsAgainst: 0, divisionWins: 0, divisionLosses: 0, divisionTies: 0,
});

test("division picture reads games back from the published row order and stays quiet before any final", () => {
  const behind = divisionPicture({ division: "AFC East", teams: [row("BUF", 3, 0), row("NYJ", 1, 2), row("NE", 1, 2), row("MIA", 0, 3)] });
  expect(behind).toMatchObject({ back: 2, leads: false, atTop: 1 });
  expect(behind?.leader.team).toBe("BUF");
  const tied = divisionPicture({ division: "AFC East", teams: [row("NYJ", 2, 1), row("BUF", 2, 1), row("NE", 1, 2), row("MIA", 1, 2)] });
  expect(tied).toMatchObject({ back: 0, leads: true, atTop: 2 });
  expect(divisionPicture({ division: "AFC East", teams: [row("BUF", 0, 0), row("NYJ", 0, 0)] })).toBeNull();
  expect(divisionPicture({ division: "AFC East", teams: [row("BUF", 1, 0), row("MIA", 0, 1)] })).toBeNull();
  expect(divisionPicture(undefined)).toBeNull();
});

test("standings labels keep half games and ties honest", () => {
  expect(gamesBehindLabel(0.5)).toBe("½ game back");
  expect(gamesBehindLabel(1)).toBe("1 game back");
  expect(gamesBehindLabel(2.5)).toBe("2½ games back");
  expect(recordLabel(row("NYJ", 1, 2))).toBe("1–2");
  expect(recordLabel(row("NYJ", 1, 2, 1))).toBe("1–2–1");
  expect(recordLabel(row("NYJ", 1, 2), true)).toBe("1–2–0");
});
