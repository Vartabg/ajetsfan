import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildDiscoveries } from "../src/lib/discoveries";
import type { Game } from "../src/lib/games";

function game(week: number, changes: Partial<Game> = {}): Game {
  return {
    id: `2022_${String(week).padStart(2, "0")}_NYJ_CLE`, dataSuspect: false,
    season: 2022, week, seasonType: "REG", date: `2022-09-${String(week + 10).padStart(2, "0")}`,
    opponent: "CLE", opponentDisplay: "CLE", atHome: false,
    jetsScore: 31, oppScore: 30, outcome: "win", swing: .2, peakH2Wp: .9, troughH2Wp: .2,
    wentToOt: false, roof: "outdoors", temp: 65, wind: 2,
    keyPlay: { desc: "Quarterback pass for a touchdown.", wpa: .2, qtr: 4, secondsLeft: 30 },
    ...changes,
  };
}

test("discovery boundaries are strict, with separate outcome denominators and honest dates", () => {
  const records = [
    game(1, { troughH2Wp: .009, swing: .009 }),
    game(2, { troughH2Wp: .01, swing: .01 }),
    game(3, { outcome: "loss", jetsScore: 30, oppScore: 31, peakH2Wp: .95, swing: .95 }),
    game(4, { outcome: "loss", jetsScore: 30, oppScore: 31, peakH2Wp: .951, swing: .951 }),
    game(5, { dataSuspect: true, troughH2Wp: .001, swing: .001 }),
  ];
  const discoveries = buildDiscoveries(records);
  expect(discoveries.belowOnePercent.map((record) => record.id)).toEqual([records[0].id]);
  expect(discoveries.aboveNinetyFivePercent.map((record) => record.id)).toEqual([records[3].id]);
  expect(discoveries.scope).toEqual({ games: 4, wins: 2, losses: 2, firstSeason: 2022, lastSeason: 2022,
    firstDate: "2022-09-11", lastDate: "2022-09-14" });
});

test("invalid probabilities, contradictory scores, duplicate fixtures and suspect PBP are excluded", () => {
  const invalid: Game[] = [
    game(1, { swing: Number.NaN }), game(2, { troughH2Wp: -1 }), game(3, { troughH2Wp: 1.01 }),
    game(4, { troughH2Wp: Number.POSITIVE_INFINITY }), game(5, { troughH2Wp: null }),
    game(6, { outcome: "loss" }), game(7, { dataSuspect: true }),
    game(8, { id: "2022_08_CLE_NYJ" }), game(9, { jetsScore: 31.5 }),
    game(10, { outcome: "loss", jetsScore: 30, oppScore: 31, peakH2Wp: Number.NaN }),
    game(11), game(11),
  ];
  expect(buildDiscoveries(invalid)).toEqual({ scope: { games: 0, wins: 0, losses: 0,
    firstSeason: null, lastSeason: null, firstDate: null, lastDate: null },
  belowOnePercent: [], aboveNinetyFivePercent: [], biggestKeyPlays: [], sameScore: null });
  expect(buildDiscoveries([])).toEqual(buildDiscoveries(invalid));
});

test("a missing unrelated second-half estimate does not discard a valid observation", () => {
  const win = game(1, { troughH2Wp: .003, swing: .003, peakH2Wp: null });
  const loss = game(2, { outcome: "loss", jetsScore: 30, oppScore: 31, peakH2Wp: .98, swing: .98, troughH2Wp: null });
  const discoveries = buildDiscoveries([win, loss]);
  expect(discoveries.scope).toMatchObject({ games: 2, wins: 1, losses: 1 });
  expect(discoveries.belowOnePercent).toEqual([win]);
  expect(discoveries.aboveNinetyFivePercent).toEqual([loss]);
});

