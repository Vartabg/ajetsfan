import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { refreshData, extractSeason, PbpAvailabilityError } from './build-data.mjs';
import { SCHEDULE_SOURCE, pbpSource, parseLeagueSchedule, fetchText } from './data-refresh.mjs';
import { extractAnalytics } from './season-analytics.mjs';
import { refreshSeasonRankings, refreshNextGen } from './refresh-season-rankings.mjs';
import { extractVerifiedDrives, RESULTS } from './drives.mjs';
import { buildHistory } from './league-history.mjs';
import { analysisEnvelope, validateAnalysisEnvelope, validateAnalysisCurve } from '../src/lib/analysis-envelope.mjs';
import { validateRuntimeDrives, validateRuntimeHistory } from '../src/lib/postgame-evidence.mjs';

const checkedSource = (value, attemptedAt, retained = false) => ({ checkedAt: value?.checkedAt ?? null, attemptedAt,
  status: value?.checkedAt ? retained ? 'retained' : value.status ?? 'ready' : 'unavailable' });
const matching = (game, current) => {
  const final = current.schedule.find((entry) => entry.id === game.id);
  return game.season === current.season && !game.dataSuspect && final?.status === 'final' && final.date === game.date
    && final.jetsScore === game.jetsScore && final.oppScore === game.oppScore;
};
const jsonFile = async (file) => JSON.parse(await readFile(file, 'utf8'));
const jsonWrite = (file, value) => writeFile(file, JSON.stringify(value));
const newest = (a, b, field = 'checkedAt') => !a ? b : !b ? a : Date.parse(a[field] ?? 0) >= Date.parse(b[field] ?? 0) ? a : b;
const attempt = async (operation) => {
  try { return { status: 'fulfilled', value: await operation() }; }
  catch (reason) { return { status: 'rejected', reason }; }
};
const finalWitnessMatches = (id, witness, current) => {
  const final = current.schedule.find((game) => game.id === id);
  return final?.status === 'final' && final.season === current.season && final.date === witness.date
    && final.jetsScore === witness.jetsScore && final.oppScore === witness.oppScore;
};
const pendingDrives = (games, current) => current.schedule.filter((game) => game.season === current.season
  && game.status === 'final' && !Object.hasOwn(games, game.id)).map((game) => game.id).sort();
