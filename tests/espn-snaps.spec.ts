import { expect, test } from "@playwright/test";
import { confirmedSnapForEspn, espnSnapFixture, parseEspnSnapGame, type EspnSnapFixture } from "../src/lib/espn-snaps";
import type { LiveFootballFeed, LiveFootballGame } from "../src/lib/football-live";
import type { HistoryGame } from "../src/lib/league-history";
import type { Snap, SnapGame } from "../src/lib/snap-types";

// The provider excerpts retain the recorded IDs, sequence, action, clocks, field position and points.
const buffalo: HistoryGame & EspnSnapFixture = {
  id: "2026_10_BUF_NYJ", season: 2026, week: 10, seasonType: "REG", date: "2026-11-15",
  kickoff: "2026-11-15T18:00:00.000Z", atHome: true, opponent: "BUF", opponentDisplay: "BUF",
  jetsScore: 12, oppScore: 31, status: "final", outcome: "loss", espn: "401873054", qb: null, stadium: null,
};
const cleveland: typeof buffalo = {
  ...buffalo, id: "2022_02_NYJ_CLE", season: 2022, week: 2, date: "2022-09-18",
  kickoff: "2022-09-18T17:00:00.000Z", atHome: false, opponent: "CLE", opponentDisplay: "CLE",
  jetsScore: 31, oppScore: 30, outcome: "win", espn: "401437635",
};
const kincaid = {
  id: "4018730542511", sequenceNumber: "251100", period: { number: 3 }, clock: { displayValue: "9:54" },
  type: { text: "Pass Reception" }, text: "(Shotgun) J.Allen pass deep right to D.Kincaid pushed ob at NYJ 8 for 54 yards (D.Belton; M.Moore).",
  homeScore: 9, awayScore: 10, scoringPlay: false, start: { down: 1, distance: 10, yardsToEndzone: 62, team: { id: "2" } },
};
const wilson = {
  id: "4014376354199", sequenceNumber: "419900", period: { number: 4 }, clock: { displayValue: "0:22" },
  type: { text: "Passing Touchdown" },
  text: "Garrett Wilson Pass From Joe Flacco for 15 Yds G.Zuerlein extra point is GOOD, Center-T.Hennessy, Holder-B.Mann.",
  homeScore: 30, awayScore: 31, scoringPlay: true, pointAfterAttempt: { id: 61, text: "Extra Point Good", value: 1 },
  start: { down: 3, distance: 10, yardsToEndzone: 15, team: { id: "20" } },
};
const davis = {
  id: "4014376354276", sequenceNumber: "427600", period: { number: 4 }, clock: { displayValue: "0:06" },
  type: { text: "Pass Interception Return" },
  text: "(:12) (Shotgun) J.Brissett pass deep left intended for A.Cooper INTERCEPTED by A.Davis at NYJ 36. A.Davis to 50 for 14 yards.",
  homeScore: 30, awayScore: 31, scoringPlay: false, start: { down: 1, distance: 10, yardsToEndzone: 54, team: { id: "5" } },
};

function summary(fixture: typeof buffalo, plays: unknown[], drive = 11) {
  const competitor = (id: string, abbreviation: string, home: boolean, score: number | null) =>
    ({ id, team: { id, abbreviation }, homeAway: home ? "home" : "away", score: String(score) });
  return {
    header: { id: fixture.espn, season: { year: fixture.season, type: 2 }, week: fixture.week, competitions: [{
      id: fixture.espn, date: fixture.kickoff!, status: { type: { state: "post", completed: true, name: "STATUS_FINAL" } },
      competitors: [competitor("20", "NYJ", fixture.atHome, fixture.jetsScore),
        competitor(fixture.atHome ? "2" : "5", fixture.opponent, !fixture.atHome, fixture.oppScore)],
    }] },
    drives: { previous: [{ id: fixture.espn + drive, plays }] },
  };
}

