import { cp, mkdir, readFile, rename, rm, writeFile, open } from 'node:fs/promises';
import path from 'node:path';
import { validateAnalytics } from './season-analytics.mjs';

export const SCHEDULE_SOURCE = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv';
export const pbpSource = (season) => `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.parquet`;
export const TEAM = 'NYJ';
const GAME_ID = /^\d{4}_\d{2}_[A-Z]+_[A-Z]+$/;
const MISSING = new Set(['', 'NA', 'N/A', 'null']);

/** RFC 4180 fields, including quoted commas, escaped quotes and CRLF. */
export function parseCsv(input) {
  const rows = [];
  let row = [], field = '', quoted = false, closed = false;
  const pushField = () => { row.push(field); field = ''; closed = false; };
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { quoted = false; closed = true; }
      else field += ch;
    } else if (ch === '"') {
      if (field || closed) throw new Error('Invalid CSV quote');
      quoted = true;
    } else if (ch === ',') pushField();
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      pushField();
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
    } else {
      if (closed) throw new Error('Unexpected text after CSV quote');
      field += ch;
    }
  }
  if (quoted) throw new Error('Unterminated CSV quote');
  if (field || closed || row.length) { pushField(); rows.push(row); }
  if (rows.length < 2) throw new Error('Schedule CSV has no rows');
  const headers = rows.shift();
  headers[0] = headers[0].replace(/^\uFEFF/, '');
  if (new Set(headers).size !== headers.length) throw new Error('Duplicate CSV headers');
  return rows.map((values) => {
    if (values.length !== headers.length) throw new Error('CSV column count mismatch');
    return Object.fromEntries(headers.map((header, i) => [header, values[i]]));
  });
}

