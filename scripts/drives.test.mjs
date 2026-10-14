import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import { pbpSource } from './data-refresh.mjs';
import { PbpAvailabilityError } from './build-data.mjs';
import { extractDrives, extractVerifiedDrives, refreshDrives, RESULTS, validateDrives } from './drives.mjs';

const GAME = '1999_02_NYJ_BUF';
// play_id, fixed_drive, posteam, play_type, yardline_100, qtr, quarter_seconds_remaining, fixed_drive_result
const PLAYS = [
  [100, 1, 'NYJ', 'run', 80, 1, 900, 'Touchdown'],
  [110, 1, 'NYJ', 'pass', 27, 1, 860, 'Touchdown'],
  [120, 1, 'NYJ', 'extra_point', 15, 1, 850, 'Touchdown'],
  [130, 2, 'BUF', 'run', 73, 1, 123, null], // split at the end of the quarter in older files
  [140, 2, 'BUF', 'pass', 50, 1, 60, null],
  [150, 3, 'BUF', 'pass', 46, 2, 900, 'Missed field goal'],
  [160, 3, 'BUF', 'field_goal', 27, 2, 840, 'Missed field goal'],
  [170, 4, 'NYJ', 'pass', 63, 2, 800, 'Opp touchdown'],
  [180, 4, 'BUF', 'extra_point', 15, 2, 790, 'Opp touchdown'], // the returning team's extra point stays out of the drive
];

async function parquet(dir, rows, { witness = false, complete = true, runningScore = 14 } = {}) {
  const db = await (await DuckDBInstance.create(':memory:')).connect();
  const values = rows.map(([id, drive, team, type, yardline, qtr, clock, result]) =>
    `(${id}, '${GAME}', 'BUF', 'NYJ', ${drive}, '${team}', '${type}', ${yardline}, ${qtr}, ${clock}, ${result ? `'${result}'` : 'NULL'})`).join(',');
  const file = path.join(dir, 'pbp.parquet');
  const evidence = witness ? `, '1999-09-19' AS game_date, 7 AS home_score, 14 AS away_score,
    7 AS total_home_score, ${runningScore} AS total_away_score,
    CASE WHEN play_id = ${rows.at(-1)[0]} AND ${complete} THEN 'END GAME' ELSE '' END AS "desc"` : '';
  await db.run(`COPY (SELECT * ${evidence} FROM (VALUES ${values}) AS t(play_id, game_id, home_team, away_team, fixed_drive, posteam, play_type, yardline_100, qtr, quarter_seconds_remaining, fixed_drive_result)) TO '${file}' (FORMAT parquet)`);
  return { db, file };
}

test('drives are drawn from the Jets goal line, a split drive is joined, and an extra point never changes the team', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'drives-'));
  try {
    const { db, file } = await parquet(dir, PLAYS);
    const games = await extractDrives(db, file);
    const drives = games[GAME];
    assert.equal(drives.length, 3);
    const [jetsTd, bills, giveaway] = drives;
    assert.deepEqual(jetsTd, [1, 1, 900, 20, 100, 2, RESULTS.indexOf('Touchdown')]);
    // Buffalo starts at its own 27 (73 yards from the Jets goal line) and its kick is from the Jets 27.
    assert.deepEqual(bills, [0, 1, 123, 73, 27, 4, RESULTS.indexOf('Missed field goal')]);
    assert.deepEqual(giveaway, [1, 2, 800, 37, 37, 1, RESULTS.indexOf('Opp touchdown')]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('validation rejects positions off the field and unknown results', () => {
  const file = (rows) => ({ schemaVersion: 1, season: 1999, source: pbpSource(1999), checkedAt: '2026-10-13T00:00:00.000Z', results: RESULTS, games: { [GAME]: rows } });
  assert.equal(validateDrives(file([[1, 1, 900, 20, 100, 2, 0]])).season, 1999);
  assert.throws(() => validateDrives(file([[1, 1, 900, 20, 101, 2, 0]])), /Invalid drive/);
  assert.throws(() => validateDrives(file([[1, 1, 900, 20, 80, 2, RESULTS.length]])), /Invalid drive/);
});

test('a temporarily unavailable season keeps its last file; a malformed one fails', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'drives-'));
  try {
    const kept = { schemaVersion: 1, season: 2026, source: pbpSource(2026), checkedAt: '2026-10-12T00:00:00.000Z', results: RESULTS, games: { '2026_05_CLE_NYJ': [[1, 1, 900, 20, 100, 8, 0]] } };
    await writeFile(path.join(dir, '2026.json'), JSON.stringify(kept));
    const errors = [];
    const written = await refreshDrives({ seasons: [2026], dir, extract: async () => { throw new PbpAvailabilityError('PBP HTTP 503'); }, onError: (message) => errors.push(message) });
    assert.deepEqual(written, []);
    assert.match(errors[0], /retained: PBP HTTP 503/);
    assert.deepEqual(JSON.parse(await readFile(path.join(dir, '2026.json'), 'utf8')), kept);
    await assert.rejects(refreshDrives({ seasons: [2026], dir, extract: async () => ({ '2026_05_CLE_NYJ': [[1, 1, 900, 20, 140, 8, 0]] }) }), /Invalid drive/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('runtime drives require a terminal row and matching official/running score witnesses, independently of WP columns', async () => {
  const current = { season: 1999, schedule: [{ id: GAME, season: 1999, date: '1999-09-19', status: 'final', jetsScore: 14, oppScore: 7, atHome: false, opponent: 'BUF' }] };
  for (const options of [{}, { complete: false }, { runningScore: 13 }]) {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'verified-drives-'));
    try {
      const { db, file } = await parquet(dir, PLAYS, { witness: true, ...options });
      const result = await extractVerifiedDrives(db, file, current);
      if (Object.keys(options).length) { assert.deepEqual(result.games, {}); assert.deepEqual(result.pendingGameIds, [GAME]); }
      else {
        assert.equal(result.games[GAME].length, 3);
        assert.deepEqual(result.finals[GAME], { date: '1999-09-19', jetsScore: 14, oppScore: 7 });
        assert.deepEqual(result.pendingGameIds, []);
        const corrected = await extractVerifiedDrives(db, file, { ...current, schedule: [{ ...current.schedule[0], jetsScore: 15 }] });
        assert.deepEqual(corrected.games, {}); assert.deepEqual(corrected.pendingGameIds, [GAME]);
      }
      db.closeSync();
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
});
