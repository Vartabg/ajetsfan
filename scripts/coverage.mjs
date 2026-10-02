import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { parseCsv } from './data-refresh.mjs';

export const NEWS_SOURCE = 'https://www.newyorkjets.com/rss/news';
export const rosterSource = (season) => `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${season}.csv`;
export const playerStatsSource = (season) => `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`;
const MISSING = new Set(['', 'NA', 'N/A', 'null']);
const PLAYER_ID = /^\d{2}-\d{7}$/;
const GAME_ID = /^\d{4}_\d{2}_[A-Z]+_[A-Z]+$/;
const OFFENSE = new Set(['QB', 'RB', 'FB', 'WR', 'TE', 'C', 'G', 'T', 'OG', 'OT', 'OL']);
const DEFENSE = new Set(['LB', 'ILB', 'OLB', 'MLB', 'DB', 'CB', 'S', 'FS', 'SS', 'DL', 'DE', 'DT', 'NT', 'EDGE']);
const SPECIAL = new Set(['K', 'P', 'LS']);
const STATUS_LABELS = { ACT: 'Active roster', DEV: 'Practice squad', PS: 'Practice squad', RES: 'Reserve', FA: 'Free agent', UFA: 'Free agent', EXE: 'Exempt' };
const STAT_FIELDS = {
  passing: { completions: 'completions', attempts: 'attempts', yards: 'passing_yards', touchdowns: 'passing_tds', interceptions: 'passing_interceptions' },
  rushing: { carries: 'carries', yards: 'rushing_yards', touchdowns: 'rushing_tds' },
  receiving: { targets: 'targets', receptions: 'receptions', yards: 'receiving_yards', touchdowns: 'receiving_tds' },
};

