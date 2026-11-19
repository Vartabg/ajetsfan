import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { DuckDBInstance } from '@duckdb/node-api';
import { parseSnapSeason, snapDescription, snapMatchesFixture } from '../src/lib/snap-data.ts';
import { refreshSnapData, verifiedSnapGame } from './snap-data.mjs';

const fixture = {
  id: '2022_02_NYJ_CLE', season: 2022, week: 2, seasonType: 'REG', date: '2022-09-18',
  atHome: false, opponent: 'CLE', opponentDisplay: 'CLE', jetsScore: 7, oppScore: 0,
  outcome: 'win', swing: 0.125, dataSuspect: false,
};

function sourceRows() {
  const first = {
    game_id: fixture.id, season: 2022, week: 2, season_type: 'REG', game_date: fixture.date,
    home_team: 'CLE', away_team: 'NYJ', home_score: 0, away_score: 7, total_home_score: 0, total_away_score: 6,
    play_id: 991, order_sequence: 100, qtr: 4, quarter_seconds_remaining: 25, posteam: 'NYJ',
    play_type: 'pass', down: 1, ydstogo: 10, yardline_100: 12, fixed_drive: 3, posteam_score: 0, defteam_score: 0,
    posteam_score_post: 6, defteam_score_post: 0, home_wp: 0.87654, away_wp: 0.12346, wpa: 0.31056,
    description: 'Touchdown pass.', terminal: false,
  };
  const kick = { ...first, play_id: 311, order_sequence: 200, quarter_seconds_remaining: 22,
    play_type: 'extra_point', down: null, yardline_100: 15, total_away_score: 7,
    posteam_score: 6, posteam_score_post: 7, home_wp: null, away_wp: null, wpa: null,
    description: 'The extra point is good.' };
  const lastPass = { ...kick, play_id: 341, order_sequence: 300, posteam: 'CLE', play_type: 'pass',
    down: 3, ydstogo: 5, yardline_100: 48, fixed_drive: 4, posteam_score: 0, defteam_score: 7,
    posteam_score_post: 0, defteam_score_post: 7, wpa: -0.1269, description: 'Pass intercepted.' };
  const end = { ...lastPass, play_id: 355, order_sequence: 400, quarter_seconds_remaining: 0,
    play_type: null, description: 'END GAME', terminal: true };
  return [first, kick, lastPass, end];
}

test('source order, shared clocks, oriented scores and missing model survive extraction', () => {
  const [touchdown, kick, interception, end] = sourceRows();
  const game = verifiedSnapGame(fixture, [interception, touchdown, end, kick]);
  assert.deepEqual(game.plays.map((play) => play.key), ['991', '311', '341']);
  assert.deepEqual(game.plays[0], { key: '991', quarter: 4, clock: 25, possession: 'jets',
    down: 1, distance: 10, yardline: 12, before: [0, 0], after: [6, 0], drive: 3,
    wp: 0.123, delta: 0.311, type: 'pass', description: 'Touchdown pass.' });
  assert.deepEqual(game.plays[1].after, [7, 0]);
  assert.deepEqual([game.plays[1].wp, game.plays[1].delta, game.plays[2].wp], [null, null, null]);
  assert.deepEqual([game.plays[2].before, game.plays[2].delta, game.plays[2].possession], [[7, 0], 0.127, 'opponent']);
  assert.equal(game.plays[1].clock, game.plays[2].clock);
  const oldest = sourceRows().map((row) => ({ ...row, order_sequence: null }));
  assert.deepEqual(verifiedSnapGame(fixture, oldest).plays, game.plays);
  oldest[0].play_type = null;
  oldest[0].action = true;
  assert.deepEqual(verifiedSnapGame(fixture, oldest).plays[0], { ...game.plays[0], type: null });
});

test('score fallbacks use the immediate running score from the correct side of the play', () => {
  const rows = sourceRows();
  rows[0].posteam_score = null;
  rows[0].posteam_score_post = null;
  rows[1].posteam_score = null;
  rows[1].posteam_score_post = null;
  rows[1].total_away_score = null;
  rows[2].defteam_score = null;
  const [first, kick, interception] = verifiedSnapGame(fixture, rows).plays;
  assert.deepEqual([first.before, first.after], [null, [6, 0]]);
  assert.deepEqual([kick.before, kick.after, interception.before], [[6, 0], null, null]);
  assert.deepEqual(interception.after, [7, 0]);
});

