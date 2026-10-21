import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { refreshAnalysis } from './refresh-analysis.mjs';
import { SCHEDULE_SOURCE, pbpSource } from './data-refresh.mjs';
import { PbpAvailabilityError } from './build-data.mjs';
import { analysisEnvelope } from '../src/lib/analysis-envelope.mjs';
import { DuckDBInstance } from '@duckdb/node-api';
import { beforeGame } from './baked-snapshot.mjs';

const data = async (name) => JSON.parse(await readFile(new URL(`../public/data/${name}.json`, import.meta.url), 'utf8'));
const [bakedCurrent, bakedCoverage, games, analytics, rankingsCollection, nextgen] = await Promise.all(['current', 'coverage', 'games', 'analytics', 'season-rankings', 'nextgen-stats'].map(data));
// Fixtures start from a fully analyzed season: a final the baked analysis has not reached yet (its PBP is not out) is still to be played.
const analyzedDate = bakedCurrent.schedule.find((game) => game.id === bakedCurrent.latestAnalyzedGameId)?.date ?? '';
const unanalyzed = bakedCurrent.schedule.filter((game) => game.date > analyzedDate).toSorted((a, b) => a.date.localeCompare(b.date))[0];
const { current, coverage } = unanalyzed ? beforeGame({ current: bakedCurrent, coverage: bakedCoverage }, unanalyzed.id) : { current: bakedCurrent, coverage: bakedCoverage };
const baked = { current, coverage, games, analytics, rankingsCollection, nextgen };
const historyBackup = await data('league-history');
const now = new Date(Math.max(Date.parse('2026-10-13T18:00:00Z'), ...[
  current.checkedAt, current.analysisCheck?.checkedAt, rankingsCollection.checkedAt, nextgen.checkedAt,
  historyBackup.checkedAt, ...['news', 'roster', 'stats'].map((name) => coverage[name].checkedAt),
].map((value) => Date.parse(value)).filter(Number.isFinite)) + 60000);
const after = (ms) => new Date(now.getTime() + ms);
const postgame = (game) => new Date(Math.max(now.getTime() + 600000, Date.parse(game.kickoff ?? `${game.date}T17:00:00Z`) + 5 * 3600000));
const seasonGames = games.filter((game) => game.season === current.season);
const driveRows = (await data(`drives/${current.season}`)).games;
const assetCheck = { url: pbpSource(current.season), etag: '"verified-etag"', lastModified: null, contentLength: 1000 };
const compiledCurves = new Map(await Promise.all(games.map(async (game) => [game.id, await data(`curves/${game.id}`)])));
const csv = (footballCurrent, starters = {}) => ['game_id,season,game_type,week,gameday,gametime,away_team,away_score,home_team,home_score,espn,stadium,away_qb_id,home_qb_id,away_qb_name,home_qb_name',
  ...footballCurrent.schedule.map((game) => { const [, , away, home] = game.id.split('_'); const final = game.status === 'final';
    const starter = starters[game.id] ?? { id: '00-0030565', name: 'Geno Smith' };
    return [game.id, game.season, game.seasonType, game.week, game.date, game.kickoff ? '13:00' : '', away,
      final ? game.atHome ? game.oppScore : game.jetsScore : '', home, final ? game.atHome ? game.jetsScore : game.oppScore : '',
      '', 'Fixture Stadium', game.atHome ? '00-0033537' : starter.id, game.atHome ? starter.id : '00-0033537',
      game.atHome ? 'Opponent Starter' : starter.name, game.atHome ? starter.name : 'Opponent Starter'].join(','); })].join('\n');
const extracted = (replacement = seasonGames) => ({ games: structuredClone(replacement),
  curves: new Map(replacement.map((game) => [game.id, compiledCurves.get(game.id) ?? compiledCurves.get(seasonGames[0].id)])), completeGameIds: new Set(replacement.map((game) => game.id)),
  drives: { games: Object.fromEntries(replacement.map((game) => [game.id, driveRows[game.id] ?? [[1, 1, 900, 20, 100, 8, 0]]])),
    finals: Object.fromEntries(replacement.map((game) => [game.id, { date: game.date, jetsScore: game.jetsScore, oppScore: game.oppScore }])), pendingGameIds: [], asset: assetCheck } });
