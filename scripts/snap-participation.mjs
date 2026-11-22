/** Build the separately licensed participation packs. --source-dir reads participation/YEAR.parquet offline. */
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { publishedGames } from '../src/lib/published-pages.ts';
import { parseSnapSeason, snapMatchesFixture } from '../src/lib/snap-data.ts';
import { chartedFields, matchingParticipationTeam, parseParticipationSeason, participationProvenance } from '../src/lib/snap-participation.ts';
import { downloadPbp, PbpAvailabilityError } from './build-data.mjs';
import { withDataLock } from './data-refresh.mjs';
import { publishGzipSeason } from './snap-publish.mjs';

const columns = {
  formation: 'offense_formation', offensePersonnel: 'offense_personnel', defensePersonnel: 'defense_personnel',
  box: 'defenders_in_box', rushers: 'number_of_pass_rushers', primaryRoute: 'route',
  coverage: 'defense_coverage_type', manZone: 'defense_man_zone_type',
};

export async function extractParticipation(db, file, games) {
  const parquet = "read_parquet('" + file.replaceAll("'", "''") + "')";
  const schema = (await db.runAndReadAll(`DESCRIBE SELECT * FROM ${parquet}`)).getRowObjectsJS();
  const names = new Set(schema.map((column) => column.column_name));
  if (!['nflverse_game_id', 'play_id', 'possession_team'].every((key) => names.has(key))) throw new Error('Missing participation identity columns');
  const features = Object.entries(columns).filter(([, source]) => names.has(source));
  if (!features.length) throw new Error('Missing participation charting columns');
  const counts = ['n_offense', 'n_defense'].filter((column) => names.has(column));
  const query = `SELECT nflverse_game_id, play_id, possession_team, ${counts.map((column) => column + ', ').join('')}${features.map(([key, source]) => `${source} AS "${key}"`).join(', ')}
    FROM ${parquet} WHERE nflverse_game_id IN (${games.map((_, i) => '$' + (i + 1)).join(', ')})`;
  const rows = (await db.runAndReadAll(query, games.map((game) => game.id))).getRowObjectsJS();
  const byGame = Map.groupBy(rows, (row) => row.nflverse_game_id);
  return games.map((game) => {
    const records = byGame.get(game.id);
    if (!records?.length) throw new Error(`Missing participation game ${game.id}`);
    const playsByKey = new Map();
    for (const row of records) {
      if (typeof row.play_id === 'bigint') row.play_id = Number(row.play_id);
      if (!Number.isSafeInteger(row.play_id) || row.play_id < 1) continue;
      const key = String(row.play_id);
      // Even when the provider repeats an identical row, the play no longer has a unique source match.
      playsByKey.set(key, playsByKey.has(key) ? null : row);
    }
    const plays = [];
    for (const play of game.plays) {
      const row = playsByKey.get(play.key);
      if (!row || !matchingParticipationTeam(game, play, row.possession_team)) continue;
      for (const key of ['box', 'rushers']) if (typeof row[key] === 'bigint') row[key] = Number(row[key]);
      // An apparent standard package may have only ten identified participants on this source row.
      for (const [count, group] of [['n_offense', 'offensePersonnel'], ['n_defense', 'defensePersonnel']]) {
        if (row[count] != null && row[count] !== 11 && row[count] !== 11n) delete row[group];
      }
      const charting = chartedFields(row, play);
      if (charting) plays.push({ key: play.key, team: row.possession_team, charting });
    }
    if (!plays.length) throw new Error(`No verified participation plays in ${game.id}`);
    return { id: game.id, plays };
  });
}

async function exists(file) {
  try { await access(file); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export async function refreshParticipation({ dataDir = path.join(process.cwd(), 'public', 'data'), sourceDir,
  full = false, fetcher = fetch, onWarning = console.warn } = {}) {
  return withDataLock(dataDir, async () => {
    const [gameJson, currentJson] = await Promise.all(['games.json', 'current.json'].map((name) => readFile(path.join(dataDir, name), 'utf8')));
    const current = JSON.parse(currentJson);
    if (!Number.isInteger(current.season) || current.schemaVersion !== 1 || !Array.isArray(current.schedule) ||
      !Number.isFinite(Date.parse(current.checkedAt))) throw new Error('Invalid current football edition');
    const fixtures = publishedGames(JSON.parse(gameJson), current).filter((game) => game.season >= 2016)
      .sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const out = path.join(dataDir, 'participation');
    await mkdir(out, { recursive: true });
    const stage = await mkdtemp(path.join(path.dirname(dataDir), '.participation-stage-'));
    const written = [];
    let instance, db;
    try {
      for (const [year, eligible] of Map.groupBy(fixtures, (game) => game.season)) {
        const name = `${year}.json.gz`;
        const filename = path.join(out, name);
        if (!full && year !== current.season && !(year === current.season - 1 && !await exists(filename))) continue;
        const src = participationProvenance(year);
        let file;
        if (sourceDir) {
          file = path.join(sourceDir, 'participation', `${year}.parquet`);
          if (!await exists(file)) file = null;
        } else {
          let bytes;
          try { bytes = await downloadPbp(src.sourceUrl, fetcher); }
          catch (error) {
            if (!(error instanceof PbpAvailabilityError) || (full && year < current.season - 1)) throw error;
            onWarning(`Participation ${year} request failed; retaining the current edition: ${error.message}`);
            continue;
          }
          if (bytes) {
            file = path.join(stage, `${year}.parquet`);
            await writeFile(file, bytes);
          }
        }
        if (!file) {
          if (full && year < current.season - 1) throw new PbpAvailabilityError(`Historical participation season ${year} unavailable`);
          onWarning(`Participation ${year} unavailable; retaining the current edition.`);
          continue;
        }
        const snapBytes = await readFile(path.join(dataDir, 'snaps', name));
        const snapshots = parseSnapSeason(gunzipSync(snapBytes).toString('utf8'), year);
        const byId = new Map(snapshots.map((game) => [game.id, game]));
        const games = eligible.map((fixture) => {
          const game = byId.get(fixture.id);
          if (!game || !snapMatchesFixture(game, fixture)) throw new Error(`No verified snap game for participation ${fixture.id}`);
          return game;
        });
        if (!db) {
          const { DuckDBInstance } = await import('@duckdb/node-api');
          instance = await DuckDBInstance.create(':memory:');
          db = await instance.connect();
        }
        const data = await extractParticipation(db, file, games);
        const json = JSON.stringify({ schemaVersion: 1, season: year, provenance: src, games: data });
        parseParticipationSeason(json, year);
        if (await publishGzipSeason(filename, path.join(stage, name), json)) written.push(year);
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
    const written = await refreshParticipation({ full: values.full, sourceDir: values['source-dir'] });
    console.log(`Participation seasons updated: ${written.join(', ') || 'none'}`);
  } catch (error) {
    console.error(`Participation publication failed: ${error.message}`);
    process.exitCode = 1;
  }
}
