import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildAnalytics, competitionRanks, extractAnalytics, retainAnalytics, validateAnalytics } from './season-analytics.mjs';
import { parseLeagueSchedule, jetsSchedule, publishSnapshot, readSnapshot } from './data-refresh.mjs';

const NOW = new Date('2026-09-29T12:00:00Z');
const SOURCES = { pbp: 'https://example.test/pbp.parquet', schedule: 'https://example.test/schedule.csv', methodology: 'https://nflfastr.com/reference/fast_scraper.html' };
const G1 = { id: '2026_01_BUF_NYJ', season: 2026, week: 1, seasonType: 'REG', date: '2026-09-13', homeTeam: 'NYJ', awayTeam: 'BUF', homeScore: 20, awayScore: 10, status: 'final' };
const G2 = { id: '2026_02_NYJ_MIA', season: 2026, week: 2, seasonType: 'REG', date: '2026-09-20', homeTeam: 'MIA', awayTeam: 'NYJ', homeScore: 21, awayScore: 10, status: 'final' };
const FUTURE = { id: '2026_04_NE_NYJ', season: 2026, week: 4, seasonType: 'REG', date: '2026-10-04', homeTeam: 'NYJ', awayTeam: 'NE', homeScore: null, awayScore: null, status: 'scheduled' };
const state = (game) => ({ ...game, complete: true, runningHome: game.homeScore, runningAway: game.awayScore });
const totals = [
  { id: G1.id, team: 'NYJ', plays: 2, epa: 2, successes: 1, passPlays: 1, passEpa: 2, rushPlays: 1, rushEpa: 0 },
  { id: G1.id, team: 'BUF', plays: 5, epa: -2, successes: 2, passPlays: 3, passEpa: -3, rushPlays: 2, rushEpa: 1 },
  { id: G2.id, team: 'NYJ', plays: 8, epa: 0, successes: 3, passPlays: 6, passEpa: -1, rushPlays: 2, rushEpa: 1 },
  { id: G2.id, team: 'MIA', plays: 6, epa: 3, successes: 4, passPlays: 4, passEpa: 4, rushPlays: 2, rushEpa: -1 },
];
const fixture = (overrides = {}) => buildAnalytics({ season: 2026, schedule: [G1, G2, FUTURE], states: [state(G1), state(G2)], totals, now: NOW, sources: SOURCES, ...overrides });

test('league parser validates non-Jets games while retaining the existing Jets schedule contract', () => {
  const csv = 'game_id,season,game_type,week,gameday,gametime,away_team,away_score,home_team,home_score\n' +
    '2026_01_BUF_NYJ,2026,REG,1,2026-09-13,13:00,BUF,10,NYJ,20\n' +
    '2026_01_NE_MIA,2026,REG,1,2026-09-13,13:00,NE,7,MIA,21';
  const league = parseLeagueSchedule(csv);
  assert.equal(league.length, 2);
  assert.deepEqual(jetsSchedule(league).map((game) => [game.id, game.jetsScore, game.opponent]), [[G1.id, 20, 'BUF']]);
  assert.throws(() => parseLeagueSchedule(csv.replace(',NE,7,MIA,21', ',NE,,MIA,21')), /Incomplete final/);
});

test('EPA and success pool actual plays rather than averaging game averages', () => {
  const value = fixture();
  const jets = value.teams.find((team) => team.team === 'NYJ');
  assert.equal(jets.completedGames, 2);
  assert.equal(jets.offense.plays, 10);
  assert.equal(jets.offense.epaPerPlay, 0.2);
  assert.equal(jets.offense.successRate, 0.4);
  assert.equal(jets.offense.passEpaPerPlay, 1 / 7);
  assert.equal(jets.offense.rushEpaPerPlay, 1 / 3);
  assert.equal(jets.defense.epaPerPlay, 1 / 11);
  assert.equal(jets.defense.successRate, 6 / 11);
  assert.equal(value.games.length, 2);
  assert.equal(value.games[0].offense.epaPerPlay, 1);
  assert.equal(value.games[0].defense.epaPerPlay, -0.4);
});

