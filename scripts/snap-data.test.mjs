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

test('post-play win probability comes from this row and reconciles at source precision', () => {
  const rows = sourceRows();
  const first = () => verifiedSnapGame(fixture, rows).plays[0];
  rows[0].home_wp_post = 0.56598;
  rows[1].away_wp = 0.43402;
  assert.equal(first().postWp, undefined); // Neither the opponent's estimate nor the next snap supplies it.
  rows[0].away_wp_post = 0.43402;
  assert.equal(first().postWp, 0.434);
  rows[0].away_wp_post = 0.43502;
  assert.equal(first().postWp, 0.435); // One .001 publication unit of discrepancy.
  for (const value of [0.43503, 1.01, -0.01, NaN, '0.434', null]) {
    rows[0].away_wp_post = value;
    assert.equal(first().postWp, undefined);
  }
  rows[0].away_wp_post = 0;
  rows[0].wpa = null;
  assert.equal(first().postWp, 0);
  rows[0].away_wp = null;
  rows[0].away_wp_post = 1;
  rows[0].wpa = 0.12;
  assert.equal(first().postWp, 1);
  rows[0].posteam = null;
  assert.equal(first().postWp, undefined);
});

function completionFacts(changes = {}) {
  const rows = sourceRows();
  Object.assign(rows[0], {
    home_timeouts_remaining: 2, away_timeouts_remaining: 0, goal_to_go: 1, yardline_100: 6, ydstogo: 6,
    pass_attempt: 1, rush_attempt: 0, qb_spike: 0, qb_kneel: 0, sack: 0, interception: 0, complete_pass: 1,
    incomplete_pass: 0, penalty: 0, two_point_attempt: 0, extra_point_attempt: 0, special_teams_play: 0, aborted_play: 0,
    yards_gained: 6, passing_yards: 6, receiving_yards: 6, air_yards: -1, yards_after_catch: 7,
    touchdown: 1, pass_touchdown: 1, td_team: 'NYJ', first_down: 1, fumble: 0, fumble_lost: 0, safety: 0,
    lateral_rush: 0, lateral_reception: 0, lateral_return: 0, lateral_recovery: 0, replay_or_challenge: 0,
    passer_player_name: 'J.Flacco', receiver_player_name: 'G.Wilson', epa: -0.00037, xpass: 0, cp: 0.40454,
    ...changes,
  });
  return verifiedSnapGame(fixture, rows).plays[0].facts;
}

test('same-row facts preserve measured zero, signed yardage, model precision and distinct roles', () => {
  assert.deepEqual(completionFacts(), { timeouts: [0, 2], goalToGo: true, kind: 'completion', yards: 6,
    firstDown: true, touchdown: true, simpleAdvance: true, passer: 'J.Flacco', target: 'G.Wilson',
    epa: -0.00037, dropbackProbability: 0, completionProbability: 0.40454, airYards: -1, afterCatch: 7 });
  const unknown = completionFacts({ epa: null, home_timeouts_remaining: null, cp: null, xpass: null,
    receiver_player_name: null, first_down: null, goal_to_go: null, yards_gained: null });
  for (const key of ['epa', 'timeouts', 'target', 'completionProbability', 'dropbackProbability',
    'firstDown', 'goalToGo', 'yards', 'simpleAdvance', 'airYards', 'afterCatch']) assert.ok(!(key in unknown), key);
  const invalid = completionFacts({ epa: Infinity, cp: -0.01, xpass: 1.01, home_timeouts_remaining: 4,
    air_yards: 121, yards_after_catch: '7', yards_gained: 500 });
  for (const key of ['epa', 'completionProbability', 'dropbackProbability', 'timeouts', 'airYards', 'afterCatch', 'yards']) {
    assert.ok(!(key in invalid), key);
  }
  const interception = completionFacts({ complete_pass: 0, interception: 1, receiver_player_id: 'same',
    interception_player_id: 'same', interception_player_name: 'A.Davis' });
  assert.equal(interception.kind, 'interception');
  assert.deepEqual([interception.target, interception.interceptor, interception.completionProbability], [undefined, undefined, undefined]);
  assert.equal(completionFacts({ receiver_player_name: 'A.One; B.Two' }).target, undefined);
  assert.equal(completionFacts({ receiver_player_id: 'first/second' }).target, undefined);
});