function retainedDrives(value, current, attemptedAt) {
  if (!value) return null;
  const finals = Object.fromEntries(Object.entries(value.finals).filter(([id, witness]) => finalWitnessMatches(id, witness, current)));
  const games = Object.fromEntries(Object.keys(finals).map((id) => [id, value.games[id]]));
  return validateRuntimeDrives({ ...value, games, finals, pendingGameIds: pendingDrives(games, current), status: 'retained', attemptedAt }, current);
}
function refreshedDrives(value, previous, current, attemptedAt) {
  const candidate = validateRuntimeDrives({ schemaVersion: 1, season: current.season, source: pbpSource(current.season), results: RESULTS,
    ...value, checkedAt: attemptedAt, attemptedAt, status: 'ready' }, current);
  const retained = previous && retainedDrives(previous, current, attemptedAt);
  const missing = Object.keys(retained?.games ?? {}).filter((id) => !Object.hasOwn(candidate.games, id));
  if (!missing.length) return candidate;
  const games = { ...retained.games, ...candidate.games }, finals = { ...retained.finals, ...candidate.finals };
  return validateRuntimeDrives({ ...candidate, games, finals, pendingGameIds: pendingDrives(games, current),
    status: 'retained', checkedAt: retained.checkedAt, asset: null }, current);
}
function driveBaseline(runtime, compiled, current, attemptedAt) {
  for (const value of [runtime, compiled]) if (value) validateRuntimeDrives(value);
  if (!runtime || !compiled) return runtime ?? compiled;
  const runtimeRows = retainedDrives(runtime, current, attemptedAt), compiledRows = retainedDrives(compiled, current, attemptedAt);
  if (!Object.keys(compiledRows.games).some((id) => !Object.hasOwn(runtimeRows.games, id))) return runtime;
  // A compiled score witness does not establish that these rows came from a complete PBP asset.
  // Keep published runtime rows until fresh terminal-verified PBP replaces them.
  const games = { ...compiledRows.games, ...runtimeRows.games }, finals = { ...compiledRows.finals, ...runtimeRows.finals };
  return validateRuntimeDrives({ ...runtimeRows, games, finals, pendingGameIds: pendingDrives(games, current), asset: null }, current);
}
function historyBaseline(runtime, compiled, attemptedAt) {
  for (const value of [runtime, compiled]) if (value) validateRuntimeHistory(value);
  const selected = newest(runtime, compiled);
  if (!runtime || selected !== compiled) return selected;
  const compiledGames = new Map(compiled.games.map((game) => [game.id, game]));
  if (!runtime.games.some((game) => game.status === 'final' && (compiledGames.get(game.id)?.status !== 'final'
    || game.qb && !compiledGames.get(game.id)?.qb))) return selected;
  return validateRuntimeHistory({ ...runtime, status: 'retained', attemptedAt });
}
async function pool(items, limit, operation) {
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) { const item = items[index++]; await operation(item); }
  }));
}
const signature = (url, response) => {
  const tag = response.headers.get('etag'), modified = response.headers.get('last-modified'), length = Number(response.headers.get('content-length'));
  return { url, etag: tag && /^"[^"]*"$/.test(tag) ? tag : null,
    lastModified: modified && Number.isFinite(Date.parse(modified)) ? new Date(modified).toISOString() : null,
    contentLength: Number.isSafeInteger(length) && length > 0 ? length : null };
};
const sameAsset = (old, current) => !!old && !!current && old.url === current.url && old.contentLength !== null && old.contentLength === current.contentLength
  && (old.etag && old.etag === current.etag || !old.etag && !current.etag && old.lastModified && old.lastModified === current.lastModified);

