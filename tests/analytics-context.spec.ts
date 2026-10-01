import { test, expect } from "@playwright/test";
import { leagueMetric, wpaLabel } from "../src/lib/analytics-context";
import { epaLabel, type RateMetrics, type TeamAnalytics } from "../src/lib/analytics";

const rates = (value: number, plays: number): RateMetrics => ({ plays, epaPerPlay: value, successRate: .5, passPlays: Math.floor(plays / 2), passEpaPerPlay: value + .1, rushPlays: plays - Math.floor(plays / 2), rushEpaPerPlay: value - .1 });
const team = (name: string, value: number, plays: number): TeamAnalytics => ({ team: name, completedGames: 1, offense: rates(value, plays), defense: rates(value, plays), ranks: { offenseEpa: null, defenseEpa: null, offenseSuccess: null, defenseSuccess: null } });

test("league baselines pool by the correct denominator and ranks reverse for defense", () => {
  const teams = [team("NYJ", .3, 10), team("CHI", -.1, 30), team("BUF", -.1, 20)];
  const offense = leagueMetric(teams, "offense", "epaPerPlay");
  expect(offense.plays).toBe(60);
  expect(offense.mean).toBeCloseTo(-2 / 60, 12);
  expect(offense.entries.map(({ team, rank }) => [team, rank])).toEqual([["NYJ", 1], ["BUF", 2], ["CHI", 2]]);
  const defense = leagueMetric(teams, "defense", "epaPerPlay");
  expect(defense.entries.map(({ team, rank }) => [team, rank])).toEqual([["BUF", 1], ["CHI", 1], ["NYJ", 3]]);
  expect(defense.mean).toBeCloseTo(offense.mean!, 12);
  const splitTeams = [team("NYJ", .3, 11), team("CHI", -.1, 30)];
  expect(leagueMetric(splitTeams, "offense", "passEpaPerPlay").mean).toBeCloseTo(.1, 12);
  expect(leagueMetric(splitTeams, "offense", "rushEpaPerPlay").mean).toBeCloseTo((.2 * 6 - .2 * 15) / 21, 12);
  expect(leagueMetric(splitTeams, "offense", "successRate").mean).toBe(.5);
});

test("empty and invalid samples do not receive ranks or affect the league benchmark", () => {
  const good = team("NYJ", .2, 10);
  const missing = team("CHI", .9, 30); missing.offense.epaPerPlay = null;
  const empty = team("BUF", .9, 0);
  const noGames = team("NE", .9, 30); noGames.completedGames = 0;
  const nonFinite = team("MIA", NaN, 30);
  expect(leagueMetric([good, missing, empty, noGames, nonFinite], "offense", "epaPerPlay")).toEqual({ mean: .2, plays: 10, teams: 1, entries: [{ team: "NYJ", value: .2, plays: 10, rank: 1, completedGames: 1 }] });
  expect(leagueMetric([], "defense", "epaPerPlay")).toEqual({ mean: null, plays: 0, teams: 0, entries: [] });
});

test("display precision never creates signed zero and WPA distinguishes zero from missing", () => {
  expect(epaLabel(-.00001, 3)).toBe("0.000");
  expect(epaLabel(.00001)).toBe("0.00");
  expect(epaLabel(.0444, 3)).toBe("+0.044");
  expect(epaLabel(null, 3)).toBe("—");
  expect(wpaLabel(-.168)).toBe("-16.8 percentage points");
  expect(wpaLabel(.12)).toBe("+12.0 percentage points");
  expect(wpaLabel(0)).toBe("0.0 percentage points");
  expect(wpaLabel(null)).toBe("Unavailable");
  expect(wpaLabel(NaN)).toBe("Unavailable");
  expect(wpaLabel(1.1)).toBe("Unavailable");
});


test("league ranks retain canonical ties within floating-point tolerance", () => {
  const teams = [team("NYJ", .2, 10), team("CHI", .2 + 5e-13, 10), team("BUF", .1, 10)];
  expect(leagueMetric(teams, "offense", "epaPerPlay").entries.map(({ team, rank }) => [team, rank])).toEqual([["CHI", 1], ["NYJ", 1], ["BUF", 3]]);
  expect(leagueMetric(teams, "defense", "epaPerPlay").entries.map(({ team, rank }) => [team, rank])).toEqual([["BUF", 1], ["NYJ", 2], ["CHI", 2]]);
});