test('individual role IDs require a credited player and keep ambiguous or nullified plays out', () => {
  const passer = '00-0026158', receiver = '00-0037740', runner = '00-0039794';
  const pass = { passer_player_id: passer, receiver_player_id: receiver };
  const ids = facts => [facts.passerId, facts.targetId, facts.rusherId];
  assert.deepEqual(ids(completionFacts(pass)), [passer, receiver, undefined]);
  assert.deepEqual(ids(completionFacts({ ...pass, receiver_player_id: null })), [passer, undefined, undefined]);
  assert.deepEqual(ids(completionFacts({ ...pass, passer_player_id: 'not-gsis', receiver_player_name: null })), [undefined, undefined, undefined]);
  assert.deepEqual(ids(completionFacts({ ...pass, interception: 1, complete_pass: 0, interception_player_id: receiver })), [passer, undefined, undefined]);
  for (const change of [{ fumble: 1 }, { lateral_reception: 1 }, { penalty: 1 }, { play_type: 'no_play' }]) {
    assert.deepEqual(ids(completionFacts({ ...pass, ...change })), [undefined, undefined, undefined]);
  }
  const rush = { ...pass, play_type: 'run', pass_attempt: 0, rush_attempt: 1, complete_pass: 0,
    rusher_player_name: 'B.Allen', rusher_player_id: runner };
  assert.deepEqual(ids(completionFacts(rush)), [undefined, undefined, runner]);
  assert.deepEqual(ids(completionFacts({ ...rush, play_type: 'qb_kneel', qb_kneel: 1 })), [undefined, undefined, undefined]);
});

test('a field finish requires consistent ordinary gain, scoring and credit evidence', () => {
  for (const change of [{ fumble: 1 }, { fumble_lost: 1 }, { lateral_reception: 1 }, { lateral_rusher_player_name: 'A.Other' },
    { replay_or_challenge: 1 }, { replay_or_challenge: null }, { description: 'Pass caught. The Replay Official reviewed the ruling.' },
    { description: 'Pass caught. Lateral to A.Other.' }, { description: 'Handed off. Reverse to A.Other.' },
    { safety: 1 }, { passing_yards: 5 }, { receiving_yards: null },
    { air_yards: 8 }, { yardline_100: 3 }, { touchdown: 0 }, { touchdown: 1, td_team: 'CLE' }]) {
    assert.equal(completionFacts(change).simpleAdvance, undefined, JSON.stringify(change));
  }
  for (const change of [{ play_type: 'kickoff' }, { play_type: 'no_play' }, { down: null }, { incomplete_pass: 1 },
    { penalty: 1 }, { description: 'Pass complete. Penalty on NYJ, declined.' }, { two_point_attempt: 1 },
    { extra_point_attempt: 1 }, { special_teams_play: 1 }, { aborted_play: 1 }]) {
    const facts = completionFacts(change);
    assert.equal(facts.kind, undefined, JSON.stringify(change));
    assert.equal(facts.simpleAdvance, undefined);
    assert.equal(facts.completionProbability, undefined);
  }
});

test('official third-down credits distinguish conversions, failures and non-attempts on flagged plays', () => {
  const third = { down: 3, penalty: 1, first_down: 1, first_down_penalty: 1 };
  for (const [converted, failed, expected] of [[1, 0, 'converted'], [0, 1, 'failed'], [0, 0, 'no-attempt'],
    [1, 1, undefined], [1, null, undefined], [null, 0, undefined]]) {
    assert.equal(completionFacts({ ...third, third_down_converted: converted, third_down_failed: failed }).thirdDownResult, expected);
  }
  for (const change of [{ down: 2 }, { posteam: null }, { play_deleted: 1 }]) {
    assert.equal(completionFacts({ ...third, third_down_converted: 1, third_down_failed: 0, ...change }).thirdDownResult, undefined);
  }
  const nullified = completionFacts({ ...third, play_type: 'no_play', third_down_converted: 0, third_down_failed: 0 });
  assert.equal(nullified.thirdDownResult, 'no-attempt');
  assert.equal(nullified.statCall, undefined);
});

