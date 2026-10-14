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
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const timestamp = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
// Weekly player files use current franchise codes while older game IDs retain the original city.
const franchise = (value) => ({ OAK: 'LV', SD: 'LAC', STL: 'LA' })[value] ?? value;
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

/** Jets recovery prefixes and jersey numbers are optional; never match an opponent's explicit prefix or a longer name. */
export function namePattern(short) {
  return new RegExp(`(?:^|[\\s(])(?:NYJ-)?(?:\\d{1,2}-)?${short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z'])`);
}

/**
 * The plays that name the player and most raised the Jets' chance to win, from the site's curves. Two Jets
 * players with the same short name in one season are left without plays rather than guessed between.
 */
export function bigPlays(players, curves) {
  const finalDescription = (desc) => desc.split(/\b(?:play|ruling)\s+was\s+REVERSED\.\s*/i).at(-1)?.trim() || desc;
  const shared = new Map();
  for (const player of Object.values(players)) shared.set(player.short, (shared.get(player.short) ?? 0) + 1);
  for (const player of Object.values(players)) {
    if (shared.get(player.short) > 1) continue;
    const named = namePattern(player.short);
    player.plays = player.games.flatMap(({ gameId }) => (curves.get(gameId) ?? [])
      .filter((play) => play.meaningful && typeof play.d === 'number' && play.d > 0 && typeof play.desc === 'string' && named.test(finalDescription(play.desc)))
      .map((play) => ({ gameId, playId: play.playId, q: play.q, d: play.d, desc: finalDescription(play.desc).slice(0, 280) })))
      .sort((a, b) => b.d - a.d).slice(0, PLAYS_PER_SEASON);
  }
  return players;
}

export function validatePlayers(snapshot) {
  if (snapshot?.schemaVersion !== 1 || !Number.isInteger(snapshot.season) || snapshot.season < FIRST_SEASON || snapshot.season > 2200
    || snapshot.source !== weekSource(snapshot.season) || !timestamp(snapshot.checkedAt)
    || !record(snapshot.players) || !Object.keys(snapshot.players).length) throw new Error('Invalid player pages snapshot');
  for (const [id, player] of Object.entries(snapshot.players)) {
    if (!GSIS.test(id) || !record(player) || !text(player.name) || !text(player.short) || player.position !== null && !text(player.position)
      || !Array.isArray(player.games) || !player.games.length || !Array.isArray(player.plays) || player.plays.length > PLAYS_PER_SEASON)
      throw new Error(`Invalid player: ${id}`);
    const games = new Set();
    for (const game of player.games) {
      const identity = typeof game?.gameId === 'string' && game.gameId.match(GAME);
      if (!record(game) || !identity || Number(identity[1]) !== snapshot.season || games.has(game.gameId)
        || Number(identity[2]) !== game.week || !Number.isInteger(game.week) || game.week < 1 || game.week > 22 || typeof game.post !== 'boolean'
        || game.opponent === TEAM || !(identity[3] === TEAM && franchise(identity[4]) === game.opponent || identity[4] === TEAM && franchise(identity[3]) === game.opponent))
        throw new Error(`Invalid player game: ${id}`);
      for (const [kind, length] of [['pass', 5], ['rush', 3], ['rec', 4], ['def', 5]]) {
        const line = game[kind];
        if (line === undefined) continue;
        if (!Array.isArray(line) || line.length !== length || line.some((value, index) => !Number.isFinite(value) || Math.abs(value) > 20_000
          || !(kind === 'def' && index === 1 ? Number.isInteger(value * 2) : Number.isInteger(value))
          || value < 0 && !(kind === 'pass' && index === 2 || kind === 'rush' && index === 1 || kind === 'rec' && index === 2)))
          throw new Error(`Invalid player line: ${id}`);
      }
      if (game.pass && game.pass[0] > game.pass[1]) throw new Error(`Invalid player completions: ${id}`);
      games.add(game.gameId);
    }
    for (const play of player.plays) {
      if (!record(play) || !games.has(play.gameId) || !Number.isInteger(play.playId) || play.playId < 0
        || !Number.isInteger(play.q) || play.q < 1 || play.q > 6 || !Number.isFinite(play.d) || play.d <= 0 || play.d > 1
        || typeof play.desc !== 'string' || !play.desc.trim() || play.desc.length > 280)
        throw new Error(`Invalid player play: ${id}`);
    }
  }
  return snapshot;
}

async function readPrevious(out, season) {
  let raw;
  try { raw = await readFile(out, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  try {
    const previous = validatePlayers(JSON.parse(raw));
    return previous.season === season ? previous : null;
  } catch { return null; }
}

/** A replaced upstream file may correct a line, but cannot silently remove recorded player games. */
function keepsRecordedGames(players, previous) {
  for (const [id, player] of Object.entries(previous?.players ?? {})) {
    const next = new Set(players[id]?.games.map((game) => game.gameId) ?? []);
    if (player.games.some((game) => !next.has(game.gameId))) throw new Error(`Player stats lost recorded games: ${id}`);
  }
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

/** Provider failures retain a validated prior season without blocking independent archive feeds; publication failures remain fatal. */
export async function refreshPlayers({ seasons, root = path.join(process.cwd(), 'public', 'data'), now = new Date(), fetcher = fetch, onError = console.warn } = {}) {
  const written = [];
  for (const season of seasons) {
    const out = path.join(root, 'players', `${season}.json`), previous = await readPrevious(out, season);
    let players;
    try {
      const response = await fetcher(weekSource(season), { signal: AbortSignal.timeout(60_000) });
      if (response.status === 404) {
        onError(previous ? `${season} player stats retained from ${previous.checkedAt}: source not published`
          : `${season} player stats not published; players unchanged`);
        continue;
      }
      if (!response.ok) throw new Error(`Source HTTP ${response.status}: ${weekSource(season)}`);
      players = seasonPlayers(gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8'), season);
      if (!Object.keys(players).length) throw new Error(`${season} has no Jets player rows`);
      keepsRecordedGames(players, previous);
      validatePlayers({ schemaVersion: 1, season, source: weekSource(season), checkedAt: now.toISOString(), players });
    } catch (error) {
      if (!previous) throw error;
      onError(`${season} player stats retained from ${previous.checkedAt}: ${error.message}`);
      continue;
    }
    const curves = await readCurves(path.join(root, 'curves'), new Set(Object.values(players).flatMap((player) => player.games.map((game) => game.gameId))));
    await publish(out, { schemaVersion: 1, season, source: weekSource(season), checkedAt: now.toISOString(), players: bigPlays(players, curves) });
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
