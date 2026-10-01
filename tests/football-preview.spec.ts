import { test, expect } from "@playwright/test";
import type { RateMetrics, SeasonAnalytics, TeamAnalytics } from "../src/lib/analytics";
import type { ScheduledGame } from "../src/lib/current";
import { previewQuestions } from "../src/lib/football-preview";

const game = (overrides: Partial<ScheduledGame> = {}): ScheduledGame => ({
  id: "2026_04_NYJ_CHI", season: 2026, week: 4, seasonType: "REG", date: "2026-10-04",
  kickoff: "2026-10-04T17:00:00Z", opponent: "CHI", opponentDisplay: "CHI", atHome: false,
  jetsScore: null, oppScore: null, outcome: null, status: "scheduled", ...overrides,
});
const metrics = (overrides: Partial<RateMetrics> = {}): RateMetrics => ({
  plays: 100, epaPerPlay: 0.1, successRate: 0.5, passPlays: 60, passEpaPerPlay: 0.2,
  rushPlays: 40, rushEpaPerPlay: -0.1, ...overrides,
});
const team = (name: string, offense: RateMetrics, defense: RateMetrics): TeamAnalytics => ({
  team: name, completedGames: 3, offense, defense,
  ranks: { offenseEpa: null, defenseEpa: null, offenseSuccess: null, defenseSuccess: null },
});
const snapshot = (): SeasonAnalytics => ({
  schemaVersion: 1, season: 2026, analysisUpdatedAt: "2026-09-29T20:00:00Z",
  throughDate: "2026-09-28", throughWeek: 3, analyzedGameIds: [], pendingGameIds: [],
  definitions: { epaPerPlay: "EPA", successRate: "Success", passRush: "Splits", scope: "REG" },
  sources: { schedule: "https://example.test/schedule", pbp: "https://example.test/pbp", methodology: "https://example.test/methodology" },
  teams: [
    team("NYJ", metrics({ plays: 192, passPlays: 118, passEpaPerPlay: 0.20, rushPlays: 74, rushEpaPerPlay: -0.21 }), metrics({ plays: 161, passPlays: 107, passEpaPerPlay: 0.03, rushPlays: 54, rushEpaPerPlay: -0.15 })),
    team("CHI", metrics({ plays: 206, passPlays: 114, passEpaPerPlay: 0.23, rushPlays: 92, rushEpaPerPlay: 0.004 }), metrics({ plays: 160, passPlays: 98, passEpaPerPlay: -0.06, rushPlays: 62, rushEpaPerPlay: -0.01 })),
  ],
  games: [],
});

test("football questions pair each offense with the other defense and preserve split denominators", () => {
  const questions = previewQuestions(game(), snapshot());
  expect(questions.map((question) => question.id)).toEqual(["passing", "rushing", "pass-defense"]);
  expect(questions[0].evidence).toBe("NYJ offense: +0.20 EPA per dropback (118 plays). CHI defense: -0.06 EPA allowed per dropback (98 plays).");
  expect(questions[1].evidence).toBe("NYJ offense: -0.21 EPA per rush (no scrambles) (74 plays). CHI defense: -0.01 EPA allowed per rush (no scrambles) (62 plays).");
  expect(questions[2].evidence).toBe("CHI offense: +0.23 EPA per dropback (114 plays). NYJ defense: +0.03 EPA allowed per dropback (107 plays).");
});

test("a new scheduled opponent supplies its own defense and passing offense", () => {
  const analytics = snapshot();
  analytics.teams.push(team("CLE", metrics({ passEpaPerPlay: -0.35 }), metrics({ passEpaPerPlay: 0.41, rushEpaPerPlay: 0.27 })));
  const questions = previewQuestions(game({ opponent: "CLE", opponentDisplay: "CLE", atHome: true }), analytics);
  expect(questions[0].title).toBe("Can the passing game deliver?");
  expect(questions[0].evidence).toContain("CLE defense: +0.41 EPA allowed per dropback");
  expect(questions[1].evidence).toContain("CLE defense: +0.27 EPA allowed per rush (no scrambles)");
  expect(questions[2].evidence).toContain("CLE offense: -0.35 EPA per dropback");
  expect(questions[2].title).toContain("Cleveland");
  expect(JSON.stringify(questions)).not.toContain("CHI");
});

test("unavailable, previous-season and already-final data cannot supply a preview", () => {
  expect(previewQuestions(game(), null)).toEqual([]);
  expect(previewQuestions(game(), { ...snapshot(), season: 2025 })).toEqual([]);
  expect(previewQuestions(game({ status: "final", jetsScore: 20, oppScore: 10, outcome: "win" }), snapshot())).toEqual([]);
  expect(previewQuestions(game({ opponent: "MIA" }), snapshot())).toEqual([]);
  const missingJets = snapshot();
  missingJets.teams = missingJets.teams.filter((entry) => entry.team !== "NYJ");
  expect(previewQuestions(game(), missingJets)).toEqual([]);
});

test("a team without a completed offensive and defensive sample cannot supply questions", () => {
  for (const side of [0, 1]) {
    const noGames = snapshot();
    noGames.teams[side].completedGames = 0;
    expect(previewQuestions(game(), noGames)).toEqual([]);
    for (const unit of ["offense", "defense"] as const) {
      const noPlays = snapshot();
      noPlays.teams[side][unit].plays = 0;
      expect(previewQuestions(game(), noPlays)).toEqual([]);
    }
  }
});

test("missing or invalid EPA omits only the question using that split", () => {
  for (const invalid of [null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const analytics = snapshot();
    analytics.teams[1].defense.passEpaPerPlay = invalid;
    expect(previewQuestions(game(), analytics).map((question) => question.id)).toEqual(["rushing", "pass-defense"]);
  }
  const missingOpponentAttack = snapshot();
  missingOpponentAttack.teams[1].offense.passEpaPerPlay = null;
  expect(previewQuestions(game(), missingOpponentAttack).map((question) => question.id)).toEqual(["passing", "rushing"]);
});

test("zero, negative, fractional or non-finite split counts never become a comparison", () => {
  for (const invalid of [null as unknown as number, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const analytics = snapshot();
    analytics.teams[0].offense.rushPlays = invalid;
    expect(previewQuestions(game(), analytics).map((question) => question.id)).toEqual(["passing", "pass-defense"]);
  }
  const noOpponentDefense = snapshot();
  noOpponentDefense.teams[1].defense.passPlays = 0;
  expect(previewQuestions(game(), noOpponentDefense).map((question) => question.id)).toEqual(["rushing", "pass-defense"]);
});

test("a genuine zero EPA is usable and defensive values retain their allowed label and sign", () => {
  const analytics = snapshot();
  analytics.teams[0].offense.passEpaPerPlay = 0;
  analytics.teams[1].defense.passEpaPerPlay = -0.31;
  const questions = previewQuestions(game(), analytics);
  expect(questions).toHaveLength(3);
  expect(questions[0].evidence).toContain("NYJ offense: 0.00 EPA per dropback");
  expect(questions[0].evidence).toContain("CHI defense: -0.31 EPA allowed per dropback");
  expect(JSON.stringify(questions)).not.toMatch(/projected|favored|win probability|league rank/i);
});