test('statistical scrimmage credits survive accepted or declined fouls while replay facts remain independent', () => {
  const flagged = { penalty: 1, rush_touchdown: 0, description: 'Touchdown pass. Unnecessary roughness between downs.' };
  const f = completionFacts(flagged);
  assert.deepEqual([f.statCall, f.statYards, f.statTouchdown, f.kind, f.touchdown], ['dropback', 6, true, undefined, undefined]);
  const rush = { ...flagged, play_type: 'run', rush_attempt: 1, pass_attempt: 0, complete_pass: 0,
    qb_scramble: 0, rusher_player_id: '00-1234567', rusher_player_name: 'Q.Runner', passing_yards: null, rushing_yards: 6 };
  assert.equal(completionFacts(rush).statCall, 'run');
  assert.equal(completionFacts({ ...rush, qb_scramble: 1 }).statCall, 'dropback');
  assert.equal(completionFacts({ ...rush, penalty: 0, qb_scramble: 1 }).kind, 'rush');
  const early = { ...rush, play_type: null, action: true, special: 0, kickoff_attempt: 0, field_goal_attempt: 0, punt_attempt: 0 };
  assert.equal(completionFacts(early).statCall, 'run');
  assert.equal(completionFacts({ ...early, rusher_player_id: null }).statCall, undefined);
  for (const change of [{ play_type: 'no_play' }, { description: 'Holding. No Play.' }, { qb_kneel: 1 }, { qb_spike: 1 },
    { two_point_attempt: 1 }, { extra_point_attempt: 1 }, { play_type: 'kickoff' }, { down: null }, { special_teams_play: 1 },
    { punt_attempt: 1 }, { play_deleted: 1 }, { rush_attempt: 1 }, { aborted_play: 1 }]) {
    const facts = completionFacts({ ...flagged, ...change });
    assert.deepEqual([facts.statCall, facts.statYards, facts.statTouchdown], [undefined, undefined, undefined]);
  }
  for (const change of [{ td_team: 'CLE' }, { rush_touchdown: 1 }, { pass_touchdown: 0 }, { fumble_lost: 1 }]) {
    assert.equal(completionFacts({ ...flagged, ...change }).statTouchdown, undefined);
  }
  assert.equal(completionFacts({ ...flagged, lateral_reception: 1 }).statYards, undefined);
  assert.equal(completionFacts({ ...flagged, yards_gained: null }).statYards, undefined);
});

test('turnover facts require adjudicated credits for this exact play', () => {
  const pick = { complete_pass: 0, interception: 1, interception_player_id: '00-1234567', penalty: 1 };
  const lost = { fumble: 1, fumble_lost: 1, fumbled_1_player_id: '00-7654321', fumbled_1_team: 'CLE' };
  const downs = { down: 4, fourth_down_failed: 1, fourth_down_converted: 0, first_down: 0, drive_play_id_ended: 991,
    drive_end_transition: 'Downs', fixed_drive_result: 'Turnover on downs' };
  assert.deepEqual(completionFacts(pick).turnovers, ['interception']);
  assert.deepEqual(completionFacts({ ...pick, ...lost }).turnovers, ['interception', 'lostFumble']);
  assert.deepEqual(completionFacts(downs).turnovers, ['downs']);
  for (const override of [{ ...lost, fumble_lost: 0 }, { ...lost, fumbled_1_team: 'CIN' },
    { ...pick, two_point_attempt: 1 }, { ...pick, play_type: 'no_play' }, { ...pick, interception: 0 },
    { ...pick, play_deleted: 1 }, { ...downs, drive_play_id_ended: 999 }, { ...downs, drive_end_transition: 'End of half' }]) {
    assert.equal(completionFacts(override).turnovers, undefined);
  }
});