function requiredText(value, field, max = 160) {
  if (typeof value !== 'string' || MISSING.has(value.trim()) || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`Invalid ${field}`);
  return value.trim();
}
function optionalText(value, field) { return MISSING.has(value) ? null : requiredText(value, field); }
function integer(value, field, { nullable = false, min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (nullable && MISSING.has(value)) return null;
  if (!/^-?\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) throw new Error(`Invalid ${field}: ${value}`);
  return Number(value);
}
function timestamp(value, field, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error(`Invalid ${field}`);
  return new Date(value).toISOString();
}
function seasonNumber(value) { return integer(value, 'season', { min: 1999, max: 2200 }); }
function requireColumns(rows, columns) {
  for (const column of columns) if (!(column in rows[0])) throw new Error(`Missing coverage column: ${column}`);
}
function playerId(value) { if (!PLAYER_ID.test(value)) throw new Error(`Invalid player id: ${value}`); return value; }
function rosterPlayerId(value) {
  if (PLAYER_ID.test(value)) return value;
  if (typeof value === 'string' && /^espn-\d+$/.test(value) && value === `espn-${integer(value.slice(5), 'ESPN roster id', { min: 1 })}`) return value;
  throw new Error(`Invalid roster player id: ${value}`);
}
function position(value) {
  if (!/^[A-Z]{1,6}$/.test(value)) throw new Error(`Invalid position: ${value}`);
  return value;
}
function groupFor(value) { return OFFENSE.has(value) ? 'offense' : DEFENSE.has(value) ? 'defense' : SPECIAL.has(value) ? 'special' : 'other'; }

/** Only vetted HTTPS destinations are rendered. No userinfo, ports or lookalike hosts. */
export function safeCoverageUrl(value, kind) {
  if (typeof value !== 'string' || value !== value.trim() || /[\u0000-\u0020\u007f\\]/.test(value)) throw new Error(`Unsafe ${kind} URL`);
  let url;
  try { url = new URL(value); } catch { throw new Error(`Unsafe ${kind} URL`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) throw new Error(`Unsafe ${kind} URL`);
  const allowed = kind === 'news'
    ? url.hostname === 'www.newyorkjets.com' && /^\/news\/[^/]+\/?$/.test(url.pathname)
    : kind === 'profile'
      ? url.hostname === 'www.espn.com' && /^\/nfl\/player\/_\/id\/\d+$/.test(url.pathname) && !url.search
      : kind === 'headshot' && url.hostname === 'static.www.nfl.com' && /^\/image\/(upload|private)\//.test(url.pathname) && !url.search;
  if (!allowed) throw new Error(`Unsafe ${kind} URL`);
  return url.href;
}
function headshot(value) {
  if (MISSING.has(value)) return null;
  // Optional media never prevents a valid roster or box-score snapshot from loading.
  try { return safeCoverageUrl(value, 'headshot'); } catch { return null; }
}

/** Headlines and original publication times only; article bodies stay at the source. */
export function parseNews(xml, now = new Date()) {
  if (typeof xml !== 'string' || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('Invalid news RSS XML');
  const document = new XMLParser({ parseTagValue: false, trimValues: true, ignoreAttributes: true }).parse(xml);
  const raw = document.rss?.channel?.item;
  const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
  if (!rows.length) throw new Error('News RSS has no items');
  const ids = new Set(), urls = new Set();
  const items = rows.map((row) => {
    const title = requiredText(row.title, 'news title', 500);
    const url = safeCoverageUrl(row.link, 'news');
    const publishedAt = timestamp(row.pubDate, 'news publication date');
    const id = row.guid ? requiredText(row.guid, 'news id', 1000) : url;
    if (ids.has(id) || urls.has(url)) throw new Error('Duplicate news item');
    ids.add(id); urls.add(url);
    return { id, title, url, publishedAt };
  });
  // Publishers can expose a scheduled story before its publication time. Keep
  // already published reporting usable without promoting that future entry.
  const published = items.filter((item) => Date.parse(item.publishedAt) <= now.getTime());
  if (!published.length) throw new Error('News RSS has only future publication dates');
  return { items: published.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id)).slice(0, 12), withheldFutureItems: items.length - published.length };
}

export function parseRoster(csv, season) {
  seasonNumber(season);
  const rows = parseCsv(csv);
  requireColumns(rows, ['season', 'team', 'game_type', 'week', 'gsis_id', 'espn_id', 'full_name', 'position', 'jersey_number', 'status', 'headshot_url', 'height', 'weight', 'college', 'years_exp']);
  const teamRows = rows.filter((row) => row.team === 'NYJ' && row.game_type === 'REG');
  const current = teamRows.filter((row) => seasonNumber(row.season) === season);
  if (!current.length) throw new Error(`Roster has no NYJ regular-season rows for ${season}`);
  const weeks = current.map((row) => integer(row.week, 'roster week', { nullable: true, min: 1, max: 22 }));
  const week = weeks.some((value) => value !== null) ? Math.max(...weeks.filter((value) => value !== null)) : null;
  const selected = current.filter((row, i) => weeks[i] === week);
  const ids = new Set();
  let excludedPlayers = 0;
  const players = selected.map((row) => {
    const espnId = MISSING.has(row.espn_id) ? null : String(integer(row.espn_id, 'ESPN id', { min: 1 }));
    const gsisId = MISSING.has(row.gsis_id) ? null : playerId(row.gsis_id);
    if (gsisId === null && espnId === null) { excludedPlayers++; return null; }
    const id = gsisId ?? `espn-${espnId}`;
    if (ids.has(id)) throw new Error(`Duplicate roster player: ${id}`);
    ids.add(id);
    const role = position(row.position);
    const status = requiredText(row.status, 'roster status', 12);
    if (!/^[A-Z0-9]+$/.test(status)) throw new Error('Invalid roster status');
    const height = integer(row.height, 'height', { nullable: true, min: 48, max: 100 });
    const jersey = integer(row.jersey_number, 'jersey', { nullable: true, max: 99 });
    return {
      id, espnId, name: requiredText(row.full_name, 'player name'), position: role,
      jersey: jersey === null ? null : String(jersey), group: groupFor(role), status,
      // Roster membership, never a prediction of injury or game availability.
      statusLabel: STATUS_LABELS[status] ?? `Roster designation: ${status}`,
      headshot: headshot(row.headshot_url), height: height === null ? null : `${Math.floor(height / 12)}'${height % 12}\"`,
      weight: integer(row.weight, 'weight', { nullable: true, min: 100, max: 500 }),
      college: optionalText(row.college, 'college'), experience: integer(row.years_exp, 'experience', { nullable: true, max: 50 }),
      profileUrl: espnId === null ? null : safeCoverageUrl(`https://www.espn.com/nfl/player/_/id/${espnId}`, 'profile'),
    };
  }).filter(Boolean);
  if (!players.length) throw new Error('Roster has no players with stable source identifiers');
  return { season, week, excludedPlayers, players: players.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)) };
}