function integer(value, name, { nullable = false, min = 0 } = {}) {
  if (nullable && MISSING.has(value)) return null;
  if (!/^\d+$/.test(String(value)) || Number(value) < min) throw new Error(`Invalid ${name}: ${value}`);
  return Number(value);
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid schedule date: ${value}`);
  }
  return value;
}

/** nflreadr's schedule dictionary specifies gametime in Eastern time. */
export function easternKickoff(date, time) {
  if (MISSING.has(time) || time === 'TBD') return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error(`Invalid kickoff time: ${time}`);
  const wanted = `${date} ${time}`;
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  // UTC-4 in summer and UTC-5 in winter. Match the actual zoned date, too.
  for (const offset of [4, 5]) {
    const instant = new Date(Date.parse(`${date}T${time}:00Z`) + offset * 3_600_000);
    const parts = Object.fromEntries(format.formatToParts(instant).map((part) => [part.type, part.value]));
    if (`${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}` === wanted) return instant.toISOString();
  }
  throw new Error(`Unresolvable Eastern kickoff: ${wanted}`);
}

export function parseLeagueSchedule(csv) {
  const rows = parseCsv(csv);
  const required = ['game_id', 'season', 'game_type', 'week', 'gameday', 'gametime', 'away_team', 'away_score', 'home_team', 'home_score'];
  for (const key of required) if (!(key in rows[0])) throw new Error(`Missing schedule column: ${key}`);
  const ids = new Set();
  const games = [];
  for (const row of rows) {
    if (!['REG', 'WC', 'DIV', 'CON', 'SB'].includes(row.game_type)) continue;
    const season = integer(row.season, 'season', { min: 1900 });
    if (season < 1999) continue;
    const id = row.game_id;
    if (!GAME_ID.test(id) || ids.has(id)) throw new Error(`Invalid or duplicate schedule game: ${id}`);
    ids.add(id);
    const week = integer(row.week, 'week', { min: 1 });
    const [, idWeek, away, home] = id.split('_');
    if (Number(id.slice(0, 4)) !== season || Number(idWeek) !== week || away !== row.away_team || home !== row.home_team) {
      throw new Error(`Schedule identity mismatch: ${id}`);
    }
    const date = validDate(row.gameday);
    const homeScore = integer(row.home_score, 'home score', { nullable: true });
    const awayScore = integer(row.away_score, 'away score', { nullable: true });
    if ((homeScore === null) !== (awayScore === null)) throw new Error(`Incomplete final score: ${id}`);
    games.push({
      id, season, week, seasonType: row.game_type === 'REG' ? 'REG' : 'POST', date,
      kickoff: easternKickoff(date, row.gametime), homeTeam: home, awayTeam: away, homeScore, awayScore,
      status: homeScore === null ? 'scheduled' : 'final',
    });
  }
  if (!games.length) throw new Error('Schedule contains no games');
  return games.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function jetsSchedule(league) {
  const games = league.filter((game) => game.homeTeam === TEAM || game.awayTeam === TEAM).map((game) => {
    const atHome = game.homeTeam === TEAM;
    const jetsScore = atHome ? game.homeScore : game.awayScore;
    const oppScore = atHome ? game.awayScore : game.homeScore;
    const opponent = atHome ? game.awayTeam : game.homeTeam;
    return {
      id: game.id, season: game.season, week: game.week, seasonType: game.seasonType, date: game.date,
      kickoff: game.kickoff, opponent, opponentDisplay: opponent, atHome, jetsScore, oppScore,
      outcome: jetsScore === null ? null : jetsScore > oppScore ? 'win' : jetsScore < oppScore ? 'loss' : 'tie', status: game.status,
    };
  });
  if (!games.length) throw new Error('Schedule contains no Jets games');
  return games;
}

export const parseSchedule = (csv) => jetsSchedule(parseLeagueSchedule(csv));

/** The Jets' division, in the current nflverse team abbreviations. */
export const DIVISION = { name: 'AFC East', teams: ['BUF', 'MIA', 'NE', 'NYJ'] };

/**
 * Division standings from schedule-confirmed regular-season finals dated on or
 * before the check. Rows are ordered by win percentage, then division win
 * percentage, then point differential, then team code. That is a stable display
 * order, not the NFL tiebreaking procedure, and the pages say so.
 */
export function divisionStandings(league, season, now, division = DIVISION) {
  const today = now.toISOString().slice(0, 10);
  const rows = new Map(division.teams.map((team) => [team, {
    team, games: 0, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, divisionWins: 0, divisionLosses: 0, divisionTies: 0,
  }]));
  for (const game of league) {
    if (game.season !== season || game.seasonType !== 'REG' || game.status !== 'final' || game.date > today) continue;
    const divisional = rows.has(game.homeTeam) && rows.has(game.awayTeam);
    for (const [team, scored, allowed] of [[game.homeTeam, game.homeScore, game.awayScore], [game.awayTeam, game.awayScore, game.homeScore]]) {
      const row = rows.get(team);
      if (!row) continue;
      const outcome = scored > allowed ? 'Wins' : scored < allowed ? 'Losses' : 'Ties';
      row.games += 1;
      row.pointsFor += scored;
      row.pointsAgainst += allowed;
      row[outcome.toLowerCase()] += 1;
      if (divisional) row[`division${outcome}`] += 1;
    }
  }
  const pct = (wins, losses, ties) => wins + losses + ties ? (wins + ties / 2) / (wins + losses + ties) : 0;
  const teams = [...rows.values()].sort((a, b) =>
    pct(b.wins, b.losses, b.ties) - pct(a.wins, a.losses, a.ties) ||
    pct(b.divisionWins, b.divisionLosses, b.divisionTies) - pct(a.divisionWins, a.divisionLosses, a.divisionTies) ||
    (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst) ||
    a.team.localeCompare(b.team));
  return { division: division.name, teams };
}

/** January/February belong to the prior NFL season. Spring waits for a published schedule. */
export function inferSeason(schedule, now = new Date()) {
  const calendarSeason = now.getUTCFullYear() - (now.getUTCMonth() < 2 ? 1 : 0);
  const seasons = schedule.map((game) => game.season).filter((season) => season <= calendarSeason);
  const season = Math.max(...seasons);
  if (!Number.isFinite(season) || calendarSeason - season > 1 || (now.getUTCMonth() >= 8 && season !== calendarSeason)) {
    throw new Error(`Schedule is stale for the ${calendarSeason} season`);
  }
  return season;
}

function validateCurve(points, id) {
  if (!Array.isArray(points) || points.length < 2) throw new Error(`Missing/empty curve: ${id}`);
  for (const p of points) {
    if (!Number.isInteger(p.q) || p.q < 1 || !Number.isFinite(p.wp) || p.wp < 0 || p.wp > 1 ||
        (p.t !== null && (!Number.isFinite(p.t) || p.t < 0)) ||
        (p.d !== null && (!Number.isFinite(p.d) || p.d < -1 || p.d > 1))) throw new Error(`Invalid curve point: ${id}`);
  }
}

export function mergeAnalysis(previous, analyses, schedule, { full = false } = {}) {
  const finals = new Map(schedule.filter((game) => game.status === 'final').map((game) => [game.id, game]));
  const merged = new Map(previous.map((game) => [game.id, game]));
  const curves = new Map();
  for (const { games, curves: series, completeGameIds } of analyses) {
    if (!(completeGameIds instanceof Set)) throw new Error('PBP extraction omitted completion evidence');
    const seen = new Set();
    for (const game of games) {
      if (seen.has(game.id)) throw new Error(`Duplicate PBP game: ${game.id}`);
      seen.add(game.id);
      const final = finals.get(game.id);
      if (!final) continue; // Never mistake a partial/in-progress PBP game for a final.
      if (!completeGameIds.has(game.id)) continue; // Reaching a score is not proof the file includes the ending.
      if (game.jetsScore !== final.jetsScore || game.oppScore !== final.oppScore) throw new Error(`PBP/schedule final mismatch: ${game.id}`);
      if (game.dataSuspect && !full) continue; // Incomplete PBP remains analysis pending.
      const points = series.get(game.id);
      validateCurve(points, game.id);
      if (!points.some((p) => p.q >= 3)) throw new Error(`No second-half curve: ${game.id}`);
      if (!game.dataSuspect && game.outcome !== 'tie' && (!Number.isFinite(game.swing) || game.swing < 0 || game.swing > 1)) {
        throw new Error(`Invalid second-half probability: ${game.id}`);
      }
      if (game.keyPlay?.playId != null && !points.some((p) => p.playId === game.keyPlay.playId && p.meaningful)) {
        throw new Error(`Key play does not match a meaningful curve point: ${game.id}`);
      }
      merged.set(game.id, game);
      curves.set(game.id, points);
    }
  }
  return { games: [...merged.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)), curves };
}

export function currentManifest({ season, schedule, games, now, previous = null, analysisChanged = false, league = null }) {
  const currentSchedule = schedule.filter((game) => game.season === season);
  const analyzed = new Map(games.filter((game) => !game.dataSuspect).map((game) => [game.id, game]));
  const latest = currentSchedule.filter((game) => {
    const analysis = analyzed.get(game.id);
    return game.status === 'final' && analysis && analysis.jetsScore === game.jetsScore && analysis.oppScore === game.oppScore;
  }).at(-1);
  return {
    schemaVersion: 1, season, checkedAt: now.toISOString(),
    analysisUpdatedAt: analysisChanged ? now.toISOString() : previous?.analysisUpdatedAt ?? null,
    latestAnalyzedGameId: latest?.id ?? null,
    sources: { schedule: SCHEDULE_SOURCE, pbp: pbpSource(season) }, schedule: currentSchedule,
    ...(league ? { standings: divisionStandings(league, season, now) } : {}),
  };
}

async function exists(file) {
  try { await readFile(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

const sibling = (out, suffix) => path.join(path.dirname(out), `.${path.basename(out)}-refresh-${suffix}`);

/** Recover a crash between the two directory renames before beginning another run. */
export async function recoverPublication(out) {
  const backup = sibling(out, 'backup');
  const hasCurrent = await exists(path.join(out, 'games.json'));
  const hasBackup = await exists(path.join(backup, 'games.json'));
  if (!hasCurrent && hasBackup) await rename(backup, out);
  else if (hasBackup) await rm(backup, { recursive: true });
  await rm(sibling(out, 'stage'), { recursive: true, force: true });
}

export async function withDataLock(out, operation) {
  const lock = sibling(out, 'lock');
  await mkdir(path.dirname(out), { recursive: true });
  let handle;
  try {
    handle = await open(lock, 'wx', 0o600);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let owner;
    try { owner = JSON.parse(await readFile(lock, 'utf8')); } catch { throw new Error('Data refresh lock is unreadable; inspect it before retrying'); }
    try { process.kill(owner.pid, 0); throw new Error('Another data refresh is running'); }
    catch (busy) { if (busy.code !== 'ESRCH') throw busy; }
    await rm(lock);
    handle = await open(lock, 'wx', 0o600);
  }
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid }));
    await handle.close();
    await recoverPublication(out);
    return await operation();
  } finally { await handle.close().catch(() => {}); await rm(lock, { force: true }); }
}

export async function readSnapshot(out) {
  let games = [];
  let current = null;
  let analytics = null;
  let coverage = null;
  try { games = JSON.parse(await readFile(path.join(out, 'games.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  try { current = JSON.parse(await readFile(path.join(out, 'current.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  try { analytics = JSON.parse(await readFile(path.join(out, 'analytics.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  try { coverage = JSON.parse(await readFile(path.join(out, 'coverage.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!Array.isArray(games)) throw new Error('Archive is not a game array');
  if (analytics) validateAnalytics(analytics);
  if (coverage) (await import('./coverage.mjs')).validateCoverage(coverage);
  return { games, current, analytics, coverage };
}

/** Stage all files, validate them, then promote the complete directory with rollback. */
export async function publishSnapshot(out, { games, curves, current, analytics, coverage }, { beforePromote } = {}) {
  const stage = sibling(out, 'stage'), backup = sibling(out, 'backup');
  let movedOld = false;
  let promoted = false;
  try {
    await cp(out, stage, { recursive: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await mkdir(stage, { recursive: true });
  }
  try {
    await mkdir(path.join(stage, 'curves'), { recursive: true });
    await writeFile(path.join(stage, 'games.json'), JSON.stringify(games));
    await writeFile(path.join(stage, 'current.json'), JSON.stringify(current));
    if (analytics) {
      validateAnalytics(analytics);
      await writeFile(path.join(stage, 'analytics.json'), JSON.stringify(analytics));
    }
    if (coverage) {
      (await import('./coverage.mjs')).validateCoverage(coverage);
      await writeFile(path.join(stage, 'coverage.json'), JSON.stringify(coverage));
    }
    for (const [id, points] of curves) {
      if (!GAME_ID.test(id)) throw new Error(`Unsafe curve id: ${id}`);
      await writeFile(path.join(stage, 'curves', `${id}.json`), JSON.stringify(points));
    }
    const ids = new Set();
    for (const game of games) {
      if (!GAME_ID.test(game.id) || ids.has(game.id) || !Number.isInteger(game.jetsScore) || game.jetsScore < 0 ||
          !Number.isInteger(game.oppScore) || game.oppScore < 0) {
        throw new Error(`Invalid archive game: ${game.id}`);
      }
      ids.add(game.id);
      validateCurve(JSON.parse(await readFile(path.join(stage, 'curves', `${game.id}.json`), 'utf8')), game.id);
    }
    try { await rename(out, backup); movedOld = true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (beforePromote) await beforePromote();
    await rename(stage, out);
    promoted = true;
    if (movedOld) await rm(backup, { recursive: true });
  } catch (error) {
    if (movedOld && !promoted) await rename(backup, out);
    throw error;
  } finally {
    if (!promoted) await rm(stage, { recursive: true, force: true });
  }
}

export async function fetchText(url, fetcher = fetch) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Source HTTP ${response.status}: ${url}`);
  return response.text();
}