test("recorded key-play changes compare absolute WPA and reject administrative or unrecorded action", () => {
  const makePlay = (week: number, desc: string | null, wpa: number | null, qtr = 4) =>
    game(week, { keyPlay: { desc, wpa, qtr, secondsLeft: 30 } });
  const positive = makePlay(1, "Quarterback pass for a touchdown. (Timeout #1.)", .7);
  const negative = makePlay(2, "Quarterback pass intercepted.", -.8);
  const overtime = makePlay(3, "A 48 yard field goal is No Good.", .6, 5);
  const invalid = [
    makePlay(4, "END QUARTER 4", .99), makePlay(5, "Timeout #1", .99),
    makePlay(6, "Two-Minute Warning", .99), makePlay(7, "*** play under review ***", .99),
    makePlay(8, "Quarterback pass incomplete. No Play.", .99), makePlay(9, "Quarterback kneels.", .99),
    makePlay(10, "Quarterback spiked the ball.", .99), makePlay(11, null, .99),
    makePlay(12, "Quarterback pass for a touchdown.", Number.NaN),
    makePlay(13, "Quarterback pass for a touchdown.", 1.01),
    makePlay(14, "Quarterback pass for a touchdown.", null),
    makePlay(15, "Quarterback pass for a touchdown.", .99, 2),
    makePlay(16, "Quarterback pass for a touchdown.", .99, 3.5),
  ];
  const discoveries = buildDiscoveries([...invalid, positive, negative, overtime]);
  expect(discoveries.biggestKeyPlays).toEqual([negative, positive, overtime]);
  expect(discoveries.scope.games).toBe(16); // Missing action excludes the play comparison, not the game estimate.
});

test("same-score comparison uses exact Jets/opponent orientation and counts all candidate pairs", () => {
  const low = game(1, { troughH2Wp: .05, swing: .05 });
  const middle = game(2, { troughH2Wp: .5, swing: .5 });
  const high = game(3, { troughH2Wp: .85, swing: .85, seasonType: "POST" });
  const otherScoreA = game(4, { jetsScore: 24, oppScore: 21, troughH2Wp: .2 });
  const otherScoreB = game(5, { jetsScore: 24, oppScore: 21, troughH2Wp: .3 });
  const reverse = game(6, { jetsScore: 30, oppScore: 31, outcome: "loss", peakH2Wp: .98, swing: .98 });
  const suspect = game(7, { troughH2Wp: 0, dataSuspect: true });
  const best = buildDiscoveries([high, reverse, otherScoreA, middle, suspect, otherScoreB, low]).sameScore;
  expect(best).toMatchObject({ low, high, jetsScore: 31, oppScore: 30, pairCount: 4 });
  expect(best?.gap).toBeCloseTo(.8);
  expect(buildDiscoveries([reverse, low]).sameScore).toBeNull();
});

test("equal key-play magnitudes and same-score gaps are deterministic across input order", () => {
  const records = [game(1, { troughH2Wp: .1 }), game(2, { troughH2Wp: .9 }),
    game(3, { jetsScore: 24, oppScore: 21, troughH2Wp: .1 }),
    game(4, { jetsScore: 24, oppScore: 21, troughH2Wp: .9 })];
  const forward = buildDiscoveries(records);
  expect(buildDiscoveries(records.toReversed())).toEqual(forward);
  expect(forward.sameScore?.low).toEqual(records[0]);
  expect(forward.sameScore?.high).toEqual(records[1]);
  expect(forward.biggestKeyPlays.map((record) => record.id)).toEqual(records.map((record) => record.id));
  const identicalLows = buildDiscoveries([game(2), game(1)]).sameScore;
  expect(identicalLows).toMatchObject({ low: game(1), high: game(2), gap: 0, pairCount: 1 });
});

test("the archive supports the score-twin example and both wins below one percent", () => {
  const archive = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/games.json"), "utf8")) as Game[];
  const twins = archive.filter((record) => ["2016_08_NYJ_CLE", "2007_03_MIA_NYJ"].includes(record.id));
  const comparison = buildDiscoveries(twins).sameScore;
  expect(comparison?.low.id).toBe("2016_08_NYJ_CLE");
  expect(comparison?.high.id).toBe("2007_03_MIA_NYJ");
  expect(comparison).toMatchObject({ jetsScore: 31, oppScore: 28, pairCount: 1 });
  expect(comparison?.gap).toBeCloseTo(.7391027361);
  const discoveries = buildDiscoveries(archive);
  expect(discoveries.belowOnePercent.map((record) => record.id)).toEqual(expect.arrayContaining([
    "2022_02_NYJ_CLE", "2000_08_MIA_NYJ",
  ]));
  expect(discoveries.aboveNinetyFivePercent.map((record) => record.id)).toEqual(expect.arrayContaining([
    "2018_16_GB_NYJ", "2017_07_NYJ_MIA", "2019_01_BUF_NYJ", "1999_07_NYJ_OAK",
  ]));
  expect(discoveries.biggestKeyPlays.every((record) => record.id !== "2011_05_NYJ_NE")).toBe(true);
});