async function run({ previous = null, footballCurrent = current, bakedSnapshot = baked, extract = async () => extracted(), fetcher, clock = now, failedWrite = false } = {}) {
  const writes = [], requests = [], pointsByPath = new Map();
  const result = await refreshAnalysis({ baked: bakedSnapshot, previous, football: { current: footballCurrent, coverage }, now: clock,
    extract, fetcher: fetcher ?? (async (url, init) => { requests.push({ url, init }); return url === SCHEDULE_SOURCE ? new Response(csv(footballCurrent)) : new Response('', { status: 503 }); }),
    readCurve: async (id, pathname) => pointsByPath.get(pathname) ?? compiledCurves.get(id),
    writeCurve: async (pathname, points) => { if (failedWrite) throw new Error('immutable storage unavailable'); pointsByPath.set(pathname, points); writes.push(pathname); },
  });
  return { result, writes, requests };
}

test('PBP publication proceeds independently of CSV/tracking outages and references only durably written immutable curves', async () => {
  const { result, writes } = await run();
  assert.equal(result.current.analysisCheck.status, 'ready'); assert.equal(result.current.analysisCheck.checkedAt, now.toISOString());
  assert.equal(result.rankings.status, 'retained'); assert.equal(result.nextgen.status, 'retained');
  assert.equal(result.rankings.checkedAt, rankingsCollection.seasons.find((entry) => entry.year === current.season).checkedAt);
  assert.ok(Object.values(result.curves).every((pathname) => writes.includes(pathname)));
  assert.ok(writes.every((pathname) => /^analysis\/v1\/curves\/[a-f0-9]{64}\.json$/.test(pathname)));
  assert.equal(result.games.length, seasonGames.length);
  assert.equal(result.history.status, 'ready'); assert.equal(result.drives.status, 'ready');
});

test('all source outages retain successful dates, metadata and immutable curve references', async () => {
  const first = (await run()).result, later = new Date(now.getTime() + 600000);
  const { result, writes } = await run({ previous: first, clock: later, extract: async () => { throw new PbpAvailabilityError('unavailable'); }, fetcher: async () => new Response('', { status: 503 }) });
  assert.equal(result.current.analysisCheck.status, 'retained');
  assert.equal(result.current.analysisCheck.checkedAt, first.current.analysisCheck.checkedAt);
  assert.equal(result.current.analysisCheck.attemptedAt, later.toISOString());
  assert.equal(result.current.analysisUpdatedAt, first.current.analysisUpdatedAt);
  assert.equal(result.nextgen.checkedAt, first.nextgen.checkedAt); assert.equal(result.rankings.checkedAt, first.rankings.checkedAt);
  assert.deepEqual(result.games, first.games); assert.deepEqual(result.curves, first.curves); assert.deepEqual(writes, []);
  assert.equal(result.history.status, 'retained'); assert.equal(result.history.checkedAt, first.history.checkedAt);
  assert.deepEqual(result.history.games, first.history.games); assert.equal(result.history.attemptedAt, later.toISOString());
  assert.equal(result.drives.status, 'retained'); assert.equal(result.drives.checkedAt, first.drives.checkedAt);
  assert.deepEqual(result.drives.games, first.drives.games); assert.deepEqual(result.drives.asset, first.drives.asset);
});

test('newly confirmed finals remain pending when processed PBP is unavailable', async () => {
  const footballCurrent = structuredClone(current), game = footballCurrent.schedule.find((game) => game.status === 'scheduled');
  game.status = 'final'; game.jetsScore = 20; game.oppScore = 17; game.outcome = 'win';
  const { result } = await run({ footballCurrent, clock: postgame(game), extract: async () => { throw new PbpAvailabilityError('not yet published'); } });
  assert.equal(result.current.analysisCheck.status, 'retained'); assert.equal(result.current.latestAnalyzedGameId, current.latestAnalyzedGameId);
  assert.ok(result.analytics.pendingGameIds.includes(game.id)); assert.equal(result.curves[game.id], undefined);
});

test('a corrected official final cannot expose the old wrong-score analysis or curve', async () => {
  const footballCurrent = structuredClone(current), changed = footballCurrent.schedule.find((game) => game.id === current.latestAnalyzedGameId);
  changed.jetsScore++; changed.outcome = 'win';
  const { result } = await run({ footballCurrent, extract: async () => null });
  assert.ok(result.games.every((game) => game.id !== changed.id)); assert.equal(result.curves[changed.id], undefined);
  assert.notEqual(result.current.latestAnalyzedGameId, changed.id); assert.equal(result.analytics, null);
  assert.equal(result.current.analysisCheck.status, 'retained');
});

