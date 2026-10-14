import { createHash } from 'node:crypto';
import { validateAnalytics } from '../../scripts/season-analytics.mjs';
import { validateSeasonRankings } from '../../scripts/refresh-season-rankings.mjs';
import { isNextGenCollection } from './nextgen-stats.ts';
import { validateRuntimeDrives, validateRuntimeHistory } from './postgame-evidence.mjs';

const record = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const timestamp = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const gameId = (value, season) => typeof value === 'string' && new RegExp(`^${season}_\\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$`).test(value);
const curvePath = /^analysis\/v1\/curves\/[a-f0-9]{64}\.json$/;
const fail = () => { throw new Error('Invalid advanced analysis edition'); };

export function validateAnalysisCurve(points, game = null) {
  if (!Array.isArray(points) || points.length < 2 || points.length > 10000 || game && !points.some((point) => point.q >= 3)) return fail();
  for (const point of points) {
    if (!record(point) || !Number.isInteger(point.q) || point.q < 1 || point.q > 10 || !Number.isFinite(point.wp) || point.wp < 0 || point.wp > 1
      || point.t !== null && (!Number.isFinite(point.t) || point.t < 0)
      || point.d !== null && (!Number.isFinite(point.d) || point.d < -1 || point.d > 1)) return fail();
  }
  if (game?.keyPlay?.playId != null && !points.some((point) => point.playId === game.keyPlay.playId && point.meaningful)) return fail();
  return points;
}