test('lower defensive allowed EPA ranks better; competition ties share their rank', () => {
  const teams = [{ team: 'A', defense: { epaPerPlay: -0.2 } }, { team: 'B', defense: { epaPerPlay: -0.2 } }, { team: 'C', defense: { epaPerPlay: 0.1 } }];
  assert.deepEqual([...competitionRanks(teams, 'defense', 'epaPerPlay', true)], [['A', 1], ['B', 1], ['C', 3]]);
  const value = fixture();
  assert.equal(value.teams.find((team) => team.team === 'MIA').ranks.defenseEpa, 1);
});

test('teams with zero included plays have null rates and null ranks', () => {
  const team = fixture().teams.find((team) => team.team === 'NE');
  assert.equal(team.completedGames, 0);
  assert.equal(team.offense.epaPerPlay, null);
  assert.equal(team.offense.successRate, null);
  assert.equal(team.ranks.offenseEpa, null);
  assert.equal(team.ranks.defenseSuccess, null);
});

test('a truncated game already at its final score stays pending in league analytics', () => {
  const value = fixture({ states: [state(G1), { ...state(G2), complete: false }] });
  assert.deepEqual(value.analyzedGameIds, [G1.id]);
  assert.deepEqual(value.pendingGameIds, [G2.id]);
  assert.equal(value.throughWeek, 1);
});

test('mismatched finals fail, unreconciled scoring stays pending, and future/postseason games are excluded', () => {
  assert.throws(() => fixture({ states: [{ ...state(G1), homeScore: 99 }] }), /PBP\/schedule mismatch/);
  assert.deepEqual(fixture({ states: [{ ...state(G1), runningHome: 10 }] }).analyzedGameIds, []);
  const futureFinal = { ...FUTURE, status: 'final', homeScore: 20, awayScore: 10 };
  const postseason = { ...G1, id: '2026_19_BUF_NYJ', seasonType: 'POST' };
  const value = fixture({ schedule: [G1, futureFinal, postseason], states: [state(G1), state(futureFinal), state(postseason)] });
  assert.deepEqual(value.analyzedGameIds, [G1.id]);
  assert.deepEqual(value.pendingGameIds, []);
});

test('missing EPA on an entire side prevents promoting an incomplete analytics denominator', () => {
  const value = fixture({ totals: totals.filter((row) => row.team !== 'BUF') });
  assert.deepEqual(value.analyzedGameIds, [G2.id]);
  assert.deepEqual(value.pendingGameIds, [G1.id]);
});

test('unchanged or regressed upstream coverage retains the last real analysis timestamp', () => {
  const previous = fixture();
  const later = new Date('2026-09-30T12:00:00Z');
  assert.equal(retainAnalytics(null, previous, later), previous);
  assert.equal(retainAnalytics(fixture({ now: later }), previous, later), previous);
  assert.equal(retainAnalytics(fixture({ states: [state(G1)], now: later }), previous, later), previous);
  const pendingOnly = { ...fixture({ now: later }), pendingGameIds: ['2026_03_NE_NYJ'] };
  const retained = retainAnalytics(pendingOnly, previous, later);
  assert.equal(retained.analysisUpdatedAt, previous.analysisUpdatedAt);
  assert.deepEqual(retained.pendingGameIds, pendingOnly.pendingGameIds);
});

