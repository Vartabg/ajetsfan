import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { refreshAnalysis } from './refresh-analysis.mjs';
import { SCHEDULE_SOURCE, pbpSource } from './data-refresh.mjs';
import { PbpAvailabilityError } from './build-data.mjs';
import { analysisEnvelope } from '../src/lib/analysis-envelope.mjs';

const data = async (name) => JSON.parse(await readFile(new URL(`../public/data/${name}.json`, import.meta.url), 'utf8'));
const [current, coverage, games, analytics, rankingsCollection, nextgen] = await Promise.all(['current', 'coverage', 'games', 'analytics', 'season-rankings', 'nextgen-stats'].map(data));
const baked = { current, coverage, games, analytics, rankingsCollection, nextgen };
const now = new Date('2026-10-13T18:00:00Z');
const seasonGames = games.filter((game) => game.season === current.season);
const compiledCurves = new Map(await Promise.all(games.map(async (game) => [game.id, await data(`curves/${game.id}`)])));
const csv = (footballCurrent) => ['game_id,season,game_type,week,gameday,gametime,away_team,away_score,home_team,home_score',
  ...footballCurrent.schedule.map((game) => { const [, , away, home] = game.id.split('_'); const final = game.status === 'final';
    return [game.id, game.season, game.seasonType, game.week, game.date, game.kickoff ? '13:00' : '', away,
      final ? game.atHome ? game.oppScore : game.jetsScore : '', home, final ? game.atHome ? game.jetsScore : game.oppScore : ''].join(','); })].join('\n');
const extracted = (replacement = seasonGames) => ({ games: structuredClone(replacement),
  curves: new Map(replacement.map((game) => [game.id, compiledCurves.get(game.id) ?? compiledCurves.get(seasonGames[0].id)])), completeGameIds: new Set(replacement.map((game) => game.id)) });
async function run({ previous = null, footballCurrent = current, extract = async () => extracted(), fetcher, clock = now, failedWrite = false } = {}) {
  const writes = [], requests = [], pointsByPath = new Map();
  const result = await refreshAnalysis({ baked, previous, football: { current: footballCurrent, coverage }, now: clock,
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
});

test('all source outages retain successful dates, metadata and immutable curve references', async () => {
  const first = (await run()).result, later = new Date(now.getTime() + 600000);
  const { result, writes } = await run({ previous: first, clock: later, fetcher: async () => new Response('', { status: 503 }) });
  assert.equal(result.current.analysisCheck.status, 'retained');
  assert.equal(result.current.analysisCheck.checkedAt, first.current.analysisCheck.checkedAt);
  assert.equal(result.current.analysisCheck.attemptedAt, later.toISOString());
  assert.equal(result.current.analysisUpdatedAt, first.current.analysisUpdatedAt);
  assert.equal(result.nextgen.checkedAt, first.nextgen.checkedAt); assert.equal(result.rankings.checkedAt, first.rankings.checkedAt);
  assert.deepEqual(result.games, first.games); assert.deepEqual(result.curves, first.curves); assert.deepEqual(writes, []);
});

test('newly confirmed finals remain pending when processed PBP is unavailable', async () => {
  const footballCurrent = structuredClone(current), game = footballCurrent.schedule.find((game) => game.status === 'scheduled');
  game.status = 'final'; game.jetsScore = 20; game.oppScore = 17; game.outcome = 'win';
  const { result } = await run({ footballCurrent, clock: new Date('2026-10-18T22:00:00Z'), extract: async () => { throw new PbpAvailabilityError('not yet published'); } });
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
