/**
 * Builds every Jets game's drives from nflverse play-by-play: who had the ball,
 * where the drive's first and last snaps were, and how it ended.
 *
 * Field position is measured from the Jets' own goal line (0) to the
 * opponent's (100), so Jets drives move right and opponent drives move left.
 * A drive ends at its last snap's line of scrimmage; a touchdown drive ends in
 * the end zone. nflfastR's fixed_drive and fixed_drive_result define drives.
 *
 * Outputs public/data/drives/{season}.json.
 * Run: node scripts/drives.mjs (current season); --full rebuilds 1999 onward.
 */
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TEAM, pbpSource } from './data-refresh.mjs';
import { downloadPbp } from './build-data.mjs';

export const FIRST_SEASON = 1999;
export const RESULTS = ['Touchdown', 'Field goal', 'Missed field goal', 'Punt', 'Turnover', 'Turnover on downs', 'Opp touchdown', 'Safety', 'End of half', 'Not recorded'];
const SNAPS = `play_type IN ('pass', 'run', 'punt', 'field_goal', 'qb_kneel', 'qb_spike', 'no_play')`;
const PLAYS = `play_type IN ('pass', 'run', 'punt', 'field_goal', 'qb_kneel', 'qb_spike')`;
const num = (value) => (typeof value === 'bigint' ? Number(value) : value);

/** Jets drives and opponent drives for every completed Jets game in one season's play-by-play file. */
export async function extractDrives(db, file) {
  const rows = async (sql) => (await db.runAndReadAll(sql)).getRowObjects().map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, num(value)])));
  const parquet = `read_parquet('${file.replaceAll("'", "''")}')`;
  // The drive belongs to whoever took its first snap; return touchdowns and extra points do not change that.
  const drives = await rows(`
    SELECT game_id, fixed_drive AS drive,
      arg_min(posteam, play_id) AS team,
      arg_min(qtr, play_id) AS qtr,
      arg_min(quarter_seconds_remaining, play_id) AS clock,
      arg_min(yardline_100, play_id) AS start_yl,
      arg_max(yardline_100, play_id) AS end_yl,
      count(*) FILTER (WHERE ${PLAYS}) AS plays,
      any_value(fixed_drive_result) AS result,
      any_value(home_team) AS home, any_value(away_team) AS away
    FROM ${parquet}
    WHERE (home_team = '${TEAM}' OR away_team = '${TEAM}') AND fixed_drive IS NOT NULL
      AND posteam IS NOT NULL AND posteam <> '' AND yardline_100 IS NOT NULL AND ${SNAPS}
    GROUP BY game_id, fixed_drive
    ORDER BY game_id, fixed_drive`);
  // Older seasons split a drive that crosses the end of a quarter into two, the first with no result.
  // Join those halves; a resultless drive with no continuation stays as "Not recorded".
  const joined = [];
  for (const row of drives) {
    const last = joined.at(-1);
    if (last && last.result === null && last.game_id === row.game_id && last.team === row.team) {
      Object.assign(last, { end_yl: row.end_yl, plays: last.plays + row.plays, result: row.result });
    } else joined.push({ ...row });
  }
  const games = {};
  for (const row of joined) {
    const jets = row.team === TEAM;
    if (!jets && row.team !== (row.home === TEAM ? row.away : row.home)) throw new Error(`Drive by a team not in the game: ${row.game_id} ${row.drive}`);
    row.result ??= 'Not recorded';
    if (!RESULTS.includes(row.result)) throw new Error(`Unknown drive result: ${row.game_id} ${row.drive} ${row.result}`);
    const x = (yardline) => jets ? 100 - yardline : yardline;
    const end = row.result === 'Touchdown' ? (jets ? 100 : 0) : x(row.end_yl);
    (games[row.game_id] ??= []).push([jets ? 1 : 0, row.qtr, Math.round(row.clock), x(row.start_yl), end, row.plays, RESULTS.indexOf(row.result)]);
  }
  return games;
}