test('curve write failure prevents an edition from escaping before its durable assets exist', async () => {
  await assert.rejects(run({ failedWrite: true }), /immutable storage unavailable/);
});

test('a verified unchanged asset skips download/extraction without changing meaningful revision or metrics timestamps', async () => {
  const first = (await run()).result;
  const previous = analysisEnvelope({ ...first, providerChecks: { pbp: { url: pbpSource(current.season), etag: '"verified-etag"', lastModified: null, contentLength: 1000 } } },
    { startedAt: now, completedAt: now });
  const requests = [], later = new Date(now.getTime() + 600000);
  const { result } = await run({ previous, clock: later, extract: async () => assert.fail('unchanged asset must not be extracted'), fetcher: async (url, init) => {
    requests.push({ url, method: init?.method });
    if (url === SCHEDULE_SOURCE) return new Response(csv(current));
    if (url === pbpSource(current.season) && init?.method === 'HEAD') return new Response(null, { headers: { etag: '"verified-etag"', 'content-length': '1000' } });
    return new Response('', { status: 503 });
  } });
  assert.equal(result.current.analysisCheck.status, 'ready'); assert.equal(result.current.analysisCheck.checkedAt, later.toISOString());
  assert.equal(result.current.analysisUpdatedAt, previous.current.analysisUpdatedAt);
  assert.equal(result.drives.checkedAt, later.toISOString()); assert.equal(result.drives.status, 'ready');
  assert.deepEqual(result.drives.games, previous.drives.games);
  assert.equal(result.revision, first.revision);
  assert.deepEqual(requests.filter((request) => request.url.endsWith('.parquet')), [{ url: pbpSource(current.season), method: 'HEAD' }]);
});

test('newer compiled analysis wins over an older runtime payload and disables its asset shortcut', async () => {
  const first = (await run()).result;
  const previous = structuredClone(first), removed = previous.games.pop();
  delete previous.curves[removed.id]; previous.analytics = null;
  previous.current.latestAnalyzedGameId = previous.games.at(-1).id;
  previous.current.analysisCheck.checkedAt = '2026-10-13T10:00:00.000Z';
  previous.sourceChecks.analysis.checkedAt = previous.current.analysisCheck.checkedAt;
  previous.providerChecks = { pbp: { url: pbpSource(current.season), etag: '"older-asset"', contentLength: 1000, lastModified: null } };
  const { result, requests } = await run({ previous, extract: async () => null });
  assert.equal(result.current.latestAnalyzedGameId, current.latestAnalyzedGameId);
  assert.equal(result.games.length, seasonGames.length);
  assert.equal(result.current.analysisCheck.checkedAt, current.analysisCheck.checkedAt);
  assert.ok(!requests.some((request) => request.init?.method === 'HEAD'));
});

async function nativeDriveAsset(finals) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'analysis-drive-fixture-'));
  const instance = await DuckDBInstance.create(':memory:'), db = await instance.connect();
  const quoted = (value) => `'${value.replaceAll("'", "''")}'`;
  try {
    const rows = finals.flatMap((game) => {
      const [, , away, home] = game.id.split('_');
      const homeScore = game.atHome ? game.jetsScore : game.oppScore, awayScore = game.atHome ? game.oppScore : game.jetsScore;
      return [
        `(1,${quoted(game.id)},${quoted(home)},${quoted(away)},1,'NYJ','run',80,1,900,'Touchdown',${quoted(game.date)},${homeScore},${awayScore},${homeScore},${awayScore},'Fixture snap',0)`,
        `(2,${quoted(game.id)},${quoted(home)},${quoted(away)},NULL,NULL,NULL,NULL,4,0,NULL,${quoted(game.date)},${homeScore},${awayScore},${homeScore},${awayScore},'END GAME',1)`,
      ];
    });
    const file = path.join(dir, 'source.parquet');
    // Deliberately no WP/metrics columns: completed drive evidence must remain publishable independently.
    await db.run(`COPY (SELECT * FROM (VALUES ${rows.join(',')}) AS t(play_id,game_id,home_team,away_team,fixed_drive,posteam,play_type,yardline_100,qtr,quarter_seconds_remaining,fixed_drive_result,game_date,home_score,away_score,total_home_score,total_away_score,"desc",game_end)) TO '${file}' (FORMAT parquet)`);
    return await readFile(file);
  } finally { db.closeSync(); instance.closeSync(); await rm(dir, { recursive: true, force: true }); }
}