test('play descriptions withhold later notes but retain penalties and replay rulings', () => {
  assert.equal(snapDescription('Run left for 3 yards. ** Injury Update: NYJ-98-B.Hector has returned to the game. PENALTY on NYJ, Holding - No Play.'),
    'Run left for 3 yards. PENALTY on NYJ, Holding - No Play.');
  assert.equal(snapDescription('Pass complete. NE attempted a QB sneak on next play, but it was nullified by challenge. Play Challenged by NYJ and REVERSED. Pass incomplete.'),
    'Pass complete. Play Challenged by NYJ and REVERSED. Pass incomplete.');
  assert.equal(snapDescription('Run to NYJ 4. Player was injured during the play. He is Out. Play Challenged and Upheld.'),
    'Run to NYJ 4. Player was injured during the play. Play Challenged and Upheld.');
  assert.equal(snapDescription('Pass complete. His return is Questionable. Injury update: Another player has a cramp. His return is probable.'),
    'Pass complete.');
  assert.equal(snapDescription('Run left. JJ54 Shoulder sprain, will not return.'), 'Run left.');
});

test('ambiguous identities, incomplete endings and inconsistent source evidence withhold a game', () => {
  const changes = [
    (rows) => { rows[0].play_id = rows[1].play_id; },
    (rows) => { rows[0].order_sequence = rows[1].order_sequence; },
    (rows) => { rows[0].order_sequence = null; },
    (rows) => { rows.pop(); },
    (rows) => { rows.at(-1).terminal = false; },
    (rows) => { rows.at(-1).total_away_score = 6; },
    (rows) => { rows[0].away_score = 6; },
    (rows) => { rows[0].home_team = 'BUF'; },
    (rows) => { rows[0].game_date = '2022-09-17'; },
    (rows) => { rows[0].posteam_score_post = 7; },
    (rows) => { rows[1].posteam_score = 5; },
  ];
  for (const change of changes) {
    const rows = sourceRows();
    change(rows);
    assert.equal(verifiedSnapGame(fixture, rows), null);
  }
});

test('a restored or corrected edition checks identity, teams, date and final on reads', () => {
  const game = verifiedSnapGame(fixture, sourceRows());
  assert.equal(snapMatchesFixture(game, fixture), true);
  assert.equal(snapMatchesFixture(game, undefined), false);
  for (const correction of [{ id: '2022_03_NYJ_CLE' }, { date: '2022-09-19' }, { atHome: true },
    { opponent: 'BUF' }, { jetsScore: 8 }, { oppScore: 1 }]) {
    assert.equal(snapMatchesFixture(game, { ...fixture, ...correction }), false);
  }
  const envelope = { schemaVersion: 1, season: 2022, games: [game] };
  assert.throws(() => parseSnapSeason(JSON.stringify(envelope), 2021));
  assert.throws(() => parseSnapSeason(JSON.stringify({ ...envelope, games: [game, game] }), 2022));
  game.plays[1].key = game.plays[0].key;
  assert.throws(() => parseSnapSeason(JSON.stringify(envelope), 2022));
});

test('offline publication is deterministic and retains a valid season through partial and failed refreshes', async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'snap-data-test-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const dataDir = path.join(temp, 'data');
  await mkdir(dataDir);
  const current = { schemaVersion: 1, season: 2022, checkedAt: '2022-10-01T04:00:00Z', schedule: [{ ...fixture, status: 'final' }] };
  await writeFile(path.join(dataDir, 'current.json'), JSON.stringify(current));
  await writeFile(path.join(dataDir, 'games.json'), JSON.stringify([fixture]));
  const instance = await DuckDBInstance.create(':memory:');
  const db = await instance.connect();
  t.after(() => { db.closeSync(); instance.closeSync(); });
  const parquet = path.join(temp, '2022.parquet'), input = path.join(temp, 'plays.json');
  const supply = async (rows) => {
    await writeFile(input, JSON.stringify(rows.map(({ description, terminal, ...row }) =>
      ({ ...row, desc: description, game_end: Number(terminal), pass_attempt: Number(row.play_type === 'pass'),
        rush_attempt: 0, penalty: 0 }))));
    await db.run(`COPY (SELECT * FROM read_json_auto('${input.replaceAll("'", "''")}')) TO '${parquet.replaceAll("'", "''")}' (FORMAT PARQUET)`);
  };
  await supply(sourceRows().reverse());
  const warnings = [];
  const offline = { dataDir, sourceDir: temp, onWarning: (message) => warnings.push(message) };
  assert.deepEqual(await refreshSnapData(offline), [2022]);
  const file = path.join(dataDir, 'snaps', '2022.json.gz');
  const original = await readFile(file);
  const [saved] = parseSnapSeason(gunzipSync(original).toString('utf8'), 2022);
  assert.deepEqual(saved, verifiedSnapGame(fixture, sourceRows()));
  assert.deepEqual(await refreshSnapData(offline), []);
  await rm(file);
  assert.deepEqual(await refreshSnapData(offline), [2022]);
  assert.deepEqual(await readFile(file), original);

  // A partly refreshed edition contains a new verified final without its PBP.
  // Even another game's revised plays must wait for the complete replacement season.
  const next = { ...fixture, id: '2022_03_CIN_NYJ', date: '2022-09-25', week: 3, atHome: true, opponent: 'CIN', opponentDisplay: 'CIN' };
  await writeFile(path.join(dataDir, 'games.json'), JSON.stringify([fixture, next]));
  await writeFile(path.join(dataDir, 'current.json'), JSON.stringify({ ...current,
    schedule: [...current.schedule, { ...next, status: 'final' }] }));
  const updated = sourceRows();
  updated[0].description = 'Revised touchdown description.';
  await supply(updated);
  assert.deepEqual(await refreshSnapData(offline), []);
  assert.match(warnings.at(-1), /2022_03_CIN_NYJ/);
  assert.deepEqual(await readFile(file), original);
  await rm(parquet);
  assert.deepEqual(await refreshSnapData(offline), []);
  assert.deepEqual(await refreshSnapData({ dataDir, fetcher: async () => new Response(null, { status: 503 }),
    onWarning: (message) => warnings.push(message) }), []);
  assert.deepEqual(await readFile(file), original);
  await writeFile(parquet, 'not a parquet');
  await assert.rejects(refreshSnapData(offline));
  assert.deepEqual(await readFile(file), original);
});

