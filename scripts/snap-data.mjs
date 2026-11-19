/** Publish a verified season of Jets plays. --full rebuilds 1999 onward; --source-dir reads YEAR.parquet offline. */
import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { publishedGames } from '../src/lib/published-pages.ts';
import { parseSnapSeason, snapDescription, validPostWp } from '../src/lib/snap-data.ts';
import { downloadPbp, PbpAvailabilityError } from './build-data.mjs';
import { pbpSource, TEAM, withDataLock } from './data-refresh.mjs';

const pair = (a, b) => Number.isSafeInteger(a) && a >= 0 && Number.isSafeInteger(b) && b >= 0 ? [a, b] : null;
const sameScore = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
const rounded = (value) => value == null ? null : Math.round(value * 1000) / 1000;
const integerIn = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
const probability = (n) => Number.isFinite(n) && n >= 0 && n <= 1;
const binary = (n) => n === 0 || n === 1;

const actions = { completion: 'complete_pass', incompletion: 'incomplete_pass', interception: 'interception', sack: 'sack' };
const laterals = ['lateral_reception', 'lateral_rush', 'lateral_return', 'lateral_recovery'];
const optionalColumns = [
  'home_wp_post', 'away_wp_post',
  'home_timeouts_remaining', 'away_timeouts_remaining', 'goal_to_go', 'yards_gained', 'first_down',
  'touchdown', 'td_team', 'pass_touchdown', 'rush_touchdown', 'yards_after_catch', 'air_yards', 'epa', 'xpass', 'cp',
  'pass_attempt', 'rush_attempt', 'qb_kneel', 'qb_spike', ...Object.values(actions), 'passing_yards', 'receiving_yards', 'rushing_yards',
  'passer_player_name', 'receiver_player_name', 'rusher_player_name', 'interception_player_name',
  'passer_player_id', 'receiver_player_id', 'rusher_player_id', 'interception_player_id',
  'lateral_receiver_player_name', 'lateral_rusher_player_name', 'lateral_interception_player_name',
  'penalty', 'two_point_attempt', 'extra_point_attempt', 'special_teams_play', 'special', 'aborted_play', 'play_deleted',
  'fumble', 'fumble_lost', 'safety', 'replay_or_challenge', ...laterals,
];

function scrimmageKind(row) {
  if (!row.posteam || !integerIn(row.down, 1, 4) || row.penalty !== 0 || row.two_point_attempt !== 0 ||
    row.extra_point_attempt !== 0 || row.special_teams_play === 1 || row.special === 1 || row.play_deleted === 1 ||
    row.aborted_play === 1 || /\b(?:penalt(?:y|ies)|no play|two.point (?:conversion|attempt)|aborted)\b/i.test(row.description)) return;
  if (!Object.values(actions).every((key) => binary(row[key]))) return;
  const marked = Object.keys(actions).filter((kind) => row[actions[kind]] === 1);
  if (row.rush_attempt === 1 && row.pass_attempt === 0 && !marked.length && row.qb_spike === 0) {
    if (row.play_type === 'run' && row.qb_kneel === 0) return 'rush';
    if (row.play_type === 'qb_kneel' && row.qb_kneel === 1) return 'kneel';
  }
  if (row.pass_attempt === 1 && row.rush_attempt === 0 && marked.length === 1 && row.qb_kneel === 0) {
    if (row.play_type === 'pass' && row.qb_spike === 0) return marked[0];
    if (row.play_type === 'qb_spike' && row.qb_spike === 1 && marked[0] === 'incompletion') return 'spike';
  }
}

function player(value, id) {
  if (typeof value !== 'string') return;
  const name = value.trim();
  if (!name || name.length > 100 || /^(?:na|none|null|team|unknown)$/i.test(name) || /[;,|/\n&]|\band\b/i.test(name)) return;
  if (id != null && (typeof id !== 'string' || /[;,|/\s&]/.test(id))) return;
  return name;
}

function simpleAdvance(row, facts) {
  const { kind, yards } = facts;
  if ((kind !== 'completion' && kind !== 'rush') || yards === undefined ||
    !integerIn(row.yardline_100, 1, 99) || !integerIn(row.ydstogo, 0, 100)) return false;
  if (![row.fumble, row.fumble_lost, row.safety, row.replay_or_challenge, row.aborted_play,
    ...laterals.map((field) => row[field])].every((flag) => flag === 0) ||
    /\b(?:fumbl\w*|lateral\w*|backward[s]? pass|challeng\w*|review(?:ed)?|revers(?:ed|al)|turnover on downs)\b/i.test(row.description)) return false;
  if (kind === 'completion' ? !facts.passer || !facts.target || row.receiving_yards !== yards || row.passing_yards !== yards :
    !facts.rusher || row.rushing_yards !== yards) return false;
  if (facts.airYards !== undefined && facts.afterCatch !== undefined && facts.airYards + facts.afterCatch !== yards) return false;
  if (typeof facts.firstDown === 'boolean' && !facts.touchdown && facts.firstDown !== (yards >= row.ydstogo)) return false;
  if (row.down === 4 && facts.firstDown !== true && facts.touchdown !== true) return false;
  if (![row.posteam_score, row.posteam_score_post, row.defteam_score, row.defteam_score_post].every(Number.isSafeInteger) ||
    row.defteam_score !== row.defteam_score_post || row.posteam_score_post - row.posteam_score !== (facts.touchdown ? 6 : 0)) return false;
  const finish = row.yardline_100 - yards;
  return finish >= 0 && finish < 100 && typeof facts.touchdown === 'boolean' && (finish === 0) === facts.touchdown;
}

