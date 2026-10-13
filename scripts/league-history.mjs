/**
 * Builds the schedule history the site reads beside the season snapshot, from
 * the same nfldata games.csv the refresher already trusts:
 *
 *   - every Jets game since 1999 with its venue, ESPN event number and, once it
 *     is final, the Jets' starting quarterback as the schedule records him;
 *   - how many clubs with each regular-season win total reached the playoffs,
 *     over complete 17-game seasons (the 14-team playoff format, 2021 onward).
 *
 * Run: node scripts/league-history.mjs  →  public/data/league-history.json
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TEAM, SCHEDULE_SOURCE, parseCsv, parseLeagueSchedule, jetsSchedule, fetchText } from './data-refresh.mjs';

/** The first season with 17 games and seven playoff clubs per conference. */
export const PLAYOFF_FORMAT_SEASON = 2021;
const MISSING = new Set(['', 'NA', 'N/A', 'null']);
const GSIS = /^00-\d{7}$/;
const text = (value) => typeof value === 'string' && value.trim() !== '' && !/[\u0000-\u001f\u007f]/.test(value);
const optional = (value) => MISSING.has(value ?? '') ? null : value.trim();

/** The columns this script adds to what parseLeagueSchedule already validates, keyed by game. */
export function scheduleExtras(csv) {
  const rows = parseCsv(csv);
  for (const key of ['game_id', 'espn', 'stadium', 'away_qb_id', 'home_qb_id', 'away_qb_name', 'home_qb_name']) {
    if (!(key in rows[0])) throw new Error(`Missing schedule column: ${key}`);
  }
  const extras = new Map();
  for (const row of rows) {
    const espn = optional(row.espn);
    if (espn !== null && !/^\d{6,12}$/.test(espn)) throw new Error(`Invalid ESPN event: ${row.game_id}`);
    const qb = (side) => {
      const id = optional(row[`${side}_qb_id`]), name = optional(row[`${side}_qb_name`]);
      if (id === null && name === null) return null;
      if (id === null || !GSIS.test(id) || !text(name)) throw new Error(`Invalid ${side} quarterback: ${row.game_id}`);
      return { id, name };
    };
    extras.set(row.game_id, { espn, stadium: optional(row.stadium), home: qb('home'), away: qb('away') });
  }
  return extras;
}

/** Every Jets game since 1999; a starter is only recorded for a game that has been played. */
export function jetsHistory(league, extras) {
  return jetsSchedule(league).map((game) => {
    const extra = extras.get(game.id);
    if (!extra) throw new Error(`Schedule extras missing: ${game.id}`);
    const qb = game.status === 'final' ? (game.atHome ? extra.home : extra.away) : null;
    return { ...game, stadium: extra.stadium, espn: extra.espn, qb };
  });
}

/**
 * For each regular-season win total, how many clubs reached the playoffs.
 * Only seasons whose regular season and Super Bowl are both final count, and a
 * club "reached the playoffs" when it appears in any postseason game (top seeds
 * first appear in the divisional round). Ties count toward neither wins nor losses.
 */
export function playoffsByWins(league, { from = PLAYOFF_FORMAT_SEASON } = {}) {
  const seasons = [...new Set(league.map((game) => game.season))].filter((season) => season >= from).sort((a, b) => a - b).filter((season) => {
    const games = league.filter((game) => game.season === season);
    return games.some((game) => game.seasonType === 'POST' && game.week === Math.max(...games.map((entry) => entry.week)) && game.status === 'final')
      && games.filter((game) => game.seasonType === 'REG').every((game) => game.status === 'final');
  });
  const rows = new Map();
  for (const season of seasons) {
    const games = league.filter((game) => game.season === season);
    const wins = new Map();
    for (const game of games.filter((entry) => entry.seasonType === 'REG')) {
      for (const team of [game.homeTeam, game.awayTeam]) if (!wins.has(team)) wins.set(team, 0);
      if (game.homeScore > game.awayScore) wins.set(game.homeTeam, wins.get(game.homeTeam) + 1);
      if (game.awayScore > game.homeScore) wins.set(game.awayTeam, wins.get(game.awayTeam) + 1);
    }
    if (wins.size !== 32) throw new Error(`Expected 32 clubs in ${season}, found ${wins.size}`);
    const playoff = new Set(games.filter((game) => game.seasonType === 'POST').flatMap((game) => [game.homeTeam, game.awayTeam]));
    if (playoff.size !== 14) throw new Error(`Expected 14 playoff clubs in ${season}, found ${playoff.size}`);
    for (const [team, total] of wins) {
      const row = rows.get(total) ?? { wins: total, clubs: 0, playoffs: 0 };
      row.clubs += 1;
      if (playoff.has(team)) row.playoffs += 1;
      rows.set(total, row);
    }
  }
  return { seasons, rows: [...rows.values()].sort((a, b) => a.wins - b.wins) };
}