/** Each drive: [jets 1/0, quarter, seconds left in the quarter at its first snap, start, end, plays, result index]. */
export function validateDrives(snapshot) {
  if (!snapshot || snapshot.schemaVersion !== 1 || !Number.isSafeInteger(snapshot.season) || snapshot.season < FIRST_SEASON) throw new Error('Invalid drives file');
  if (snapshot.source !== pbpSource(snapshot.season) || !Number.isFinite(Date.parse(snapshot.checkedAt))) throw new Error('Invalid drives source');
  if (JSON.stringify(snapshot.results) !== JSON.stringify(RESULTS)) throw new Error('Invalid drive result list');
  for (const [id, drives] of Object.entries(snapshot.games ?? {})) {
    if (!id.startsWith(`${snapshot.season}_`) || !id.includes(TEAM) || !Array.isArray(drives) || !drives.length) throw new Error(`Invalid drives game: ${id}`);
    for (const drive of drives) {
      const [jets, qtr, clock, start, end, plays, result] = drive;
      if (drive.length !== 7 || ![0, 1].includes(jets) || !Number.isSafeInteger(qtr) || qtr < 1 || qtr > 6 || !Number.isSafeInteger(clock) || clock < 0 || clock > 900 ||
        ![start, end].every((value) => Number.isFinite(value) && value >= 0 && value <= 100) || !Number.isSafeInteger(plays) || plays < 0 || !RESULTS[result]) throw new Error(`Invalid drive in ${id}`);
    }
  }
  return snapshot;
}

async function publish(out, snapshot) {
  const temporary = `${out}.${process.pid}.tmp`;
  await mkdir(path.dirname(out), { recursive: true });
  try {
    await writeFile(temporary, JSON.stringify(snapshot));
    validateDrives(JSON.parse(await readFile(temporary, 'utf8')));
    await rename(temporary, out);
  } finally {
    await rm(temporary, { force: true });
  }
}

/**
 * Refreshes the given seasons. A season whose play-by-play is temporarily unavailable keeps its last file;
 * a malformed file or unknown drive result fails the run.
 */
export async function refreshDrives({ seasons, dir = path.join(process.cwd(), 'public', 'data', 'drives'), now = new Date(), fetcher = fetch, extract, onError = console.warn } = {}) {
  let instance, db, temp;
  const written = [];
  try {
    for (const season of seasons) {
      let games;
      try {
        if (extract) games = await extract(season);
        else {
          const body = await downloadPbp(pbpSource(season), fetcher);
          if (body === null) { onError(`${season} play-by-play not published; drives unchanged`); continue; }
          if (!db) {
            const { DuckDBInstance } = await import('@duckdb/node-api');
            instance = await DuckDBInstance.create(':memory:');
            db = await instance.connect();
            temp = await mkdtemp(path.join(os.tmpdir(), 'ajetsfan-drives-'));
          }
          const file = path.join(temp, `${season}.parquet`);
          await writeFile(file, body);
          games = await extractDrives(db, file);
          await rm(file);
        }
      } catch (error) {
        if (error?.name !== 'PbpAvailabilityError') throw error;
        onError(`${season} drives retained: ${error.message}`);
        continue;
      }
      if (!Object.keys(games).length) continue;
      await publish(path.join(dir, `${season}.json`), { schemaVersion: 1, season, source: pbpSource(season), checkedAt: now.toISOString(), results: RESULTS, games });
      written.push(season);
    }
  } finally {
    db?.closeSync?.();
    instance?.closeSync?.();
    if (temp) await rm(temp, { recursive: true, force: true });
  }
  return written;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const current = JSON.parse(await readFile(path.join(process.cwd(), 'public', 'data', 'current.json'), 'utf8')).season;
  const seasons = process.argv.includes('--full') ? Array.from({ length: current - FIRST_SEASON + 1 }, (_, index) => FIRST_SEASON + index) : [current];
  refreshDrives({ seasons }).then((written) => console.log(`Drives written for ${written.join(', ') || 'no seasons'}`))
    .catch((error) => { console.error(`Drives failed: ${error.message}`); process.exitCode = 1; });
}
