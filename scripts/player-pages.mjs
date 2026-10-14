/**
 * Every Jets player's games, season by season, from nflverse's weekly player stats (Jets games only, so a
 * player traded mid-season counts only what he did as a Jet), with the plays naming him in the site's own
 * play-by-play curves that most raised the Jets' chance to win.
 *
 * Run: node scripts/player-pages.mjs [--full]  →  public/data/players/{season}.json
 * The daily run refreshes the current season; --full rebuilds every season since 1999.
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { TEAM, parseCsv } from './data-refresh.mjs';

export const FIRST_SEASON = 1999;
export const weekSource = (season) => `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv.gz`;
/** Plays kept per player per season; the page shows the best three across his Jets years. */
export const PLAYS_PER_SEASON = 3;

const GSIS = /^00-\d{7}$/;
const GAME = /^(\d{4})_(\d{2})_([A-Z]{2,4})_([A-Z]{2,4})$/;
const COLUMNS = ['player_id', 'player_name', 'player_display_name', 'position', 'season', 'week', 'season_type', 'game_id', 'team', 'opponent_team',
  'completions', 'attempts', 'passing_yards', 'passing_tds', 'passing_interceptions', 'carries', 'rushing_yards', 'rushing_tds',
  'receptions', 'targets', 'receiving_yards', 'receiving_tds', 'def_tackles_solo', 'def_tackle_assists', 'def_sacks', 'def_interceptions',
  'def_pass_defended', 'def_fumbles_forced'];
const text = (value) => typeof value === 'string' && value.trim() !== '' && value.length <= 80 && !/[<>\u0000-\u001f\u007f]/.test(value);
function count(row, key, { half = false, negative = false } = {}) {
  const raw = row[key];
  if (raw === '' || raw === 'NA' || raw === undefined) return 0;
  const value = Number(raw);
  const whole = half ? Number.isInteger(value * 2) : Number.isInteger(value);
  if (!Number.isFinite(value) || !whole || (!negative && value < 0) || Math.abs(value) > 10_000) throw new Error(`Invalid ${key} for ${row.player_id} in ${row.game_id}`);
  return value;
}
const any = (values) => values.some((value) => value !== 0);

/** One Jets game's line, as compact arrays; a category the player did not touch is left out. */
export function gameLine(row) {
  const passing = [count(row, 'completions'), count(row, 'attempts'), count(row, 'passing_yards', { negative: true }), count(row, 'passing_tds'), count(row, 'passing_interceptions')];
  const rushing = [count(row, 'carries'), count(row, 'rushing_yards', { negative: true }), count(row, 'rushing_tds')];
  const receiving = [count(row, 'receptions'), count(row, 'targets'), count(row, 'receiving_yards', { negative: true }), count(row, 'receiving_tds')];
  const defense = [count(row, 'def_tackles_solo') + count(row, 'def_tackle_assists'), count(row, 'def_sacks', { half: true }), count(row, 'def_interceptions'), count(row, 'def_pass_defended'), count(row, 'def_fumbles_forced')];
  if (passing[0] > passing[1]) throw new Error(`Completions exceed attempts for ${row.player_id} in ${row.game_id}`);
  return { ...(passing[1] || any(passing) ? { pass: passing } : {}), ...(any(rushing) ? { rush: rushing } : {}),
    ...(receiving[1] || any(receiving) ? { rec: receiving } : {}), ...(any(defense) ? { def: defense } : {}) };
}

/** The season's Jets rows, grouped by player, in week order. */
export function seasonPlayers(csv, season) {
  const rows = parseCsv(csv);
  if (!rows.length) throw new Error(`Empty player stats for ${season}`);
  for (const key of COLUMNS) if (!(key in rows[0])) throw new Error(`Missing player stats column: ${key}`);
  const players = {};
  for (const row of rows) {
    // nflverse keeps a few team rows no player is credited with (a 2004 playoff return, say); they belong to no page.
    if (row.team !== TEAM || row.player_id === '') continue;
    const game = row.game_id.match(GAME);
    if (Number(row.season) !== season || !game || Number(game[1]) !== season || ![game[3], game[4]].includes(TEAM)
      || !GSIS.test(row.player_id) || !text(row.player_name) || !text(row.player_display_name) || !/^[A-Z]{2,4}$/.test(row.opponent_team)
      || !['REG', 'POST'].includes(row.season_type) || !/^\d{1,2}$/.test(row.week)) throw new Error(`Invalid player stats row: ${row.player_id} ${row.game_id}`);
    const player = players[row.player_id] ??= { name: row.player_display_name.trim(), short: row.player_name.trim(), position: text(row.position) ? row.position.trim() : null, games: [], plays: [] };
    if (player.games.some((entry) => entry.gameId === row.game_id)) throw new Error(`Duplicate player game: ${row.player_id} ${row.game_id}`);
    player.games.push({ week: Number(row.week), gameId: row.game_id, post: row.season_type === 'POST', opponent: row.opponent_team, ...gameLine(row) });
  }
  for (const player of Object.values(players)) player.games.sort((a, b) => Number(a.post) - Number(b.post) || a.week - b.week);
  return players;
}