test('validator rejects fabricated finite ranks/zero-denominator rates and malformed coverage', () => {
  const value = fixture();
  const fakeRate = structuredClone(value);
  fakeRate.teams.find((team) => team.team === 'NE').offense.epaPerPlay = 0;
  assert.throws(() => validateAnalytics(fakeRate), /Invalid analytics rate/);
  const fakeRank = structuredClone(value);
  fakeRank.teams[0].ranks.offenseEpa = 99;
  assert.throws(() => validateAnalytics(fakeRank), /Invalid analytics rank/);
  const badIds = structuredClone(value);
  badIds.pendingGameIds.push(G1.id);
  assert.throws(() => validateAnalytics(badIds), /coverage/);
});

test('validator reconciles split EPA and tolerates only floating-point round-off', () => {
  const badSplit = fixture();
  badSplit.teams.find((team) => team.team === 'NYJ').offense.passEpaPerPlay += 0.01;
  assert.throws(() => validateAnalytics(badSplit), /split EPA does not reconcile/);
  const fractionalSuccess = fixture();
  fractionalSuccess.games[0].offense.successRate = 0.75; // 1.5 successes in two plays.
  assert.throws(() => validateAnalytics(fractionalSuccess), /success count is not a whole play/);
  const roundOff = fixture();
  roundOff.games[0].offense.epaPerPlay += 1e-12;
  assert.doesNotThrow(() => validateAnalytics(roundOff));
});

test('validator derives completed-game counts and team membership from analyzed participants', () => {
  const wrongCount = fixture();
  wrongCount.teams.find((team) => team.team === 'NYJ').completedGames = 0;
  assert.throws(() => validateAnalytics(wrongCount), /team game coverage does not reconcile/);
  const lostCoverage = fixture();
  lostCoverage.analyzedGameIds.pop();
  assert.throws(() => validateAnalytics(lostCoverage), /team game coverage does not reconcile/);
  const missingTeam = fixture();
  missingTeam.teams = missingTeam.teams.filter((team) => team.team !== 'BUF');
  assert.throws(() => validateAnalytics(missingTeam), /game participant missing from teams/);
});

test('validator requires exactly one correctly identified summary for each analyzed Jets game', () => {
  const incomplete = fixture();
  incomplete.games.pop();
  assert.throws(() => validateAnalytics(incomplete), /Jets game coverage is incomplete/);
  const duplicate = fixture();
  duplicate.games.push(structuredClone(duplicate.games[0]));
  assert.throws(() => validateAnalytics(duplicate), /Invalid analytics Jets game coverage/);
  const outsideCoverage = fixture();
  outsideCoverage.games[0].id = '2026_01_BUF_NE';
  assert.throws(() => validateAnalytics(outsideCoverage), /Invalid analytics Jets game coverage/);
  for (const [field, wrong] of [['week', 9], ['opponent', 'NE'], ['atHome', false], ['date', '2026-02-30']]) {
    const badSummary = fixture();
    badSummary.games[0][field] = wrong;
    assert.throws(() => validateAnalytics(badSummary), /Invalid analytics game summary/, field);
  }
});

test('validator pools Jets game denominators, EPA and success back into season totals', () => {
  for (const side of ['offense', 'defense']) {
    const wrongEpa = fixture();
    const row = wrongEpa.games[0][side];
    // Preserve the within-game split identity; only the season pool is wrong.
    row.passEpaPerPlay += 1;
    row.epaPerPlay += row.passPlays / row.plays;
    assert.throws(() => validateAnalytics(wrongEpa), new RegExp(`Jets ${side} game totals.*epa`));
  }
  const wrongSuccess = fixture();
  wrongSuccess.games[0].offense.successRate = 1;
  assert.throws(() => validateAnalytics(wrongSuccess), /Jets offense game totals.*successes/);
  const wrongDenominator = fixture();
  const row = wrongDenominator.games[0].offense;
  row.plays *= 2; row.passPlays *= 2; row.rushPlays *= 2;
  assert.throws(() => validateAnalytics(wrongDenominator), /Jets offense game totals.*plays/);
});