test('native terminal drive evidence publishes despite unavailable metrics, using one schedule and one PBP download', async () => {
  const bytes = await nativeDriveAsset(current.schedule.filter((game) => game.status === 'final'));
  const requests = [];
  const { result } = await run({ extract: null, fetcher: async (url, init) => {
    requests.push({ url, method: init?.method });
    if (url === SCHEDULE_SOURCE) return new Response(csv(current));
    if (url === pbpSource(current.season)) return new Response(bytes, { headers: { etag: '"drive-fixture"', 'content-length': String(bytes.length) } });
    return new Response('', { status: 503 });
  } });
  assert.equal(result.current.analysisCheck.status, 'retained');
  assert.equal(result.history.status, 'ready'); assert.equal(result.drives.status, 'ready');
  assert.equal(Object.keys(result.drives.games).length, seasonGames.length);
  assert.deepEqual(result.drives.pendingGameIds, []);
  const latest = seasonGames.find((game) => game.id === current.latestAnalyzedGameId);
  assert.deepEqual(result.drives.finals[current.latestAnalyzedGameId], { date: latest.date, jetsScore: latest.jetsScore, oppScore: latest.oppScore });
  assert.deepEqual(result.drives.asset, { url: pbpSource(current.season), etag: '"drive-fixture"', lastModified: null, contentLength: bytes.length });
  assert.equal(requests.filter((request) => request.url === SCHEDULE_SOURCE).length, 1);
  assert.equal(requests.filter((request) => request.url === pbpSource(current.season)).length, 1);
});

test('the next tick publishes a new QB and drive chart while a truncated asset retains older witnessed charts', async () => {
  const footballCurrent = structuredClone(current), final = footballCurrent.schedule.find((game) => game.status === 'scheduled');
  final.status = 'final'; final.jetsScore = 20; final.oppScore = 17; final.outcome = 'win';
  const later = postgame(final); footballCurrent.checkedAt = later.toISOString();
  const first = (await run({ clock: new Date(later.getTime() - 600000) })).result;
  const bytes = await nativeDriveAsset([footballCurrent.schedule[0], final]);
  const newStarter = { id: '00-0049999', name: 'New Starter' }, requests = [];
  const { result } = await run({ previous: first, footballCurrent, clock: later, extract: null, fetcher: async (url, init) => {
    requests.push({ url, method: init?.method });
    if (url === SCHEDULE_SOURCE) return new Response(csv(footballCurrent, { [final.id]: newStarter }));
    if (url === pbpSource(current.season)) return new Response(init?.method === 'HEAD' ? null : bytes,
      { headers: { etag: '"new-truncated-fixture"', 'content-length': String(bytes.length) } });
    return new Response('', { status: 503 });
  } });
  assert.equal(baked.current.schedule.find((game) => game.id === final.id).status, 'scheduled');
  assert.deepEqual(result.history.games.find((game) => game.id === final.id).qb, newStarter);
  assert.equal(result.history.checkedAt, later.toISOString());
  assert.ok(result.drives.games[final.id]);
  assert.deepEqual(result.drives.finals[final.id], { date: final.date, jetsScore: 20, oppScore: 17 });
  assert.deepEqual(result.drives.games[current.latestAnalyzedGameId], first.drives.games[current.latestAnalyzedGameId]);
  assert.equal(result.drives.status, 'retained'); assert.equal(result.drives.checkedAt, first.drives.checkedAt);
  assert.equal(result.drives.attemptedAt, later.toISOString()); assert.equal(result.drives.asset, null);
  assert.deepEqual(result.drives.pendingGameIds, []);
  assert.equal(result.current.analysisCheck.status, 'retained');
  assert.equal(requests.filter((request) => request.url === SCHEDULE_SOURCE).length, 1);
  assert.equal(requests.filter((request) => request.url === pbpSource(current.season) && request.method !== 'HEAD').length, 1);
});