test('published historical seasons reproduce the two-minute cohort and its linked source plays', async () => {
  const readSeason = async (year) => parseSnapSeason(gunzipSync(await readFile(
    new URL(`../public/data/snaps/${year}.json.gz`, import.meta.url))).toString('utf8'), year);
  const seasons = await Promise.all(Array.from({ length: 27 }, (_, i) => readSeason(1999 + i)));
  const games = seasons.flat();
  const cohort = games.map((game) => {
    const plays = game.plays.filter((p) => p.quarter === 4 && p.clock > 0 && p.clock <= 120 &&
      (p.type === 'pass' || p.type === 'run') && p.wp !== null);
    return { game, low: Math.min(...plays.map((p) => p.wp)) };
  }).filter((row) => Number.isFinite(row.low));
  assert.equal(cohort.length, 428);
  assert.deepEqual([0.01, 0.05, 0.10].map((cutoff) => {
    const matches = cohort.filter((row) => row.low < cutoff);
    return [matches.length, matches.filter(({ game }) => game.final[0] > game.final[1]).length];
  }), [[135, 1], [181, 2], [199, 5]]);
  const early = games.find((game) => game.id === '1999_02_NYJ_BUF').plays.find((play) => play.key === '1425');
  assert.equal(early.type, null);
  assert.match(early.description, /D\.Ward left tackle/);
  const cleveland = games.find((game) => game.id === '2022_02_NYJ_CLE');
  const wilson = cleveland.plays.findIndex((play) => play.key === '4199');
  assert.deepEqual([cleveland.plays[wilson].before, cleveland.plays[wilson].after,
    cleveland.plays[wilson + 1].type, cleveland.plays[wilson + 1].after], [[24, 30], [30, 30], 'extra_point', [31, 30]]);
  assert.match(cleveland.plays.find((play) => play.key === '4276').description, /INTERCEPTED by 21-A\.Davis/);
  const oakland = games.find((game) => game.id === '2013_14_OAK_NYJ');
  const recovered = oakland.plays.findIndex((p) => p.key === '3938');
  assert.equal(oakland.plays[recovered].clock, 235);
  assert.ok(oakland.plays.slice(recovered + 1).some((p) => p.key === '3901' && p.clock === 2));
  const ne = games.find((game) => game.id === '2002_02_NE_NYJ').plays.find((play) => play.key === '1529');
  assert.doesNotMatch(ne.description, /next play/i);
  assert.match(ne.description, /REVERSED.*pass incomplete/);
  const denver = games.find((game) => game.id === '2024_04_DEN_NYJ').plays.find((play) => play.key === '3075');
  assert.doesNotMatch(denver.description, /injury update|returned to the game/i);
  assert.match(denver.description, /PENALTY.*No Play/);
  const buffalo = (await readSeason(2026)).find((game) => game.id === '2026_10_BUF_NYJ');
  const kincaid = buffalo.plays.find((p) => p.key === '2511');
  assert.match(kincaid.description, /Kincaid.*54 yards/);
  assert.deepEqual([kincaid.quarter, kincaid.clock, kincaid.before, kincaid.wp, kincaid.delta], [3, 594, [9, 10], 0.427, -0.116]);
});