test('validator conserves league offense/defense denominators, EPA and successful plays', () => {
  const wrongDenominator = fixture();
  const denominator = wrongDenominator.teams.find((team) => team.team === 'BUF').defense;
  denominator.plays *= 2; denominator.passPlays *= 2; denominator.rushPlays *= 2;
  assert.throws(() => validateAnalytics(wrongDenominator), /league offense\/defense.*plays/);
  const wrongEpa = fixture();
  const epa = wrongEpa.teams.find((team) => team.team === 'BUF').defense;
  epa.passEpaPerPlay += 1;
  epa.epaPerPlay += epa.passPlays / epa.plays;
  assert.throws(() => validateAnalytics(wrongEpa), /league offense\/defense.*epa/);
  const wrongSuccess = fixture();
  wrongSuccess.teams.find((team) => team.team === 'BUF').defense.successRate = 1;
  assert.throws(() => validateAnalytics(wrongSuccess), /league offense\/defense.*successes/);
});

test('validator reconciles the week cutoff and calendar dates without inventing non-Jets dates', () => {
  const wrongWeek = fixture();
  wrongWeek.throughWeek = 3;
  assert.throws(() => validateAnalytics(wrongWeek), /week cutoff does not match coverage/);
  for (const date of ['2026-02-30', 'not-a-date', G1.date]) {
    const wrongDate = fixture();
    wrongDate.throughDate = date;
    assert.throws(() => validateAnalytics(wrongDate), /date cutoff does not match coverage/, date);
  }
  const otherGame = { ...G1, id: '2026_03_BUF_NE', week: 3, date: '2026-09-28', homeTeam: 'NE' };
  const schedule = [G1, G2, otherGame];
  const value = fixture({
    schedule, states: schedule.map(state),
    totals: [...totals, ...totals.filter((row) => row.id === G1.id).map((row) => ({
      ...row, id: otherGame.id, team: row.team === 'NYJ' ? 'NE' : row.team,
    }))],
  });
  assert.equal(value.games.at(-1).date, G2.date);
  assert.equal(value.throughDate, otherGame.date);
  assert.doesNotThrow(() => validateAnalytics(value));
  assert.doesNotThrow(() => validateAnalytics(value, schedule));
  value.throughDate = '2026-09-29';
  assert.doesNotThrow(() => validateAnalytics(value)); // No non-Jets dates in the snapshot.
  assert.throws(() => validateAnalytics(value, schedule), /date cutoff does not match schedule/);
});

test('the published season snapshot satisfies full coverage and statistical accounting', async () => {
  const published = JSON.parse(await readFile(new URL('../public/data/analytics.json', import.meta.url), 'utf8'));
  assert.doesNotThrow(() => validateAnalytics(published));
});

test('analytics participates in complete staged publication and survives a later omitted enrichment', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ajetsfan-analytics-publish-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const out = path.join(root, 'data');
  const analytics = fixture();
  await publishSnapshot(out, { games: [], curves: new Map(), current: {}, analytics });
  assert.deepEqual((await readSnapshot(out)).analytics, analytics);
  const previousBytes = await readFile(path.join(out, 'analytics.json'), 'utf8');
  await publishSnapshot(out, { games: [], curves: new Map(), current: {} });
  assert.equal(await readFile(path.join(out, 'analytics.json'), 'utf8'), previousBytes);
  await assert.rejects(publishSnapshot(out, { games: [], curves: new Map(), current: {}, analytics: { schemaVersion: 99 } }), /Invalid analytics/);
  assert.equal(await readFile(path.join(out, 'analytics.json'), 'utf8'), previousBytes);
});

