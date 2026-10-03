/**
 * Builds the Jets trade ledger from nflverse's trades and draft-pick records.
 *
 * Every traded pick is followed forward: to the player selected with it, or to
 * the later trade that moved it again, and so on. Player assets are listed as
 * recorded. Nothing is inferred beyond those two sources.
 *
 * Run: node scripts/draft-trades.mjs  →  public/data/draft-trades.json
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TEAM, parseCsv, fetchText } from './data-refresh.mjs';

export const TRADES_SOURCE = 'https://github.com/nflverse/nflverse-data/releases/download/trades/trades.csv';
export const DRAFT_SOURCE = 'https://github.com/nflverse/nflverse-data/releases/download/draft_picks/draft_picks.csv';
export const FIRST_SEASON = 1999;
const MAX_DEPTH = 8;
const CODE = /^[A-Z]{2,3}$/;
const MISSING = new Set(['', 'NA', 'N/A', 'null']);
/** draft_picks.csv keeps Pro-Football-Reference club codes; trades.csv and the site use nflverse codes. */
const PFR_CODES = { GNB: 'GB', KAN: 'KC', LAR: 'LA', LVR: 'LV', NOR: 'NO', NWE: 'NE', SDG: 'SD', SFO: 'SF', TAM: 'TB' };

function integer(value, name, { nullable = false, min = 0 } = {}) {
  if (nullable && MISSING.has(value)) return null;
  if (!/^\d+$/.test(String(value)) || Number(value) < min) throw new Error(`Invalid ${name}: ${value}`);
  return Number(value);
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error(`Invalid trade date: ${value}`);
  return value;
}

function requireColumns(rows, columns, name) {
  for (const key of columns) if (!(key in rows[0])) throw new Error(`Missing ${name} column: ${key}`);
}

function parseTradeRow(row) {
  if (!/^\d+$/.test(row.trade_id)) throw new Error(`Invalid trade id: ${row.trade_id}`);
  if (!CODE.test(row.gave) || !CODE.test(row.received) || row.gave === row.received) throw new Error(`Invalid trade teams: ${row.trade_id}`);
  const pickSeason = integer(row.pick_season, 'pick season', { nullable: true, min: 1936 });
  const pick = pickSeason === null ? null : {
    season: pickSeason,
    round: integer(row.pick_round, 'pick round', { nullable: true, min: 1 }),
    number: integer(row.pick_number, 'pick number', { nullable: true, min: 1 }),
    conditional: row.conditional === '1',
  };
  const player = MISSING.has(row.pfr_name.trim()) ? null : { id: MISSING.has(row.pfr_id) ? null : row.pfr_id, name: row.pfr_name.trim() };
  if (!pick && !player) throw new Error(`Empty trade asset: ${row.trade_id}`);
  return { tradeId: row.trade_id, season: integer(row.season, 'trade season', { min: 1936 }), date: validDate(row.trade_date), gave: row.gave, received: row.received, pick, player };
}

/**
 * One row per asset: a pick (optionally with the player it later became) or a player.
 * A malformed row in another club's trade is reported and dropped; one in a trade
 * involving `team` fails the run, because the ledger would misstate that trade.
 */
export function parseTrades(csv, { team = TEAM, onReject = () => {} } = {}) {
  const rows = parseCsv(csv);
  requireColumns(rows, ['trade_id', 'season', 'trade_date', 'gave', 'received', 'pick_season', 'pick_round', 'pick_number', 'conditional', 'pfr_id', 'pfr_name'], 'trades');
  const parsed = [];
  for (const row of rows) {
    try { parsed.push(parseTradeRow(row)); }
    catch (error) {
      if (row.gave === team || row.received === team) throw error;
      onReject(`Trade ${row.trade_id} (${row.gave} → ${row.received}) skipped: ${error.message}`);
    }
  }
  return parsed;
}

/** Draft selections keyed by draft season and overall pick. */
export function parseDraftPicks(csv) {
  const rows = parseCsv(csv);
  requireColumns(rows, ['season', 'round', 'pick', 'team', 'gsis_id', 'pfr_player_id', 'pfr_player_name', 'position', 'college'], 'draft');
  const picks = new Map();
  for (const row of rows) {
    const season = integer(row.season, 'draft season', { min: 1936 });
    if (season < FIRST_SEASON) continue;
    const pick = integer(row.pick, 'overall pick', { min: 1 });
    const round = integer(row.round, 'draft round', { min: 1 });
    const team = PFR_CODES[row.team] ?? row.team;
    if (!CODE.test(team)) throw new Error(`Invalid draft team: ${row.team}`);
    const key = `${season}_${pick}`;
    if (picks.has(key)) throw new Error(`Duplicate draft pick: ${key}`);
    const name = row.pfr_player_name.trim();
    picks.set(key, { season, round, pick, team, player: name ? {
      id: MISSING.has(row.gsis_id) ? (MISSING.has(row.pfr_player_id) ? null : row.pfr_player_id) : row.gsis_id,
      name, position: MISSING.has(row.position) ? null : row.position, college: MISSING.has(row.college) ? null : row.college,
    } : null });
  }
  if (!picks.size) throw new Error('Draft file contains no picks');
  return picks;
}

const after = (later, row) => later.date > row.date || (later.date === row.date && Number(later.tradeId) > Number(row.tradeId));