test('drive evidence bootstraps when missing and cannot reuse an unrelated asset signature', async () => {
  const first = (await run()).result;
  for (const mode of ['missing', 'mismatched']) {
    const previous = structuredClone(first);
    previous.providerChecks = { pbp: assetCheck };
    if (mode === 'missing') { delete previous.history; delete previous.drives; delete previous.sourceChecks.history; delete previous.sourceChecks.drives; }
    else previous.drives.asset.etag = '"unrelated-asset"';
    let extractedCount = 0;
    const { result } = await run({ previous, clock: new Date(now.getTime() + 600000), extract: async () => { extractedCount++; return extracted(); } });
    assert.equal(extractedCount, 1, mode);
    assert.equal(result.drives.status, 'ready', mode);
    assert.ok(result.drives.games[current.latestAnalyzedGameId], mode);
  }
});

test('drive parsing and QB-history failures retain their own successful checks without blocking valid analysis', async () => {
  const first = (await run()).result, later = new Date(now.getTime() + 600000);
  const candidate = extracted(); candidate.drives.games = structuredClone(candidate.drives.games);
  candidate.drives.games[current.latestAnalyzedGameId][0][6] = 999;
  const { result } = await run({ previous: first, clock: later, extract: async () => candidate, fetcher: async (url) =>
    url === SCHEDULE_SOURCE ? new Response(csv(current).replaceAll('00-0030565', 'invalid-starter')) : new Response('', { status: 503 }) });
  assert.equal(result.current.analysisCheck.status, 'ready'); assert.equal(result.current.analysisCheck.checkedAt, later.toISOString());
  assert.equal(result.history.status, 'retained'); assert.equal(result.history.checkedAt, first.history.checkedAt);
  assert.deepEqual(result.history.games, first.history.games);
  assert.equal(result.drives.status, 'retained'); assert.equal(result.drives.checkedAt, first.drives.checkedAt);
  assert.deepEqual(result.drives.games, first.drives.games); assert.deepEqual(result.drives.asset, first.drives.asset);
});

test('retained drive evidence cannot inherit corrected scores or no-longer-confirmed finals', async () => {
  const first = (await run()).result, footballCurrent = structuredClone(current);
  const changed = footballCurrent.schedule.find((game) => game.id === current.latestAnalyzedGameId), removed = footballCurrent.schedule[0];
  changed.jetsScore++;
  removed.status = 'scheduled'; removed.jetsScore = null; removed.oppScore = null; removed.outcome = null;
  const { result } = await run({ previous: first, footballCurrent, clock: new Date(now.getTime() + 600000), extract: async () => { throw new PbpAvailabilityError('not updated'); } });
  assert.equal(result.drives.status, 'retained');
  assert.equal(result.drives.games[changed.id], undefined); assert.equal(result.drives.finals[changed.id], undefined);
  assert.equal(result.drives.games[removed.id], undefined); assert.equal(result.drives.finals[removed.id], undefined);
  assert.ok(result.drives.pendingGameIds.includes(changed.id)); assert.ok(!result.drives.pendingGameIds.includes(removed.id));
  assert.equal(result.history.status, 'retained'); assert.equal(result.history.checkedAt, first.history.checkedAt);
});

test('a newer compiled partial drives file cannot erase a verified runtime chart on deployment', async () => {
  const first = (await run()).result, compiled = structuredClone(first.drives);
  delete compiled.games[current.latestAnalyzedGameId]; delete compiled.finals[current.latestAnalyzedGameId];
  compiled.checkedAt = after(300000).toISOString(); compiled.attemptedAt = compiled.checkedAt;
  compiled.pendingGameIds = [current.latestAnalyzedGameId]; compiled.asset = null;
  const { result } = await run({ previous: first, bakedSnapshot: { ...baked, drives: compiled }, clock: after(600000),
    extract: async () => { throw new PbpAvailabilityError('provider temporarily unavailable'); } });
  assert.deepEqual(result.drives.games[current.latestAnalyzedGameId], first.drives.games[current.latestAnalyzedGameId]);
  assert.equal(Object.keys(result.drives.games).length, seasonGames.length);
  assert.equal(result.drives.status, 'retained'); assert.equal(result.drives.checkedAt, first.drives.checkedAt);
  assert.deepEqual(result.drives.asset, first.drives.asset); assert.deepEqual(result.drives.pendingGameIds, []);
});