test('DuckDB clean-play denominator excludes kneels/spikes/no-plays/non-finite EPA and includes sacks/scrambles as dropbacks', async (t) => {
  const { DuckDBInstance } = await import('@duckdb/node-api');
  const instance = await DuckDBInstance.create(':memory:');
  const db = await instance.connect();
  const root = await mkdtemp(path.join(os.tmpdir(), 'ajetsfan-analytics-pbp-'));
  t.after(() => { db.closeSync(); instance.closeSync(); return rm(root, { recursive: true, force: true }); });
  const file = path.join(root, 'plays.parquet');
  await db.run(`CREATE TABLE pbp(game_id VARCHAR, play_id INTEGER, season_type VARCHAR, home_team VARCHAR, away_team VARCHAR,
    home_score INTEGER, away_score INTEGER, total_home_score INTEGER, total_away_score INTEGER, game_end INTEGER,
    "desc" VARCHAR, down INTEGER, posteam VARCHAR, defteam VARCHAR, play_type VARCHAR, qb_kneel INTEGER,
    qb_spike INTEGER, qb_dropback INTEGER, two_point_attempt INTEGER, epa DOUBLE, qtr INTEGER, game_seconds_remaining INTEGER, wpa DOUBLE)`);
  const entries = [
    [1, 'NYJ', 'BUF', 'pass', 0, 0, 1, 0, 2, 'Complete pass'],
    [2, 'NYJ', 'BUF', 'pass', 0, 0, 1, 0, -1, 'Sack'],
    [3, 'NYJ', 'BUF', 'run', 0, 0, 1, 0, 1, 'Quarterback scramble'],
    [4, 'NYJ', 'BUF', 'run', 0, 0, 0, 0, 0, 'Designed run'],
    [5, 'NYJ', 'BUF', 'run', 1, 0, 0, 0, -2, 'Kneel'],
    [6, 'NYJ', 'BUF', 'pass', 0, 1, 1, 0, -2, 'Spike'],
    [7, 'NYJ', 'BUF', 'no_play', 0, 0, 1, 0, 10, 'Nullified penalty'],
    [8, 'NYJ', 'BUF', 'pass', 0, 0, 1, 0, 'nan', 'Missing EPA'],
    [9, 'NYJ', 'BUF', 'pass', 0, 0, 1, 1, 10, 'Two point'],
    [10, 'BUF', 'NYJ', 'pass', 0, 0, 1, 0, -1, 'Opponent pass'],
  ];
  for (const [id, posteam, defteam, type, kneel, spike, dropback, twoPoint, epa, description] of entries) {
    const epaSql = epa === 'nan' ? "'NaN'::DOUBLE" : epa;
    await db.run(`INSERT INTO pbp VALUES ('${G1.id}',${id},'REG','NYJ','BUF',20,10,20,10,0,'${description}',
      1,'${posteam}','${defteam}','${type}',${kneel},${spike},${dropback},${twoPoint},${epaSql},4,60,0.1)`);
  }
  await db.run(`INSERT INTO pbp VALUES ('${G1.id}',11,'REG','NYJ','BUF',20,10,20,10,1,'END GAME',NULL,
    NULL,NULL,NULL,0,0,0,0,NULL,4,0,NULL)`);
  await db.run(`COPY pbp TO '${file.replaceAll("'", "''")}' (FORMAT PARQUET)`);
  const value = await extractAnalytics(db, 2026, file, [G1], NOW, SOURCES);
  const jets = value.teams.find((team) => team.team === 'NYJ');
  assert.equal(jets.offense.plays, 4);
  assert.equal(jets.offense.epaPerPlay, 0.5);
  assert.equal(jets.offense.successRate, 0.5); // Zero-EPA run is not successful.
  assert.equal(jets.offense.passPlays, 3); // Includes sack and scramble.
  assert.equal(jets.offense.rushPlays, 1);
  assert.equal(jets.offense.passEpaPerPlay, 2 / 3);
  assert.equal(jets.defense.epaPerPlay, -1);
  assert.equal(value.games[0].bigSwings.length, 3);
  assert.equal(value.games[0].bigSwings.some((play) => [5, 6, 7].includes(play.playId)), false);
  await writeFile(path.join(root, 'summary.json'), JSON.stringify(value));
});