/** Pure validation: no extractor, native engine, network or filesystem operation. */
export function validateAnalysisEnvelope(value, footballCurrent = null) {
  if (!record(value) || value.version !== 1 || !Number.isInteger(value.season) || value.season < 1999 || value.season > 2200
    || !timestamp(value.updatedAt) || !Number.isInteger(value.durationMs) || value.durationMs < 0 || value.durationMs > 660000
    || !/^[a-f0-9]{64}$/.test(value.revision ?? '') || !record(value.current) || !record(value.curves)
    || !Array.isArray(value.games) || value.games.length > 30) return fail();
  const check = (source) => {
    if (!record(source) || !timestamp(source.attemptedAt) || Date.parse(source.attemptedAt) > Date.parse(value.updatedAt)
      || !['ready', 'retained', 'unavailable'].includes(source.status)
      || source.checkedAt !== null && (!timestamp(source.checkedAt) || Date.parse(source.checkedAt) > Date.parse(source.attemptedAt))
      || source.status === 'ready' && source.checkedAt === null || source.status === 'unavailable' && source.checkedAt !== null) return fail();
  };
  check(value.current.analysisCheck);
  if (![null, undefined].includes(value.current.analysisUpdatedAt) && (!timestamp(value.current.analysisUpdatedAt)
    || Date.parse(value.current.analysisUpdatedAt) > Date.parse(value.updatedAt))) return fail();
  const ids = new Set();
  for (const game of value.games) {
    if (!record(game) || !gameId(game.id, value.season) || ids.has(game.id) || game.season !== value.season || game.dataSuspect !== false
      || !Number.isInteger(game.week) || game.week !== Number(game.id.split('_')[1]) || !['REG', 'POST'].includes(game.seasonType)
      || !/^\d{4}-\d{2}-\d{2}$/.test(game.date ?? '') || new Date(`${game.date}T00:00Z`).toISOString().slice(0, 10) !== game.date
      || !Number.isInteger(game.jetsScore) || game.jetsScore < 0 || !Number.isInteger(game.oppScore) || game.oppScore < 0
      || typeof game.atHome !== 'boolean' || !/^[A-Z]{2,3}$/.test(game.opponent ?? '') || !record(game.keyPlay)
      || game.outcome !== (game.jetsScore > game.oppScore ? 'win' : game.jetsScore < game.oppScore ? 'loss' : 'tie')
      || game.outcome !== 'tie' && (!Number.isFinite(game.swing) || game.swing < 0 || game.swing > 1)
      || !curvePath.test(value.curves[game.id] ?? '')) return fail();
    const [, , away, home] = game.id.split('_');
    if ((home === 'NYJ') !== game.atHome || (game.atHome ? away : home) !== game.opponent || ![away, home].includes('NYJ')) return fail();
    if (footballCurrent) {
      const final = footballCurrent.schedule?.find((entry) => entry.id === game.id);
      if (footballCurrent.season !== value.season || final?.status !== 'final' || final.date !== game.date
        || final.jetsScore !== game.jetsScore || final.oppScore !== game.oppScore) return fail();
    }
    ids.add(game.id);
  }
  if (Object.keys(value.curves).some((id) => !ids.has(id)) || value.current.latestAnalyzedGameId !== null && !ids.has(value.current.latestAnalyzedGameId)) return fail();
  if (value.analytics !== null) {
    validateAnalytics(value.analytics);
    if (value.analytics.season !== value.season || value.analytics.analysisUpdatedAt && Date.parse(value.analytics.analysisUpdatedAt) > Date.parse(value.updatedAt)) return fail();
  }
  if (value.rankings !== null) { validateSeasonRankings(value.rankings); if (value.rankings.year !== value.season || Date.parse(value.rankings.checkedAt) > Date.parse(value.updatedAt)) return fail(); }
  if (value.nextgen !== null && (!isNextGenCollection(value.nextgen) || Date.parse(value.nextgen.checkedAt) > Date.parse(value.updatedAt))) return fail();
  // Legacy editions remain readable while the first enriched native publication bootstraps.
  const postgame = Object.hasOwn(value, 'history') || Object.hasOwn(value, 'drives');
  if (postgame) {
    if (!Object.hasOwn(value, 'history') || !Object.hasOwn(value, 'drives')) return fail();
    if (value.history !== null) validateRuntimeHistory(value.history);
    if (value.drives !== null) {
      validateRuntimeDrives(value.drives, footballCurrent);
      if (value.drives.season !== value.season) return fail();
    }
    for (const payload of [value.history, value.drives]) if (payload &&
      (Date.parse(payload.checkedAt) > Date.parse(value.updatedAt) || Date.parse(payload.attemptedAt ?? payload.checkedAt) > Date.parse(value.updatedAt))) return fail();
    if (!record(value.sourceChecks)) return fail();
  }
  if (value.sourceChecks !== undefined) for (const name of ['analysis', 'rankings', 'nextgen', ...(postgame ? ['history', 'drives'] : [])]) {
    const actual = value.sourceChecks?.[name], payload = name === 'analysis' ? value.current.analysisCheck : value[name];
    check(actual);
    if (actual.checkedAt !== (payload?.checkedAt ?? null) || actual.status !== (payload ? payload.status ?? 'ready' : 'unavailable')) return fail();
  }
  const provider = value.providerChecks?.pbp;
  if (provider !== undefined && (!record(provider) || provider.url !== `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${value.season}.parquet`
    || provider.etag !== null && (typeof provider.etag !== 'string' || provider.etag.length > 256 || !/^"[^"]*"$/.test(provider.etag))
    || provider.lastModified !== null && (!timestamp(provider.lastModified))
    || provider.contentLength !== null && (!Number.isSafeInteger(provider.contentLength) || provider.contentLength < 1))) return fail();
  return value;
}

export function analysisEnvelope(fields, { startedAt = new Date(), completedAt = new Date() } = {}) {
  const operational = new Set(['version', 'revision', 'checkedAt', 'attemptedAt', 'updatedAt', 'durationMs', 'analysisUpdatedAt', 'sourceUpdatedAt', 'providerChecks', 'asset']);
  const content = (value) => Array.isArray(value) ? value.map(content) : record(value)
    ? Object.fromEntries(Object.keys(value).sort().filter((key) => !operational.has(key)).map((key) => [key, content(value[key])])) : value;
  const revision = createHash('sha256').update(JSON.stringify(content(fields))).digest('hex');
  return validateAnalysisEnvelope({ ...fields, version: 1, updatedAt: completedAt.toISOString(), durationMs: completedAt.getTime() - startedAt.getTime(), revision });
}