/** Independent source refresh; fast scores/coverage are never written by this worker. */
/** @param {{baked:any,previous?:any,football:any,now?:Date,fetcher?:typeof fetch,onError?:(message:string)=>void,readCurve:(gameId:string,pathname?:string)=>Promise<any>,writeCurve:(pathname:string,points:any)=>Promise<any>,extract?:((season:number)=>Promise<any>)|null}} options */
export async function refreshAnalysis({ baked, previous = null, football, now = new Date(), fetcher = fetch, onError = () => {}, readCurve, writeCurve, extract = null }) {
  if (!baked?.current || !Array.isArray(baked.games) || !football?.current || football.current.season !== baked.current.season
    || !Array.isArray(football.current.schedule) || !Number.isFinite(now.getTime()) || typeof readCurve !== 'function' || typeof writeCurve !== 'function') throw new Error('Invalid advanced analysis configuration');
  if (previous) validateAnalysisEnvelope(previous);
  const season = football.current.season, startedAt = new Date(now), startedWall = Date.now(), attemptedAt = now.toISOString();
  const prior = previous?.season === season ? previous : null;
  const preferPrior = !!prior && newest(prior.current.analysisCheck, baked.current.analysisCheck) === prior.current.analysisCheck;
  const baselineGames = [...baked.games.filter((game) => game.season !== season), ...(preferPrior ? prior.games : baked.games.filter((game) => game.season === season))];
  const baselineCurrent = { ...football.current, ...(preferPrior ? prior.current : { analysisCheck: baked.current.analysisCheck,
    analysisUpdatedAt: baked.current.analysisUpdatedAt, latestAnalyzedGameId: baked.current.latestAnalyzedGameId }) };
  const baselineAnalytics = preferPrior ? prior.analytics : baked.analytics ?? null;
  const baselineRankings = newest(prior?.rankings, baked.rankingsCollection?.seasons.find((entry) => entry.year === season)) ?? null;
  const baselineNextgen = newest(prior?.nextgen, baked.nextgen) ?? null;
  const baselineHistory = historyBaseline(prior?.history, baked.history, attemptedAt) ?? null;
  const baselineDrives = driveBaseline(prior?.drives, baked.drives?.season === season ? baked.drives : null, football.current, attemptedAt) ?? null;
  if (baselineHistory) validateRuntimeHistory(baselineHistory);
  if (baselineDrives) validateRuntimeDrives(baselineDrives);
  const curvesRead = new Map();
  let providerCheck = preferPrior ? prior?.providerChecks?.pbp ?? null : null, leaguePromise, assetPromise;
  const request = async (url, init) => {
    if (url !== SCHEDULE_SOURCE) return fetcher(url, init);
    leaguePromise ??= (async () => {
      const response = await fetcher(url, init);
      if (!response.ok) throw new Error('League schedule unavailable');
      return await response.text();
    })();
    return new Response(await leaguePromise);
  };
  const root = await mkdtemp(path.join(os.tmpdir(), 'ajetsfan-analysis-'));
  const data = path.join(root, 'data'), ranks = path.join(root, 'ranks'), tracking = path.join(root, 'tracking');
  try {
    await Promise.all([mkdir(path.join(data, 'curves'), { recursive: true }), mkdir(ranks), mkdir(tracking)]);
    const rankingHistory = [...new Map([...(baked.rankingsCollection?.seasons ?? []), ...(baselineRankings ? [baselineRankings] : [])].map((entry) => [entry.year, entry])).values()];
    if (rankingHistory.length) await jsonWrite(path.join(ranks, 'season-rankings.json'), { schemaVersion: 1,
      checkedAt: rankingHistory.map((entry) => entry.checkedAt).sort().at(-1), seasons: rankingHistory });
    if (baselineNextgen) await jsonWrite(path.join(tracking, 'nextgen-stats.json'), baselineNextgen);
    const verifiedAsset = () => assetPromise ??= (async () => {
      const source = pbpSource(season), oldSignature = providerCheck;
      const reusableDrives = prior?.drives === baselineDrives && baselineDrives?.status === 'ready'
        && sameAsset(baselineDrives.asset, oldSignature ?? {})
        && Object.entries(baselineDrives.finals).every(([id, witness]) => finalWitnessMatches(id, witness, football.current));
      if (oldSignature && preferPrior && prior.current.analysisCheck.status === 'ready' && reusableDrives
        && prior.games.every((game) => matching(game, football.current))) {
        try {
          const head = await request(source, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(12000) });
          if (head.ok && sameAsset(oldSignature, signature(source, head))) return { cached: true,
            drives: { status: 'fulfilled', value: { ...baselineDrives, pendingGameIds: pendingDrives(baselineDrives.games, football.current), checkedAt: attemptedAt, attemptedAt } } };
        } catch { /* Unknown signatures and missing evidence require extraction. */ }
      }
      if (extract) {
        providerCheck = null;
        const result = await extract(season);
        return { analysis: { status: 'fulfilled', value: result }, drives: result?.drives
          ? { status: 'fulfilled', value: result.drives } : { status: 'rejected', reason: new PbpAvailabilityError('Drive evidence not available') } };
      }
      let response;
      try { response = await request(source, { signal: AbortSignal.timeout(60000) }); }
      catch { throw new PbpAvailabilityError('Current PBP unavailable'); }
      if (response.status === 404) return { analysis: { status: 'fulfilled', value: null }, drives: { status: 'rejected', reason: new PbpAvailabilityError('Drive PBP not published') } };
      if ([408, 425, 429].includes(response.status) || response.status >= 500) throw new PbpAvailabilityError('Current PBP unavailable');
      if (!response.ok) throw new Error('Current PBP rejected');
      const check = signature(source, response);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 128_000_000 || !bytes.length) throw new Error('Invalid PBP size');
      const { DuckDBInstance } = await import('@duckdb/node-api');
      const instance = await DuckDBInstance.create(':memory:');
      let db;
      try {
        db = await instance.connect();
        const file = path.join(root, `${season}.parquet`); await writeFile(file, bytes);
        const analysis = await attempt(async () => {
          const result = await extractSeason(db, season, file);
          result.analytics = await extractAnalytics(db, season, file, parseLeagueSchedule(await fetchText(SCHEDULE_SOURCE, request)), now,
            { schedule: SCHEDULE_SOURCE, pbp: source, methodology: 'https://nflfastr.com/reference/fast_scraper.html' });
          return result;
        });
        const drives = await attempt(() => extractVerifiedDrives(db, file, football.current));
        if (drives.status === 'fulfilled') drives.value = { ...drives.value, asset: check };
        if (analysis.status === 'fulfilled' || drives.status === 'fulfilled') providerCheck = check;
        return { analysis, drives };
      } finally { if (db) db.closeSync(); instance.closeSync(); }
    })();
    const historyRefresh = async () => validateRuntimeHistory(buildHistory(await fetchText(SCHEDULE_SOURCE, request), { now, previous: baselineHistory }));
    const driveRefresh = async () => {
      if (!football.current.schedule.some((game) => game.season === season && game.status === 'final')) return retainedDrives(baselineDrives, football.current, attemptedAt);
      const asset = await verifiedAsset();
      if (asset.drives.status === 'rejected') throw asset.drives.reason;
      return refreshedDrives(asset.drives.value, baselineDrives, football.current, attemptedAt);
    };
    const pbp = async () => {
      await Promise.all([jsonWrite(path.join(data, 'games.json'), baselineGames), jsonWrite(path.join(data, 'current.json'), baselineCurrent),
        ...(baselineAnalytics ? [jsonWrite(path.join(data, 'analytics.json'), baselineAnalytics)] : []),
        ...(football.coverage ?? baked.coverage ? [jsonWrite(path.join(data, 'coverage.json'), football.coverage ?? baked.coverage)] : [])]);
      await pool(baselineGames, 8, async (game) => {
        const pathname = preferPrior ? prior?.curves[game.id] : undefined;
        const points = validateAnalysisCurve(await readCurve(game.id, pathname), game.season === season && !game.dataSuspect ? game : null);
        if (pathname && pathname !== `analysis/v1/curves/${createHash('sha256').update(JSON.stringify(points)).digest('hex')}.json`) throw new Error('Invalid stored curve identity');
        curvesRead.set(game.id, points);
        await jsonWrite(path.join(data, 'curves', `${game.id}.json`), points);
      });
      const currentExtract = async (target) => {
        if (target !== season) return { games: [], curves: new Map(), completeGameIds: new Set() };
        const asset = await verifiedAsset();
        if (asset.cached) {
          const games = prior.games.filter((game) => matching(game, football.current));
          return { games, curves: new Map(games.map((game) => [game.id, curvesRead.get(game.id)])), completeGameIds: new Set(games.map((game) => game.id)) };
        }
        if (asset.analysis.status === 'rejected') throw asset.analysis.reason;
        return asset.analysis.value;
      };
      await refreshData({ out: data, now, fetcher: request, extract: currentExtract, onAnalysisError: () => {} });
      return { current: await jsonFile(path.join(data, 'current.json')), games: await jsonFile(path.join(data, 'games.json')),
        analytics: await jsonFile(path.join(data, 'analytics.json')).catch((error) => { if (error.code === 'ENOENT') return null; throw error; }) };
    };
    const results = await Promise.allSettled([pbp(), refreshSeasonRankings({ outDir: ranks, now, fetcher: request, onError: () => {} }),
      refreshNextGen({ outDir: tracking, now, fetcher: request, onError: () => {} }), historyRefresh(), driveRefresh()]);
    for (const [index, result] of results.entries()) if (result.status === 'rejected') onError(`${['Analysis', 'Rankings', 'Next Gen', 'History', 'Drives'][index]} refresh failed; preserving verified source history.`);
    const analysisResult = results[0].status === 'fulfilled' ? results[0].value : null;
    const games = (analysisResult?.games ?? baselineGames).filter((game) => matching(game, football.current));
    let analytics = analysisResult?.analytics ?? baselineAnalytics;
    if (analytics && analytics.games.some((game) => !games.some((entry) => entry.id === game.id))) analytics = null;
    if (analytics) {
      const analyzed = new Set(analytics.analyzedGameIds);
      analytics = { ...analytics, pendingGameIds: [...new Set([...analytics.pendingGameIds,
        ...football.current.schedule.filter((game) => game.status === 'final' && game.seasonType === 'REG' && !analyzed.has(game.id)).map((game) => game.id)])] };
    }
    let analysisCheck = analysisResult?.current.analysisCheck ?? { ...checkedSource(baselineCurrent.analysisCheck, attemptedAt, true), reason: 'source-unavailable' };
    if (analysisCheck.status === 'unavailable' && analysisCheck.checkedAt) analysisCheck = { ...analysisCheck, status: 'retained' };
    const changedFinal = baselineGames.some((game) => game.season === season && !matching(game, football.current));
    const checkedAnalysis = changedFinal && analysisCheck.status === 'ready' && !games.some((game) => game.id === baselineCurrent.latestAnalyzedGameId)
      ? { ...checkedSource(baselineCurrent.analysisCheck, attemptedAt, true), reason: 'not-published' } : analysisCheck;
    const current = { analysisCheck: checkedAnalysis, analysisUpdatedAt: analysisResult?.current.analysisUpdatedAt ?? baselineCurrent.analysisUpdatedAt ?? null,
      latestAnalyzedGameId: games.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)).at(-1)?.id ?? null };
    const rankings = results[1].status === 'fulfilled' ? results[1].value.seasons.find((entry) => entry.year === season) ?? null
      : baselineRankings ? { ...baselineRankings, status: 'retained', attemptedAt } : null;
    const nextgen = results[2].status === 'fulfilled' ? results[2].value : baselineNextgen ? { ...baselineNextgen, status: 'retained', attemptedAt } : null;
    const history = results[3].status === 'fulfilled' ? results[3].value : baselineHistory
      ? validateRuntimeHistory({ ...baselineHistory, status: 'retained', attemptedAt }) : null;
    const drives = results[4].status === 'fulfilled' ? results[4].value : retainedDrives(baselineDrives, football.current, attemptedAt);
    const curves = {};
    await pool(games, 8, async (game) => {
      let points;
      if (analysisResult) points = await jsonFile(path.join(data, 'curves', `${game.id}.json`));
      else if (preferPrior && prior?.curves[game.id]) { curves[game.id] = prior.curves[game.id]; return; }
      else points = curvesRead.get(game.id) ?? await readCurve(game.id);
      validateAnalysisCurve(points, game);
      const pathname = `analysis/v1/curves/${createHash('sha256').update(JSON.stringify(points)).digest('hex')}.json`;
      if (prior?.curves[game.id] !== pathname) await writeCurve(pathname, points);
      curves[game.id] = pathname;
    });
    return validateAnalysisEnvelope(analysisEnvelope({ season, current, analytics, games, curves, rankings, nextgen, history, drives,
      sourceChecks: { analysis: checkedSource(current.analysisCheck, attemptedAt), rankings: checkedSource(rankings, attemptedAt), nextgen: checkedSource(nextgen, attemptedAt),
        history: checkedSource(history, attemptedAt), drives: checkedSource(drives, attemptedAt) },
      ...(providerCheck ? { providerChecks: { pbp: providerCheck } } : {}) }, { startedAt, completedAt: new Date(now.getTime() + Date.now() - startedWall) }), football.current);
  } finally { await rm(root, { recursive: true, force: true }); }
}