test('a newer compiled history cannot lose a known historical final or starter during a provider outage', async () => {
  const first = (await run()).result, fullHistory = historyBackup;
  const known = fullHistory.games.find((game) => game.status === 'final' && game.qb);
  const previous = structuredClone(first);
  previous.history = { ...fullHistory, attemptedAt: now.toISOString(), status: 'ready' };
  previous.sourceChecks.history = { status: 'ready', checkedAt: previous.history.checkedAt, attemptedAt: now.toISOString() };
  for (const mode of ['missing-final', 'downgraded-final', 'missing-starter']) {
    const compiled = structuredClone(previous.history);
    compiled.checkedAt = after(300000).toISOString(); compiled.attemptedAt = compiled.checkedAt;
    if (mode === 'missing-final') compiled.games = compiled.games.filter((game) => game.id !== known.id);
    else {
      const changed = compiled.games.find((game) => game.id === known.id);
      changed.qb = null;
      if (mode === 'downgraded-final') { changed.status = 'scheduled'; changed.jetsScore = null; changed.oppScore = null; changed.outcome = null; }
    }
    const { result } = await run({ previous, bakedSnapshot: { ...baked, history: compiled }, clock: after(600000),
      fetcher: async () => new Response('', { status: 503 }), extract: async () => { throw new PbpAvailabilityError('provider unavailable'); } });
    assert.equal(result.history.games.length, fullHistory.games.length, mode);
    assert.deepEqual(result.history.games.find((game) => game.id === known.id), known, mode);
    assert.deepEqual(result.history.playoffsByWins, previous.history.playoffsByWins, mode);
    assert.equal(result.history.status, 'retained', mode); assert.equal(result.history.checkedAt, previous.history.checkedAt, mode);
    assert.equal(result.sourceChecks.history.checkedAt, previous.history.checkedAt, mode);
  }
});

test('newer unverified compiled rows cannot replace an overlapping runtime chart, including mixed runtime evidence', async () => {
  const first = (await run()).result, id = current.latestAnalyzedGameId;
  for (const mixed of [false, true]) {
    const previous = structuredClone(first), compiled = structuredClone(first.drives);
    if (mixed) { previous.drives.asset = null; previous.drives.status = 'retained'; previous.sourceChecks.drives.status = 'retained'; }
    compiled.checkedAt = after(300000).toISOString(); compiled.attemptedAt = compiled.checkedAt;
    compiled.asset = null; compiled.games[id] = [compiled.games[id][0]];
    const { result } = await run({ previous, bakedSnapshot: { ...baked, drives: compiled }, clock: after(600000),
      fetcher: async () => new Response('', { status: 503 }), extract: async () => { throw new PbpAvailabilityError('provider unavailable'); } });
    assert.deepEqual(result.drives.games[id], first.drives.games[id]);
    assert.equal(result.drives.games[id].length, first.drives.games[id].length); assert.equal(result.drives.checkedAt, first.drives.checkedAt);
    assert.equal(result.drives.status, 'retained'); assert.deepEqual(result.drives.asset, previous.drives.asset);
  }
});

test('compiled-only witnessed games can join runtime rows without overwriting overlaps or claiming compiled freshness', async () => {
  const first = (await run()).result, previous = structuredClone(first), compiled = structuredClone(first.drives);
  const missing = current.schedule[0].id, overlap = current.latestAnalyzedGameId;
  delete previous.drives.games[missing]; delete previous.drives.finals[missing]; previous.drives.pendingGameIds = [missing];
  compiled.checkedAt = after(300000).toISOString(); compiled.attemptedAt = compiled.checkedAt;
  compiled.asset = null; compiled.games[overlap] = [compiled.games[overlap][0]];
  const { result } = await run({ previous, bakedSnapshot: { ...baked, drives: compiled }, clock: after(600000),
    fetcher: async () => new Response('', { status: 503 }), extract: async () => { throw new PbpAvailabilityError('provider unavailable'); } });
  assert.deepEqual(result.drives.games[missing], first.drives.games[missing]);
  assert.deepEqual(result.drives.games[overlap], first.drives.games[overlap]);
  assert.equal(result.drives.status, 'retained'); assert.equal(result.drives.checkedAt, first.drives.checkedAt);
  assert.equal(result.drives.asset, null); assert.deepEqual(result.drives.pendingGameIds, []);
});