const archivedKincaid: Snap = {
  key: "2511", quarter: 3, clock: 594, possession: "opponent", down: 1, distance: 10, yardline: 62, drive: 11,
  before: [9, 10], after: [9, 10], wp: .427, delta: -.116, type: "pass",
  description: "(9:54) (Shotgun) 17-J.Allen pass deep right to 86-D.Kincaid pushed ob at NYJ 8 for 54 yards (6-D.Belton; 27-M.Moore).",
};
const archivedDavis: Snap = {
  key: "4276", quarter: 4, clock: 13, possession: "opponent", down: 1, distance: 10, yardline: 54, drive: 20,
  before: [31, 30], after: [31, 30], wp: .567, delta: .326, type: "pass",
  description: "(:13) (Shotgun) 7-J.Brissett pass deep left intended for 2-A.Cooper INTERCEPTED by 21-A.Davis at NYJ 36. 21-A.Davis to 50 for 14 yards.",
};
const archivedWilson: Snap = {
  key: "4199", quarter: 4, clock: 25, possession: "jets", down: 3, distance: 10, yardline: 15, drive: 19,
  before: [24, 30], after: [30, 30], wp: .261, delta: .312, type: "pass",
  description: "(:25) (Shotgun) 19-J.Flacco pass short middle to 17-G.Wilson for 15 yards, TOUCHDOWN.",
};
const archive = (game: SnapGame, plays: Snap[]): SnapGame => ({ ...game, source: "nflverse", plays });
const current = { season: 2026, schedule: [buffalo] };
const liveGame: LiveFootballGame = {
  eventId: buffalo.espn, gameId: buffalo.id, season: 2026, week: 10, seasonType: "REG", providerWeek: 10,
  kickoff: buffalo.kickoff, opponent: "BUF", opponentDisplay: "Buffalo Bills", atHome: true, state: "final",
  jetsScore: 12, oppScore: 31, period: 4, clock: null, detail: "Final", provisional: false, players: [],
};
const feed = (game: LiveFootballGame): LiveFootballFeed => ({
  schemaVersion: 1, season: game.season, source: "", status: "ready", checkedAt: null, attemptedAt: "", games: [game], featured: null,
});

test("binds the matched feed when history is absent, and keeps a prior-season event after the feature rotates", () => {
  expect(espnSnapFixture(buffalo.id, current, [], feed(liveGame))?.espn).toBe(buffalo.espn);
  expect(espnSnapFixture(cleveland.id, current, [cleveland], feed(liveGame))?.espn).toBe(cleveland.espn);
  expect(espnSnapFixture(buffalo.id, current, [{ ...buffalo, espn: "401000001" }], feed(liveGame))).toBeNull();
  expect(espnSnapFixture(buffalo.id, current, [], feed({ ...liveGame, jetsScore: 13 }))).toBeNull();
  expect(espnSnapFixture(buffalo.id, current, [], feed({ ...liveGame, opponent: "NE" }))).toBeNull();
  expect(espnSnapFixture(buffalo.id, current, [], feed({ ...liveGame, kickoff: "2026-11-15T18:10:00Z" }))).toBeNull();
  expect(espnSnapFixture(buffalo.id, current, [{ ...buffalo, oppScore: 21 }], null)).toBeNull();
  expect(espnSnapFixture(cleveland.id, current, [{ ...cleveland, kickoff: null }], null)).toBeNull();
});