/** Sum official weekly player totals, gated to matching confirmed NYJ regular-season results. */
export function parsePlayerStats(csv, season, schedule) {
  seasonNumber(season);
  const rows = parseCsv(csv);
  requireColumns(rows, ['player_id', 'player_display_name', 'position', 'headshot_url', 'season', 'week', 'season_type', 'game_id', 'team', 'opponent_team', ...Object.values(STAT_FIELDS).flatMap((fields) => Object.values(fields))]);
  const teamRows = rows.filter((row) => row.team === 'NYJ' && row.season_type === 'REG');
  const current = teamRows.filter((row) => seasonNumber(row.season) === season);
  if (!current.length) throw new Error(`Player stats have no NYJ regular-season rows for ${season}`);
  const finals = new Map(schedule.filter((game) => game.season === season && game.seasonType === 'REG' && game.status === 'final').map((game) => [game.id, game]));
  const seen = new Set(), admitted = new Set(), players = new Map(), playerGames = new Map(), gameTotals = new Map();
  for (const row of current) {
    const game = finals.get(row.game_id);
    if (!game) continue;
    const id = playerId(row.player_id), week = integer(row.week, 'stats week', { min: 1, max: 18 });
    if (week !== game.week || row.opponent_team !== game.opponent) throw new Error(`Player stats/schedule identity mismatch: ${row.game_id}`);
    const key = `${id}/${row.game_id}`;
    if (seen.has(key)) throw new Error(`Duplicate player-game stats: ${key}`);
    seen.add(key); admitted.add(game.id);
    const name = requiredText(row.player_display_name, 'player name'), role = position(row.position), image = headshot(row.headshot_url);
    let player = players.get(id);
    if (!player) {
      player = { id, name, position: role, headshot: image, games: 0,
        ...Object.fromEntries(Object.entries(STAT_FIELDS).map(([category, fields]) => [category, Object.fromEntries(Object.keys(fields).map((field) => [field, 0]))])) };
      players.set(id, player);
      playerGames.set(id, []);
    }
    player.games++;
    playerGames.get(id).push(game.id);
    for (const [category, fields] of Object.entries(STAT_FIELDS)) {
      for (const [field, source] of Object.entries(fields)) player[category][field] += integer(row[source], source, { min: field === 'yards' ? -10000 : 0, max: 10000 });
    }
    if (integer(row.completions, 'completions') > integer(row.attempts, 'attempts') || integer(row.receptions, 'receptions') > integer(row.targets, 'targets')) throw new Error(`Inconsistent player totals: ${key}`);
    const totals = gameTotals.get(game.id) ?? { completions: 0, receptions: 0, passing_yards: 0, receiving_yards: 0, passing_tds: 0, receiving_tds: 0 };
    for (const field of Object.keys(totals)) totals[field] += Number(row[field]);
    gameTotals.set(game.id, totals);
  }
  for (const [id, totals] of gameTotals) {
    if (totals.completions !== totals.receptions || totals.passing_yards !== totals.receiving_yards || totals.passing_tds !== totals.receiving_tds) throw new Error(`Incomplete player passing/receiving totals: ${id}`);
  }
  const games = [...finals.values()].filter((game) => admitted.has(game.id)).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return {
    season, throughWeek: games.length ? Math.max(...games.map((game) => game.week)) : null, throughDate: games.at(-1)?.date ?? null,
    analyzedGameIds: games.map((game) => game.id), pendingGameIds: [...finals.keys()].filter((id) => !admitted.has(id)),
    playerGameIds: Object.fromEntries([...playerGames].sort(([a], [b]) => a.localeCompare(b)).map(([id, ids]) => [id, ids.sort()])),
    players: [...players.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
  };
}

function validateFeed(feed, expectedSource, now) {
  if (!feed || !['ready', 'retained', 'unavailable'].includes(feed.status) || feed.source !== expectedSource) throw new Error('Invalid coverage feed state/source');
  const attemptedAt = timestamp(feed.attemptedAt, 'coverage attemptedAt');
  const checkedAt = timestamp(feed.checkedAt, 'coverage checkedAt', true);
  const sourceUpdatedAt = timestamp(feed.sourceUpdatedAt, 'coverage sourceUpdatedAt', true);
  if ((feed.status === 'unavailable') !== (checkedAt === null) || (feed.status === 'ready' && checkedAt !== attemptedAt) ||
      (checkedAt && checkedAt > attemptedAt) || (sourceUpdatedAt && sourceUpdatedAt > attemptedAt) || (now && Date.parse(attemptedAt) > now.getTime())) throw new Error('Invalid coverage freshness metadata');
}

export function validateCoverage(coverage) {
  if (coverage?.schemaVersion !== 1) throw new Error('Invalid coverage schema');
  seasonNumber(coverage.season);
  validateFeed(coverage.news, NEWS_SOURCE);
  validateFeed(coverage.roster, rosterSource(seasonNumber(coverage.roster?.season)));
  validateFeed(coverage.stats, playerStatsSource(seasonNumber(coverage.stats?.season)));
  for (const feed of [coverage.roster, coverage.stats]) if (feed.status === 'ready' && feed.season !== coverage.season) throw new Error('Ready coverage has the wrong season');
  if (!Array.isArray(coverage.news.items) || !Array.isArray(coverage.roster.players) || !Array.isArray(coverage.stats.players)) throw new Error('Invalid coverage arrays');
  if (coverage.news.withheldFutureItems !== undefined) integer(coverage.news.withheldFutureItems, 'withheld future news items');
  const newsIds = new Set(), newsUrls = new Set();
  for (const item of coverage.news.items) {
    requiredText(item.id, 'news id', 1000); requiredText(item.title, 'news title', 500); safeCoverageUrl(item.url, 'news');
    timestamp(item.publishedAt, 'news publication date');
    if (Date.parse(item.publishedAt) > Date.parse(coverage.news.checkedAt) || newsIds.has(item.id) || newsUrls.has(item.url)) throw new Error('Invalid/duplicate news item');
    newsIds.add(item.id); newsUrls.add(item.url);
  }
  if (coverage.roster.week !== null) integer(coverage.roster.week, 'roster week', { min: 1, max: 22 });
  if (coverage.roster.excludedPlayers !== undefined) integer(coverage.roster.excludedPlayers, 'excluded roster players');
  const rosterIds = new Set();
  for (const player of coverage.roster.players) {
    rosterPlayerId(player.id); requiredText(player.name, 'player name'); position(player.position);
    if (rosterIds.has(player.id) || player.group !== groupFor(player.position)) throw new Error('Invalid/duplicate roster player');
    rosterIds.add(player.id);
    requiredText(player.status, 'roster status', 12); requiredText(player.statusLabel, 'roster status label');
    if (player.headshot !== null) safeCoverageUrl(player.headshot, 'headshot');
    if (player.espnId !== null) integer(player.espnId, 'ESPN id', { min: 1 });
    const profile = player.espnId === null ? null : safeCoverageUrl(`https://www.espn.com/nfl/player/_/id/${player.espnId}`, 'profile');
    if (player.profileUrl !== profile) throw new Error('Invalid roster profile URL');
    if (player.id.startsWith('espn-') && player.id !== `espn-${player.espnId}`) throw new Error('ESPN roster identity mismatch');
    if (player.jersey !== null) integer(player.jersey, 'jersey', { max: 99 });
    if (player.height !== null && !/^[4-8]'(?:[0-9]|1[01])"$/.test(player.height)) throw new Error('Invalid roster height');
    if (player.weight !== null) integer(player.weight, 'weight', { min: 100, max: 500 });
    if (player.experience !== null) integer(player.experience, 'experience', { max: 50 });
    if (player.college !== null) requiredText(player.college, 'college');
  }
  const stats = coverage.stats, gameIds = new Set();
  if (!Array.isArray(stats.analyzedGameIds) || !Array.isArray(stats.pendingGameIds)) throw new Error('Invalid player stats game coverage');
  for (const id of [...stats.analyzedGameIds, ...stats.pendingGameIds]) {
    if (!GAME_ID.test(id) || Number(id.slice(0, 4)) !== stats.season || !id.split('_').slice(2).includes('NYJ') || gameIds.has(id)) throw new Error('Invalid/duplicate player stats game id');
    gameIds.add(id);
  }
  if (stats.throughWeek !== null) integer(stats.throughWeek, 'stats throughWeek', { min: 1, max: 18 });
  if (stats.throughDate !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(stats.throughDate) || new Date(`${stats.throughDate}T00:00:00Z`).toISOString().slice(0, 10) !== stats.throughDate)) throw new Error('Invalid stats throughDate');
  if (stats.analyzedGameIds.length === 0 ? stats.throughWeek !== null || stats.throughDate !== null : stats.throughWeek === null || stats.throughDate === null) throw new Error('Invalid player stats cutoff');
  const statsIds = new Set();
  for (const player of stats.players) {
    playerId(player.id); requiredText(player.name, 'player name'); position(player.position);
    if (statsIds.has(player.id)) throw new Error('Duplicate aggregate player');
    statsIds.add(player.id); integer(player.games, 'player games', { min: 1, max: stats.analyzedGameIds.length });
    if (player.headshot !== null) safeCoverageUrl(player.headshot, 'headshot');
    for (const [category, fields] of Object.entries(STAT_FIELDS)) for (const field of Object.keys(fields)) integer(player[category]?.[field], `${category} ${field}`, { min: field === 'yards' ? -100000 : 0 });
    if (player.passing.completions > player.passing.attempts || player.receiving.receptions > player.receiving.targets) throw new Error('Inconsistent aggregate player totals');
  }
  // Optional only for older snapshots. New files persist exact row coverage so a
  // truncated replacement cannot hide a lost player-game behind a new week's row.
  if (stats.playerGameIds !== undefined) {
    if (!stats.playerGameIds || Array.isArray(stats.playerGameIds) || typeof stats.playerGameIds !== 'object' || Object.keys(stats.playerGameIds).length !== stats.players.length) throw new Error('Invalid player-game coverage');
    const analyzedIds = new Set(stats.analyzedGameIds), coveredGames = new Set();
    for (const player of stats.players) {
      const ids = stats.playerGameIds[player.id];
      if (!Array.isArray(ids) || ids.length !== player.games || new Set(ids).size !== ids.length || ids.some((id) => !analyzedIds.has(id))) throw new Error('Invalid player-game coverage');
      ids.forEach((id) => coveredGames.add(id));
    }
    if (coveredGames.size !== analyzedIds.size) throw new Error('Incomplete player-game coverage');
  }
  for (const [feed, rows] of [[coverage.news, coverage.news.items], [coverage.roster, coverage.roster.players], [coverage.stats, coverage.stats.players]]) {
    if (feed.status === 'unavailable' && rows.length) throw new Error('Unavailable coverage has data');
  }
  if (coverage.news.status !== 'unavailable' && !coverage.news.items.length) throw new Error('Available news feed is empty');
  if (coverage.roster.status !== 'unavailable' && !coverage.roster.players.length) throw new Error('Available roster is empty');
  return coverage;
}

async function fetchFeed(source, fetcher, now) {
  const response = await fetcher(source, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Coverage HTTP ${response.status}: ${source}`);
  const modified = response.headers.get('last-modified');
  const sourceUpdatedAt = modified === null ? null : timestamp(modified, 'source Last-Modified');
  if (sourceUpdatedAt && Date.parse(sourceUpdatedAt) > now.getTime()) throw new Error('Coverage Last-Modified is in the future');
  return { text: await response.text(), sourceUpdatedAt };
}

/** Each upstream has its own last good snapshot and successful-check timestamp. */
export async function refreshCoverage({ season, schedule, now = new Date(), previous = null, fetcher = fetch, onError = console.warn }) {
  const attemptedAt = now.toISOString();
  const definitions = [
    ['news', NEWS_SOURCE, { items: [] }, (text) => parseNews(text, now)],
    ['roster', rosterSource(season), { season, week: null, excludedPlayers: 0, players: [] }, (text) => parseRoster(text, season)],
    ['stats', playerStatsSource(season), { season, throughWeek: null, throughDate: null, analyzedGameIds: [], pendingGameIds: schedule.filter((game) => game.season === season && game.seasonType === 'REG' && game.status === 'final').map((game) => game.id), playerGameIds: {}, players: [] }, (text) => parsePlayerStats(text, season, schedule)],
  ];
  const feeds = await Promise.all(definitions.map(async ([name, source, empty, parse]) => {
    try {
      const response = await fetchFeed(source, fetcher, now);
      const payload = parse(response.text), old = previous?.[name];
      if (old?.checkedAt && old.season === season) {
        if (name === 'roster' && old.week !== null && (payload.week === null || payload.week < old.week)) throw new Error('Roster snapshot regressed to an earlier week');
        if (name === 'stats' && old.analyzedGameIds.some((id) => !payload.analyzedGameIds.includes(id))) throw new Error('Player stats lost previously confirmed games');
        if (name === 'stats') {
          const nextPlayers = new Map(payload.players.map((player) => [player.id, player]));
          if (old.players.some((player) => !nextPlayers.has(player.id) || nextPlayers.get(player.id).games < player.games)) throw new Error('Player stats lost previously verified player rows');
          if (old.playerGameIds && Object.entries(old.playerGameIds).some(([id, games]) => games.some((game) => !payload.playerGameIds[id]?.includes(game)))) throw new Error('Player stats lost previously verified player-game rows');
        }
      }
      return [name, { ...payload, checkedAt: attemptedAt, attemptedAt, status: 'ready', source, sourceUpdatedAt: response.sourceUpdatedAt }];
    } catch (error) {
      onError(`${name} coverage retained/unavailable: ${error.message}`);
      const old = previous?.[name];
      const pending = name === 'stats' && old?.season === season
        ? { pendingGameIds: schedule.filter((game) => game.season === season && game.seasonType === 'REG' && game.status === 'final' && !old.analyzedGameIds.includes(game.id)).map((game) => game.id) }
        : {};
      return [name, old?.checkedAt
        ? { ...old, ...pending, attemptedAt, status: 'retained' }
        : { ...empty, checkedAt: null, attemptedAt, status: 'unavailable', source, sourceUpdatedAt: null }];
    }
  }));
  return validateCoverage({ schemaVersion: 1, season, ...Object.fromEntries(feeds) });
}