test('v1 season parsing accepts absent facts and validates optional facts before use', () => {
  const game = verifiedSnapGame(fixture, sourceRows());
  const parse = () => parseSnapSeason(JSON.stringify({ season: 2022, schemaVersion: 1, games: [game] }), 2022);
  assert.deepEqual(parse(), [game]);
  for (const post of [1.02, -0.01, '0.434', 0.2]) {
    game.plays[0].postWp = post;
    assert.throws(parse, /Invalid/);
  }
  game.plays[0].postWp = 0.436; // Published 0.123 pre and 0.311 change were rounded separately.
  assert.deepEqual(parse(), [game]);
  delete game.plays[0].postWp;
  for (const facts of [null, [], { timeouts: [1, 4] }, { touchdown: 1 }, { kind: 'penalty' }, { epa: '1' },
    { turnovers: [] }, { turnovers: ['fumble'] }, { turnovers: ['downs', 'interception'] }, { turnovers: ['lostFumble', 'lostFumble'] },
    { airYards: 121 }, { afterCatch: -121 }, { yards: -101 }, { passer: '' }, { dropbackProbability: 1.01 },
    { completionProbability: 0.4, kind: 'rush' }, { afterCatch: 4, kind: 'interception' },
    { kind: 'completion', targetId: '00-0037740' }, { kind: 'completion', target: 'G.Wilson', targetId: '12345' },
    { kind: 'completion', rusher: 'B.Allen', rusherId: '00-0039794' }, { kind: 'rush', rusher: 'B.Allen', rusherId: '00-0039794' },
    { simpleAdvance: true, kind: 'completion', yards: 50 }, { simpleAdvance: true, kind: 'sack', yards: -2 }]) {
    game.plays[0].facts = facts;
    assert.throws(parse, /Invalid/);
  }
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

const readSeason = async (year) => parseSnapSeason(gunzipSync(await readFile(
  new URL(`../public/data/snaps/${year}.json.gz`, import.meta.url))).toString('utf8'), year);

test('published historical seasons reproduce the two-minute cohort and its linked source plays', async () => {
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
  const reverse = games.find((game) => game.id === '2000_02_NE_NYJ').plays.find((play) => play.key === '371');
  assert.deepEqual([reverse.facts.yards, reverse.facts.rusher, reverse.facts.simpleAdvance], [undefined, undefined, undefined]);
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
  // Literal observations from the named nflverse Parquet rows. Keep model timing
  // and direction distinct from observed yards, the next kick and the game final.
  assert.deepEqual(cleveland.plays[wilson].facts, {
    timeouts: [0, 1], kind: 'completion', goalToGo: false, yards: 15, firstDown: true, touchdown: true, thirdDownResult: 'converted',
    passer: 'J.Flacco', passerId: '00-0026158', target: 'G.Wilson', targetId: '00-0037740', simpleAdvance: true, epa: 3.846828027839408, shotgun: true, direction: 'middle', passLength: 'short',
    dropbackProbability: 0.9855244755744934, completionProbability: 0.4148028492927551, airYards: 14, afterCatch: 1,
  });
  const davis = cleveland.plays.find((play) => play.key === '4276');
  assert.deepEqual([cleveland.plays[wilson].postWp, davis.postWp, kincaid.postWp], [0.573, 0.894, 0.311]);
  const seattle = games.find((game) => game.id === '2024_13_SEA_NYJ').plays.find((p) => p.key === '3620');
  assert.deepEqual([seattle.wp, seattle.delta, seattle.postWp], [0.649, -0.152, undefined]);
  assert.deepEqual(davis.facts, {
    turnovers: ['interception'],
    timeouts: [0, 1], kind: 'interception', goalToGo: false, yards: 0, firstDown: false, touchdown: false,
    passer: 'J.Brissett', passerId: '00-0033119', target: 'A.Cooper', targetId: '00-0031544', interceptor: 'A.Davis', epa: -0.7408111404813765, shotgun: true, direction: 'left',
    passLength: 'deep', interceptionReturnYards: 14, defenders: [{ name: 'A.Davis', role: 'passDefended' }],
    dropbackProbability: 0.975856602191925, completionProbability: 0.5842199325561523, airYards: 18,
  });
  assert.deepEqual(kincaid.facts, {
    timeouts: [3, 3], kind: 'completion', goalToGo: false, yards: 54, firstDown: true, touchdown: false,
    passer: 'J.Allen', passerId: '00-0034857', target: 'D.Kincaid', targetId: '00-0038933', simpleAdvance: true, epa: 2.9467543336770037, shotgun: true, direction: 'right',
    passLength: 'deep', defenders: [{ name: 'D.Belton', role: 'assistTackle' }, { name: 'M.Moore', role: 'assistTackle' }],
    dropbackProbability: 0.488914430141449, completionProbability: 0.4996108412742615, airYards: 21, afterCatch: 33,
  });
  const find = (key) => cleveland.plays.find((play) => play.key === key);
  assert.deepEqual(find('4224').facts, { timeouts: [0, 1], epa: 0.06000000000000005,
    kick: { kind: 'extraPoint', kicker: 'G.Zuerlein', kickYards: 33, outcome: 'made' } });
  assert.deepEqual(find('4240').facts, { timeouts: [0, 1], epa: 0,
    kick: { kind: 'kickoff', kicker: 'G.Zuerlein', kickYards: 65, touchback: true } });
  assert.deepEqual([find('63').facts.kind, find('63').facts.rusher, find('63').facts.yards, find('63').facts.simpleAdvance],
    ['rush', 'Mi.Carter', 1, true]);
  assert.deepEqual([find('1263').facts.goalToGo, find('1263').facts.touchdown, find('1263').facts.afterCatch], [true, true, 0]);
  assert.equal(find('1433').facts.kind, undefined); // Recorded rush with an enforced penalty.
  assert.deepEqual([find('1433').facts.statCall, find('1433').facts.statYards], ['run', 6]);
  assert.equal(early.facts.statCall, 'run');
  assert.equal(early.facts.statYards, undefined); // Reverse with an unplaced second runner.
  assert.equal(find('622').facts.simpleAdvance, undefined); // Nullified snap.
  assert.equal(find('4177').facts.completionProbability, undefined); // Throw with no identified target.
  assert.equal(find('4307').facts.kind, 'kneel');
});

test('the first ten and eleven 2026 games match the source third-down flags on both sides', async () => {
  const games = await readSeason(2026);
  const totals = (selected, side) => {
    const official = selected.flatMap(g => g.plays).filter(p => p.possession === side).map(p => p.facts?.thirdDownResult);
    return [official.filter(v => v === 'converted').length, official.filter(v => v === 'converted' || v === 'failed').length];
  };
  const firstTen = games.filter(g => Number(g.id.split('_')[1]) <= 10);
  const throughChargers = games.filter(g => Number(g.id.split('_')[1]) <= 11);
  assert.deepEqual([totals(firstTen, 'jets'), totals(firstTen, 'opponent')], [[43, 126], [49, 121]]);
  assert.deepEqual([totals(throughChargers, 'jets'), totals(throughChargers, 'opponent')], [[52, 137], [57, 133]]);
  const flagged = games.find(g => g.id === '2026_08_LV_NYJ').plays.find(p => p.key === '545');
  assert.deepEqual([flagged.facts.thirdDownResult, flagged.facts.statCall, flagged.facts.statYards, flagged.facts.statTouchdown,
    flagged.facts.kind, flagged.facts.touchdown], ['converted', 'dropback', 12, true, undefined, undefined]);
});

test('statistics require their own situation, types and score evidence in a snap pack', () => {
  const game = verifiedSnapGame(fixture, sourceRows());
  const original = game.plays[0];
  const parse = () => parseSnapSeason(JSON.stringify({ schemaVersion: 1, season: 2022, games: [game] }), 2022);
  for (const [facts, situation] of [
    [{ thirdDownResult: 'converted' }, {}], [{ thirdDownResult: 'unknown' }, { down: 3 }],
    [{ statCall: 'run' }, {}], [{ statCall: 'dropback' }, { type: 'no_play' }],
    [{ statCall: 'dropback', statYards: 101 }, {}], [{ statCall: 'dropback', statYards: 6, yards: 6 }, {}],
    [{ statCall: 'dropback', statTouchdown: true }, { after: [0, 6] }],
    [{ statCall: 'dropback', statTouchdown: true, turnovers: ['interception'] }, {}],
  ]) {
    game.plays[0] = { ...original, ...situation, facts };
    assert.throws(parse, /Invalid/);
  }
  game.plays[0] = { ...original, facts: { statCall: 'dropback', statYards: 6, statTouchdown: true } };
  assert.deepEqual(parse(), [game]);
});

test('diagram facts require applicable action, source direction, credited identities and the correct side', () => {
  const routine = { defteam: 'CLE', shotgun: 1, pass_location: 'left', pass_length: 'short', run_gap: 'guard',
    assist_tackle_1_team: 'CLE', assist_tackle_1_player_name: 'D.Guard', assist_tackle_1_player_id: '00-0022334',
    assist_tackle_2_team: 'NYJ', assist_tackle_2_player_name: 'W.Player', assist_tackle_2_player_id: '00-0000001' };
  const facts = completionFacts(routine);
  assert.equal(facts.direction, 'left');
  assert.equal(facts.passLength, 'short');
  assert.equal(facts.shotgun, true);
  assert.equal(facts.runGap, undefined);
  assert.deepEqual(facts.defenders, [{ name: 'D.Guard', role: 'assistTackle' }]);
  for (const fix of [{ fumble: 1 }, { replay_or_challenge: 1 }, { lateral_return: 1 }, { penalty: 1 }, { defteam: 'DET' }]) {
    const changed = completionFacts({ ...routine, ...fix });
    assert.equal(changed.direction, undefined);
    assert.equal(changed.defenders, undefined);
  }
  assert.equal(completionFacts({ ...routine, pass_location: 'near' }).direction, undefined);
  assert.equal(completionFacts({ ...routine, assist_tackle_1_player_id: null }).defenders, undefined);
  assert.equal(completionFacts({ ...routine, receiver_player_id: routine.assist_tackle_1_player_id }).defenders, undefined);
  const sack = completionFacts({ ...routine, complete_pass: 0, sack: 1,
    half_sack_1_player_name: 'D.Guard', half_sack_1_player_id: routine.assist_tackle_1_player_id,
    half_sack_2_player_name: 'P.Edge', half_sack_2_player_id: '00-0012345' });
  assert.deepEqual(sack.defenders, [{ name: 'D.Guard', role: 'halfSack' }, { name: 'P.Edge', role: 'halfSack' }]);
  assert.equal(sack.passLength, undefined);
});

test('a separate participation derivative cannot enter the PBP season; incomplete or inconsistent kick and defender shapes fail validation', () => {
  const game = verifiedSnapGame(fixture, sourceRows());
  for (const facts of [{ kind: 'completion', charting: { formation: 'SHOTGUN' } }, { kind: 'sack', passLength: 'deep' },
    { kind: 'interception', interceptionReturnYards: -1 }, { kind: 'rush', defenders: [{ name: 'D.Player', role: 'sack' }] },
    { kind: 'rush', defenders: [{ name: 'A', role: 'assistTackle' }, { name: 'A', role: 'soloTackle' }] },
    { kick: { kind: 'fieldGoal', outcome: 'made' } }, { kick: { kind: 'kickoff', touchback: true, returnYards: 3 } }]) {
    game.plays[0].facts = facts;
    assert.throws(() => parseSnapSeason(JSON.stringify({ schemaVersion: 1, season: 2022, games: [game] }), 2022), /Invalid/);
  }
});