export function validateHistory(snapshot) {
  if (!snapshot || snapshot.schemaVersion !== 1 || snapshot.team !== TEAM || snapshot.source !== SCHEDULE_SOURCE) throw new Error('Invalid league history');
  if (!Number.isFinite(Date.parse(snapshot.checkedAt))) throw new Error('Invalid league history check time');
  if (snapshot.status !== undefined && !['ready', 'retained'].includes(snapshot.status)) throw new Error('Invalid league history status');
  if (!Array.isArray(snapshot.games) || !snapshot.games.length) throw new Error('League history has no Jets games');
  const ids = new Set();
  for (const game of snapshot.games) {
    if (!game || typeof game.id !== 'string' || ids.has(game.id) || !game.id.includes(TEAM)) throw new Error(`Invalid history game: ${game?.id}`);
    ids.add(game.id);
    if (game.espn !== null && !/^\d{6,12}$/.test(game.espn)) throw new Error(`Invalid ESPN event: ${game.id}`);
    if (game.stadium !== null && !text(game.stadium)) throw new Error(`Invalid stadium: ${game.id}`);
    if (game.qb !== null && (game.status !== 'final' || !GSIS.test(game.qb.id) || !text(game.qb.name))) throw new Error(`Invalid starter: ${game.id}`);
  }
  const { seasons, rows } = snapshot.playoffsByWins ?? {};
  if (!Array.isArray(seasons) || !Array.isArray(rows) || seasons.some((season) => !Number.isSafeInteger(season) || season < PLAYOFF_FORMAT_SEASON)) throw new Error('Invalid playoff table');
  if (rows.some((row) => !Number.isSafeInteger(row.wins) || row.wins < 0 || row.wins > 17 || !Number.isSafeInteger(row.clubs) || row.clubs < 1 || !Number.isSafeInteger(row.playoffs) || row.playoffs < 0 || row.playoffs > row.clubs)) throw new Error('Invalid playoff row');
  if (rows.reduce((total, row) => total + row.clubs, 0) !== seasons.length * 32 || rows.reduce((total, row) => total + row.playoffs, 0) !== seasons.length * 14) throw new Error('Playoff table does not add up');
  return snapshot;
}

async function publishHistory(out, snapshot) {
  const temporary = `${out}.${process.pid}.tmp`;
  await mkdir(path.dirname(out), { recursive: true });
  try {
    await writeFile(temporary, JSON.stringify(snapshot));
    validateHistory(JSON.parse(await readFile(temporary, 'utf8')));
    await rename(temporary, out);
  } finally {
    await rm(temporary, { force: true });
  }
}

/** A failed or invalid source keeps the last validated history and says so. */
export async function refreshHistory({ out = path.join(process.cwd(), 'public', 'data', 'league-history.json'), now = new Date(), fetcher = fetch, onError = console.warn } = {}) {
  let previous = null;
  try { previous = validateHistory(JSON.parse(await readFile(out, 'utf8'))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const attemptedAt = now.toISOString();
  let snapshot;
  try {
    const csv = await fetchText(SCHEDULE_SOURCE, fetcher);
    const league = parseLeagueSchedule(csv);
    const games = jetsHistory(league, scheduleExtras(csv));
    snapshot = validateHistory({ schemaVersion: 1, team: TEAM, source: SCHEDULE_SOURCE, checkedAt: attemptedAt, attemptedAt, status: 'ready', games, playoffsByWins: playoffsByWins(league) });
    const kept = new Set(games.map((game) => game.id));
    if (previous?.games.some((game) => game.status === 'final' && !kept.has(game.id))) throw new Error('Schedule lost previously recorded Jets games');
  } catch (error) {
    if (!previous) throw error;
    onError(`League history retained: ${error.message}`);
    snapshot = validateHistory({ ...previous, attemptedAt, status: 'retained' });
  }
  await publishHistory(out, snapshot);
  return snapshot;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  refreshHistory().then((snapshot) => {
    const starters = new Set(snapshot.games.flatMap((game) => game.qb ? [game.qb.id] : []));
    console.log(`${snapshot.games.length} Jets games, ${starters.size} starting quarterbacks; playoff table over ${snapshot.playoffsByWins.seasons.join(', ')}`);
  }).catch((error) => { console.error(`League history failed: ${error.message}`); process.exitCode = 1; });
}