/** Follow one team's trades forward; each pick ends at a selection, a later trade, or an honest unknown. */
export function buildTradeLedger(trades, picks, { team = TEAM } = {}) {
  const byTrade = new Map();
  const movements = new Map();
  for (const row of trades) {
    if (!byTrade.has(row.tradeId)) byTrade.set(row.tradeId, []);
    byTrade.get(row.tradeId).push(row);
    if (row.pick?.number) {
      const key = `${row.pick.season}_${row.pick.number}`;
      if (!movements.has(key)) movements.set(key, []);
      movements.get(key).push(row);
    }
  }
  // `shown` is shared across one ledger entry: when several of its picks leave in
  // the same later deal, that deal's return is printed once, under the first pick.
  const became = (row, holder, depth, seen, shown) => {
    const { pick } = row;
    if (!pick.number) return row.player ? { type: 'named', player: row.player.name } : { type: 'unnumbered' };
    const later = (movements.get(`${pick.season}_${pick.number}`) ?? [])
      .filter((move) => move.gave === holder && !seen.has(move.tradeId) && after(move, row))
      .sort((a, b) => a.date.localeCompare(b.date) || Number(a.tradeId) - Number(b.tradeId))[0];
    if (later) {
      const group = byTrade.get(later.tradeId);
      const packagedWith = group.filter((entry) => entry.gave === holder).length - 1;
      const key = `${holder}:${later.tradeId}`;
      if (shown.has(key)) return { type: 'traded', tradeId: later.tradeId, date: later.date, to: later.received, packagedWith, repeated: true, received: [] };
      shown.add(key);
      const next = new Set([...seen, later.tradeId]);
      const received = depth < MAX_DEPTH ? group.filter((entry) => entry.received === holder).map((entry) => asset(entry, holder, depth + 1, next, shown)) : [];
      return { type: 'traded', tradeId: later.tradeId, date: later.date, to: later.received, packagedWith, repeated: false, received };
    }
    const selection = picks.get(`${pick.season}_${pick.number}`);
    if (selection) return { type: 'selected', team: selection.team, round: selection.round, pick: selection.pick, player: selection.player, agreed: selection.team === holder };
    return { type: 'pending' };
  };
  const asset = (row, holder, depth, seen, shown) => row.pick
    ? { kind: 'pick', season: row.pick.season, round: row.pick.round, number: row.pick.number, conditional: row.pick.conditional, became: became(row, holder, depth, seen, shown) }
    : { kind: 'player', id: row.player.id, name: row.player.name };
  const ledger = [];
  for (const [tradeId, group] of byTrade) {
    if (!group.some((row) => row.gave === team || row.received === team)) continue;
    const { season, date } = group[0];
    if (group.some((row) => row.season !== season || row.date !== date)) throw new Error(`Inconsistent trade rows: ${tradeId}`);
    if (season < FIRST_SEASON) continue;
    const shown = new Set();
    ledger.push({
      id: tradeId, season, date,
      partners: [...new Set(group.flatMap((row) => [row.gave, row.received]))].filter((code) => code !== team).sort(),
      gave: group.filter((row) => row.gave === team).map((row) => asset(row, row.received, 0, new Set([tradeId]), shown)),
      received: group.filter((row) => row.received === team).map((row) => asset(row, team, 0, new Set([tradeId]), shown)),
    });
  }
  return ledger.sort((a, b) => b.date.localeCompare(a.date) || Number(b.id) - Number(a.id));
}

const countPicks = (assets) => assets.reduce((total, item) => total + (item.kind === 'pick' ? 1 + (item.became.type === 'traded' ? countPicks(item.became.received) : 0) : 0), 0);

export function validateLedger(snapshot) {
  if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.trades) || !snapshot.trades.length) throw new Error('Invalid trade ledger');
  if (!Number.isFinite(Date.parse(snapshot.checkedAt))) throw new Error('Invalid trade ledger check time');
  const ids = new Set();
  for (const trade of snapshot.trades) {
    if (ids.has(trade.id) || !/^\d+$/.test(trade.id) || !trade.partners.length || (!trade.gave.length && !trade.received.length)) throw new Error(`Invalid trade: ${trade.id}`);
    ids.add(trade.id);
  }
  return snapshot;
}

export async function refreshTrades({ out = path.join(process.cwd(), 'public', 'data', 'draft-trades.json'), now = new Date(), fetcher = fetch, onReject = console.warn } = {}) {
  const [tradesCsv, draftCsv] = await Promise.all([fetchText(TRADES_SOURCE, fetcher), fetchText(DRAFT_SOURCE, fetcher)]);
  const trades = buildTradeLedger(parseTrades(tradesCsv, { onReject }), parseDraftPicks(draftCsv));
  const snapshot = validateLedger({
    schemaVersion: 1, team: TEAM, checkedAt: now.toISOString(), sources: { trades: TRADES_SOURCE, draft: DRAFT_SOURCE },
    firstSeason: Math.min(...trades.map((trade) => trade.season)), lastSeason: Math.max(...trades.map((trade) => trade.season)),
    counts: { trades: trades.length, picksGiven: trades.reduce((total, trade) => total + countPicks(trade.gave), 0), picksReceived: trades.reduce((total, trade) => total + countPicks(trade.received), 0) },
    trades,
  });
  await writeFile(out, JSON.stringify(snapshot));
  return snapshot;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  refreshTrades().then((snapshot) => {
    console.log(`${snapshot.counts.trades} Jets trades, ${snapshot.firstSeason}–${snapshot.lastSeason}; ${snapshot.counts.picksGiven} picks given, ${snapshot.counts.picksReceived} received`);
  }).catch((error) => { console.error(`Trade ledger failed: ${error.message}`); process.exitCode = 1; });
}