function snapFacts(row, atHome) {
  const facts = {};
  if ([row.home_timeouts_remaining, row.away_timeouts_remaining].every((n) => integerIn(n, 0, 3))) {
    facts.timeouts = atHome ? [row.home_timeouts_remaining, row.away_timeouts_remaining] : [row.away_timeouts_remaining, row.home_timeouts_remaining];
  }
  if (row.posteam && row.play_type && Number.isFinite(row.epa)) facts.epa = row.epa;
  const kind = scrimmageKind(row);
  if (!kind) return facts;
  facts.kind = kind;
  if (binary(row.goal_to_go)) facts.goalToGo = row.goal_to_go === 1;
  if (binary(row.first_down)) facts.firstDown = row.first_down === 1;
  if (row.touchdown === 0) facts.touchdown = false;
  else if (row.touchdown === 1 && row.td_team === row.posteam &&
    (kind === 'completion' && row.pass_touchdown === 1 || kind === 'rush' && row.rush_touchdown === 1)) facts.touchdown = true;
  if (probability(row.xpass)) facts.dropbackProbability = row.xpass;

  // The source's yards_gained excludes advances on laterals and fumble recoveries.
  // Older gamebooks can also put two rushes in a single row described as a reverse.
  const multiple = laterals.some((key) => row[key] === 1) || row.lateral_receiver_player_name ||
    row.lateral_rusher_player_name || row.lateral_interception_player_name || row.fumble === 1 || row.fumble_lost === 1 ||
    /\b(?:lateral\w*|backwards? pass|fumbl\w*|reverse|flea.flicker)\b/i.test(row.description);
  if (multiple) return facts;
  if (integerIn(row.yards_gained, -100, 100)) facts.yards = row.yards_gained;
  const runner = kind === 'rush' || kind === 'kneel';
  const actor = runner ? player(row.rusher_player_name, row.rusher_player_id) : player(row.passer_player_name, row.passer_player_id);
  if (actor) facts[runner ? 'rusher' : 'passer'] = actor;
  if (kind === 'completion' || kind === 'incompletion' || kind === 'interception') {
    const target = player(row.receiver_player_name, row.receiver_player_id);
    const interceptor = kind === 'interception' ? player(row.interception_player_name, row.interception_player_id) : undefined;
    const conflicted = kind === 'interception' && (target && target === interceptor ||
      row.receiver_player_id && row.receiver_player_id === row.interception_player_id);
    if (interceptor && !conflicted) facts.interceptor = interceptor;
    if (target && !conflicted) {
      facts.target = target;
      if (probability(row.cp)) facts.completionProbability = row.cp;
      if (integerIn(row.air_yards, -120, 120)) facts.airYards = row.air_yards;
      if (kind === 'completion' && integerIn(row.yards_after_catch, -120, 120)) facts.afterCatch = row.yards_after_catch;
    }
  }
  if (simpleAdvance(row, facts)) facts.simpleAdvance = true;
  return facts;
}

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
      const facts = snapFacts(row, fixture.atHome);
      const pre = possession ? (fixture.atHome ? row.home_wp : row.away_wp) : null;
      const change = possession && row.wpa != null ? (team === TEAM ? row.wpa : -row.wpa) : null;
      const post = fixture.atHome ? row.home_wp_post : row.away_wp_post;
      // Compare unrounded values at one publication unit before storing the same-row post estimate.
      const postWp = possession && validPostWp(post, pre, change, 0.001) ? rounded(post) : undefined;
      plays.push({
        key: String(row.play_id), quarter: row.qtr, clock: row.quarter_seconds_remaining,
        possession, down: row.down, distance: row.ydstogo, yardline: row.yardline_100,
        before: before ?? previousRunning, after: after ?? running, drive: row.fixed_drive,
        wp: rounded(pre), delta: rounded(change), ...(postWp !== undefined ? { postWp } : {}),
        type, description, ...(Object.keys(facts).length ? { facts } : {}),
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
      ${optionalColumns.filter((name) => names.has(name)).map((name) => `"${name}",`).join(' ')}
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