test("checks both event IDs, season, week, sides, kickoff and completed scoreboard", () => {
  const play = summary(cleveland, [davis]);
  const comp = play.header.competitions[0];
  const good = parseEspnSnapGame(play, cleveland);
  expect(good?.final).toEqual([31, 30]);
  expect(parseEspnSnapGame({ ...play, header: { ...play.header, id: buffalo.espn } }, cleveland)).toBeNull();
  const changeComp = (overrides: object) => ({ ...play, header: { ...play.header, competitions: [{ ...comp, ...overrides }] } });
  expect(parseEspnSnapGame(changeComp({ id: buffalo.espn }), cleveland)).toBeNull();
  expect(parseEspnSnapGame({ ...play, header: { ...play.header, week: 5 } }, cleveland)).toBeNull();
  expect(parseEspnSnapGame(changeComp({ date: "2022-09-18T17:01Z" }), cleveland)).toBeNull();
  expect(parseEspnSnapGame(changeComp({ competitors: comp.competitors.map(v => ({ ...v, homeAway: "home" })) }), cleveland)).toBeNull();
  expect(parseEspnSnapGame(changeComp({ competitors: [{ ...comp.competitors[0], score: undefined }, comp.competitors[1]] }), cleveland)).toBeNull();
  expect(parseEspnSnapGame(play, { ...cleveland, jetsScore: 30, oppScore: 31 })).toBeNull();
});

test("preserves provider sequence, native drive identity, incomplete facts and probability orientation", () => {
  const earlier = { ...kincaid, id: "4018730542200", sequenceNumber: "900", start: {}, homeScore: null };
  const s = summary(buffalo, [kincaid, earlier]);
  const game = parseEspnSnapGame({ ...s, drives: { ...s.drives, current: s.drives.previous[0] },
    winprobability: [{ playId: kincaid.id, homeWinPercentage: .1481, tiePercentage: 0 }] }, buffalo);
  expect(game?.plays.map(p => p.key)).toEqual(["e-" + earlier.id, "e-" + kincaid.id]);
  expect(game?.plays[0]).toMatchObject({ before: null, after: null, down: null, possession: null, yardline: null });
  expect(game?.plays[1]).toMatchObject({ clock: 594, possession: "opponent", yardline: 62, drive: 11,
    before: [9, 10], after: [9, 10], wp: null, postWp: .148 });
  const away = parseEspnSnapGame({ ...summary(cleveland, [davis]), winprobability: [
    { playId: davis.id, homeWinPercentage: .25, tiePercentage: .1 },
  ] }, cleveland);
  expect(away?.plays[0].postWp).toBe(.65);
});

test("removes every conflicting ID and shared sequence while retaining an identical drive overlay", () => {
  const dupe = { ...kincaid, id: "4018730542555" };
  const collision = { ...kincaid, sequenceNumber: "999999" };
  const valid = { ...kincaid, id: "4018730543333", sequenceNumber: "1000000" };
  const game = parseEspnSnapGame(summary(buffalo, [
    kincaid, dupe, { ...dupe, text: "Correction" }, collision, valid, { ...valid },
  ]), buffalo);
  expect(game?.plays.map(p => p.key)).toEqual(["e-" + valid.id]);
  expect(parseEspnSnapGame(summary(buffalo, [kincaid, dupe, valid]), buffalo)?.plays.map(p => p.key)).toEqual(["e-" + valid.id]);
});

test("keeps pregame or missing drives pending and withholds a final when the summary rolls back", () => {
  const s = summary(buffalo, [kincaid]);
  const pregame = { ...s, header: { ...s.header, competitions: [{ ...s.header.competitions[0],
    status: { type: { name: "STATUS_SCHEDULED", state: "pre", completed: false } },
  }] } };
  expect(parseEspnSnapGame(pregame, { ...buffalo, status: "scheduled", jetsScore: null, oppScore: null })?.plays).toEqual([]);
  expect(parseEspnSnapGame(pregame, buffalo)).toBeNull();
  expect(parseEspnSnapGame({ ...s, drives: null }, buffalo)?.plays).toEqual([]);
  expect(parseEspnSnapGame(null, buffalo)).toBeNull();
});