/** "7-G.Smith" or, in older play-by-play, "G.Smith" — never inside another name. */
export function namePattern(short) {
  return new RegExp(`(?:^|[\\s(])(?:\\d{1,2}-)?${short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z'])`);
}

/**
 * The plays that name the player and most raised the Jets' chance to win, from the site's curves. Two Jets
 * players with the same short name in one season are left without plays rather than guessed between.
 */
export function bigPlays(players, curves) {
  const shared = new Map();
  for (const player of Object.values(players)) shared.set(player.short, (shared.get(player.short) ?? 0) + 1);
  for (const player of Object.values(players)) {
    if (shared.get(player.short) > 1) continue;
    const named = namePattern(player.short);
    player.plays = player.games.flatMap(({ gameId }) => (curves.get(gameId) ?? [])
      .filter((play) => play.meaningful && typeof play.d === 'number' && play.d > 0 && typeof play.desc === 'string' && named.test(play.desc))
      .map((play) => ({ gameId, playId: play.playId, q: play.q, d: play.d, desc: play.desc.slice(0, 280) })))
      .sort((a, b) => b.d - a.d).slice(0, PLAYS_PER_SEASON);
  }
  return players;
}

export function validatePlayers(snapshot) {
  if (snapshot?.schemaVersion !== 1 || !Number.isInteger(snapshot.season) || snapshot.source !== weekSource(snapshot.season)
    || typeof snapshot.checkedAt !== 'string' || !snapshot.players || typeof snapshot.players !== 'object') throw new Error('Invalid player pages snapshot');
  for (const [id, player] of Object.entries(snapshot.players)) {
    if (!GSIS.test(id) || !text(player.name) || !text(player.short) || !Array.isArray(player.games) || !player.games.length || !Array.isArray(player.plays))
      throw new Error(`Invalid player: ${id}`);
  }
  return snapshot;
}

async function readCurves(dir, gameIds) {
  const curves = new Map();
  for (const id of gameIds) {
    try { curves.set(id, JSON.parse(await readFile(path.join(dir, `${id}.json`), 'utf8'))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return curves;
}

async function publish(out, snapshot) {
  const temporary = `${out}.${process.pid}.tmp`;
  await mkdir(path.dirname(out), { recursive: true });
  try {
    await writeFile(temporary, JSON.stringify(snapshot));
    validatePlayers(JSON.parse(await readFile(temporary, 'utf8')));
    await rename(temporary, out);
  } finally {
    await rm(temporary, { force: true });
  }
}

/** Refreshes the given seasons. A season nflverse has not published yet keeps its last file; a malformed file fails the run. */
export async function refreshPlayers({ seasons, root = path.join(process.cwd(), 'public', 'data'), now = new Date(), fetcher = fetch, onError = console.warn } = {}) {
  const written = [];
  for (const season of seasons) {
    const response = await fetcher(weekSource(season), { signal: AbortSignal.timeout(60_000) });
    if (response.status === 404) { onError(`${season} player stats not published; players unchanged`); continue; }
    if (!response.ok) throw new Error(`Source HTTP ${response.status}: ${weekSource(season)}`);
    const players = seasonPlayers(gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8'), season);
    if (!Object.keys(players).length) { onError(`${season} has no Jets player rows; players unchanged`); continue; }
    const curves = await readCurves(path.join(root, 'curves'), new Set(Object.values(players).flatMap((player) => player.games.map((game) => game.gameId))));
    await publish(path.join(root, 'players', `${season}.json`), { schemaVersion: 1, season, source: weekSource(season), checkedAt: now.toISOString(), players: bigPlays(players, curves) });
    written.push(season);
  }
  return written;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const current = JSON.parse(await readFile(path.join(process.cwd(), 'public', 'data', 'current.json'), 'utf8')).season;
  const seasons = process.argv.includes('--full') ? Array.from({ length: current - FIRST_SEASON + 1 }, (_, index) => FIRST_SEASON + index) : [current];
  refreshPlayers({ seasons }).then((written) => console.log(`Players written for ${written.join(', ') || 'no seasons'}`))
    .catch((error) => { console.error(`Players failed: ${error.message}`); process.exitCode = 1; });
}
