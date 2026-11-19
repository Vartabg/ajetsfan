/** Publish a verified season of Jets plays. --full rebuilds 1999 onward; --source-dir reads YEAR.parquet offline. */
import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { publishedGames } from '../src/lib/published-pages.ts';
import { parseSnapSeason, snapDescription } from '../src/lib/snap-data.ts';
import { downloadPbp, PbpAvailabilityError } from './build-data.mjs';
import { pbpSource, TEAM, withDataLock } from './data-refresh.mjs';

const pair = (a, b) => Number.isSafeInteger(a) && a >= 0 && Number.isSafeInteger(b) && b >= 0 ? [a, b] : null;
const sameScore = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
const rounded = (value) => value == null ? null : Math.round(value * 1000) / 1000;

/** A missing/ambiguous source record withholds the game. The ordered input is the physical Parquet sequence. */
export function verifiedSnapGame(fixture, rows) {
  if (!rows.length) return null;
  const home = fixture.atHome ? TEAM : fixture.opponent;
  const away = fixture.atHome ? fixture.opponent : TEAM;
  const official = [fixture.jetsScore, fixture.oppScore];
  const orient = (a, b, jetsFirst) => jetsFirst ? pair(a, b) : pair(b, a);
  const ids = new Set();
  for (const row of rows) {
    if (row.game_id !== fixture.id || row.season !== fixture.season || row.week !== fixture.week ||
      row.season_type !== fixture.seasonType || row.game_date !== fixture.date ||
      row.home_team !== home || row.away_team !== away ||
      !sameScore(orient(row.home_score, row.away_score, fixture.atHome), official) ||
      !Number.isSafeInteger(row.play_id) || row.play_id < 1 || ids.has(row.play_id)) return null;
    ids.add(row.play_id);
  }

  // Corrections sometimes insert a high ID in an earlier drive. The first two seasons
  // have no order_sequence; their stored row order is the source's play-by-play order.
  const sequence = rows.map((row) => row.order_sequence);
  if (sequence.some((value) => value !== null)) {
    if (!sequence.every(Number.isFinite) || new Set(sequence).size !== rows.length) return null;
    rows = [...rows].sort((a, b) => a.order_sequence - b.order_sequence);
  }
  const last = rows.at(-1);
  if (!last.terminal || !Number.isSafeInteger(last.qtr) || last.qtr < 4 || !sameScore(
    orient(last.total_home_score, last.total_away_score, fixture.atHome), official)) return null;

  const plays = [];
  let previousRunning = null;
  for (const row of rows) {
    const team = row.posteam;
    if (team && team !== home && team !== away) return null;
    const running = orient(row.total_home_score, row.total_away_score, fixture.atHome);
    if (running && (running[0] > official[0] || running[1] > official[1])) return null;
    const ownScore = (own, other) => team ? orient(own, other, team === TEAM) : null;
    const before = ownScore(row.posteam_score, row.defteam_score);
    const after = ownScore(row.posteam_score_post, row.defteam_score_post);
    if ((before && previousRunning && !sameScore(before, previousRunning)) ||
      (after && running && !sameScore(after, running))) return null;
    // Early gamebooks omit the normalized type on some recorded actions.
    // Their source flags or an explicitly described penalty identify the play;
    // inventing a type here would change the historical run/pass sample.
    const type = row.play_type || null;
    const recorded = type || row.action || (row.down != null && /\bpenalty on\b/i.test(row.description));
    if (recorded) {
      if (typeof row.description !== 'string' || !row.description.trim()) return null;
      const possession = !team ? null : team === TEAM ? 'jets' : 'opponent';
      const description = snapDescription(row.description) || 'Play description unavailable.';
      plays.push({
        key: String(row.play_id), quarter: row.qtr, clock: row.quarter_seconds_remaining,
        possession, down: row.down, distance: row.ydstogo, yardline: row.yardline_100,
        before: before ?? previousRunning, after: after ?? running, drive: row.fixed_drive,
        wp: possession ? rounded(fixture.atHome ? row.home_wp : row.away_wp) : null,
        delta: !possession || row.wpa === null ? null : rounded(team === TEAM ? row.wpa : -row.wpa),
        type, description,
      });
    }
    previousRunning = running;
  }
  if (!plays.length) return null;
  return { id: fixture.id, date: fixture.date, opponent: fixture.opponent, home: fixture.atHome,
    final: official, source: 'nflverse', plays };
}