test("confirms Allen–Kincaid and Davis on recorded actions, including Cleveland's end clock", () => {
  const bills = parseEspnSnapGame(summary(buffalo, [kincaid]), buffalo)!;
  expect(confirmedSnapForEspn(bills, bills.plays[0], archive(bills, [archivedKincaid]))?.key).toBe("2511");
  const browns = parseEspnSnapGame(summary(cleveland, [davis], 20), cleveland)!;
  const next = { ...archivedDavis, key: "4307", clock: 6, type: "qb_kneel" };
  expect(confirmedSnapForEspn(browns, browns.plays[0], archive(browns, [archivedDavis, next]))?.key).toBe("4276");
  expect(confirmedSnapForEspn(browns, browns.plays[0], archive(browns, [archivedDavis, { ...next, clock: 8 }]))).toBeNull();
});

test("refuses mismatched actions, ambiguous keys in either game, missing corroboration and mismatched fixtures", () => {
  const game = parseEspnSnapGame(summary(buffalo, [kincaid]), buffalo)!;
  const selected = game.plays[0];
  const stored = archive(game, [archivedKincaid]);
  expect(confirmedSnapForEspn(game, selected, { ...stored, id: cleveland.id })).toBeNull();
  expect(confirmedSnapForEspn(game, selected, { ...stored, plays: [archivedKincaid, archivedKincaid] })).toBeNull();
  expect(confirmedSnapForEspn({ ...game, plays: [selected, selected] }, selected, stored)).toBeNull();
  expect(confirmedSnapForEspn({ ...game, eventId: cleveland.espn }, selected, stored)).toBeNull();
  for (const change of [
    { description: archivedKincaid.description.replace("Kincaid", "Shakir") },
    { description: archivedKincaid.description.replace("54 yards", "14 yards") },
    { type: "run" }, { after: null }, { quarter: 2 }, { yardline: null },
  ]) expect(confirmedSnapForEspn(game, selected, archive(game, [{ ...archivedKincaid, ...change }]))).toBeNull();
  const correction = parseEspnSnapGame(summary(buffalo, [{ ...kincaid, text: "J.Allen pass incomplete." }]), buffalo)!;
  expect(correction.plays[0].key).toBe(selected.key);
  expect(confirmedSnapForEspn(correction, correction.plays[0], stored)).toBeNull();
});

test("keeps Wilson's aggregate e-ID without disclosing the extra point or its scoreboard and model", () => {
  const game = parseEspnSnapGame({ ...summary(cleveland, [wilson, davis], 19), winprobability: [
    { playId: wilson.id, homeWinPercentage: .02, tiePercentage: 0 },
  ] }, cleveland)!;
  const play = game.plays[0];
  expect(play).toMatchObject({ key: "e-4014376354199", description: "Garrett Wilson Pass From Joe Flacco for 15 Yds, touchdown.",
    after: null, postWp: null, clock: 22 });
  expect(confirmedSnapForEspn(game, play, archive(game, [archivedWilson, archivedDavis]))).toBeNull();
  expect(JSON.stringify(play)).not.toMatch(/Zuerlein|extra point|Brissett|INTERCEPTED/i);
});

test("removes later injury and play notes from ESPN's completed account while keeping this snap's ruling", () => {
  const note = " ** Injury Update: NYJ-A.Thomas has returned to the game.";
  const later = " The Jets scored on the next play. Play Challenged by NYJ and Upheld.";
  const s = summary(buffalo, [{ ...kincaid, text: kincaid.text + later + note }]);
  const play = parseEspnSnapGame(s, buffalo)!.plays[0];
  expect(play.description).toContain("D.Kincaid");
  expect(play.description).toContain("Upheld");
  expect(play.description).not.toMatch(/Jets scored|Injury Update|returned to the game/);
});

test("an earlier insertion preserves the original provider selection and its reciprocal archive key", () => {
  const inserted = { ...kincaid, id: "4018730542476", sequenceNumber: "247600", clock: { displayValue: "10:02" } };
  const corrected = parseEspnSnapGame(summary(buffalo, [kincaid, inserted]), buffalo)!;
  expect(corrected.plays[1].key).toBe("e-4018730542511");
  expect(confirmedSnapForEspn(corrected, corrected.plays[1], archive(corrected, [archivedKincaid]))?.key).toBe("2511");
});