export async function extractSnapGames(db, file, fixtures) {
  if (!fixtures.length) return [];
  const parquet = `read_parquet('${file.replaceAll("'", "''")}', file_row_number = true)`;
  const columns = (await db.runAndReadAll(`DESCRIBE SELECT * FROM ${parquet}`)).getRowObjectsJS();
  const names = new Set(columns.map((column) => column.column_name));
  const rows = (await db.runAndReadAll(`
    SELECT game_id, season, week, season_type, CAST(game_date AS VARCHAR) AS game_date,
      home_team, away_team, home_score, away_score, total_home_score, total_away_score,
      play_id, ${names.has('order_sequence') ? 'order_sequence' : 'NULL AS order_sequence'},
      qtr, quarter_seconds_remaining, nullif(posteam, '') AS posteam, play_type,
      (pass_attempt = 1 OR rush_attempt = 1 OR penalty = 1) AS action,
      down, ydstogo, yardline_100, fixed_drive, posteam_score, defteam_score,
      posteam_score_post, defteam_score_post, home_wp, away_wp, wpa, "desc" AS description,
      (${names.has('game_end') ? 'game_end = 1 OR' : ''}
        trim("desc") ILIKE 'END GAME%' OR trim("desc") ILIKE 'END OF GAME%') AS terminal
    FROM ${parquet} WHERE game_id IN (${fixtures.map((_, index) => `$${index + 1}`).join(', ')})
    ORDER BY game_id, file_row_number`, fixtures.map((fixture) => fixture.id))).getRowObjectsJS();
  // DuckDB represents Parquet INT64 as bigint and DOUBLE/INT32 as number.
  for (const row of rows) {
    for (const [column, value] of Object.entries(row)) if (typeof value === 'bigint') row[column] = Number(value);
  }
  const groups = Map.groupBy(rows, (row) => row.game_id);
  return fixtures.map((fixture) => verifiedSnapGame(fixture, groups.get(fixture.id) ?? [])).filter(Boolean);
}

async function publishSeason(filename, staged, season, games) {
  const json = JSON.stringify({ schemaVersion: 1, season, source: pbpSource(season), games });
  parseSnapSeason(json, season);
  let old;
  try { old = await readFile(filename); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  // Different zlib builds may encode identical JSON differently. Keep identical
  // editions byte-for-byte on daily runs, including across Mac/Linux rebuilds.
  if (old) {
    try { if (gunzipSync(old).toString('utf8') === json) return false; }
    catch (error) { if (error.code !== 'Z_DATA_ERROR' && error.code !== 'Z_BUF_ERROR') throw error; }
  }
  const bytes = gzipSync(json, { level: 9 });
  bytes[9] = 255; // RFC 1952's unspecified OS. No build timestamp or host metadata.
  await writeFile(staged, bytes);
  if (gunzipSync(await readFile(staged)).toString('utf8') !== json)
    throw new Error(`Staged snap season ${season} failed verification`);
  await rename(staged, filename);
  return true;
}

export async function refreshSnapData({
  dataDir = path.join(process.cwd(), 'public', 'data'), sourceDir, full = false,
  fetcher = fetch, onWarning = console.warn,
} = {}) {
  return withDataLock(dataDir, async () => {
    const [gameJson, currentJson] = await Promise.all(['games.json', 'current.json'].map((name) =>
      readFile(path.join(dataDir, name), 'utf8')));
    const current = JSON.parse(currentJson);
    if (current.schemaVersion !== 1 || !Number.isInteger(current.season) || current.season < 1999 ||
      !Number.isFinite(Date.parse(current.checkedAt)) || !Array.isArray(current.schedule)) throw new Error('Invalid current football edition');
    const eligible = publishedGames(JSON.parse(gameJson), current).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const groups = Map.groupBy(eligible.filter((game) => full || game.season === current.season), (game) => game.season);
    const out = path.join(dataDir, 'snaps');
    await mkdir(out, { recursive: true });
    const stage = await mkdtemp(path.join(path.dirname(dataDir), '.snap-stage-'));
    const written = [];
    let instance, db;
    try {
      for (const [year, fixtures] of groups) {
        const file = path.join(sourceDir ?? stage, `${year}.parquet`);
        try {
          if (!sourceDir) {
            const bytes = await downloadPbp(pbpSource(year), fetcher);
            if (!bytes) throw new PbpAvailabilityError('Parquet is not published');
            await writeFile(file, bytes);
          } else {
            // Check the local source before passing it to DuckDB so ENOENT has
            // the same availability semantics as the upstream release's 404.
            await access(file);
          }
          if (!db) {
            const { DuckDBInstance } = await import('@duckdb/node-api');
            instance = await DuckDBInstance.create(':memory:');
            db = await instance.connect();
          }
          const games = await extractSnapGames(db, file, fixtures);
          if (games.length !== fixtures.length) {
            const found = new Set(games.map((game) => game.id));
            throw new PbpAvailabilityError(`incomplete or conflicting evidence for ${fixtures.filter((game) => !found.has(game.id)).map((game) => game.id).join(', ')}`);
          }
          const name = `${year}.json.gz`;
          if (await publishSeason(path.join(out, name), path.join(stage, name), year, games)) written.push(year);
        } catch (error) {
          if (!(error instanceof PbpAvailabilityError) && !(sourceDir && error.code === 'ENOENT')) throw error;
          if (full && year !== current.season) throw new Error(`Historical snap season ${year} unavailable: ${error.message}`, { cause: error });
          onWarning(`Skipped snap season ${year}: ${error.message}`);
        } finally {
          if (!sourceDir) await rm(file, { force: true });
        }
      }
      return written;
    } finally {
      db?.closeSync();
      instance?.closeSync();
      await rm(stage, { recursive: true, force: true });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: { full: { type: 'boolean' }, 'source-dir': { type: 'string' } } });
    const written = await refreshSnapData({ full: values.full, sourceDir: values['source-dir'] });
    console.log(`Snap seasons updated: ${written.join(', ') || 'none'}`);
  } catch (error) {
    console.error(`Snap publication failed: ${error.message}`);
    process.exitCode = 1;
  }
}
