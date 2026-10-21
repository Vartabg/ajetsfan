import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { analysisEnvelope } from '../src/lib/analysis-envelope.mjs';
import { makeBakedDrivesEvidence } from '../src/lib/postgame-evidence.mjs';
import { coordinateAnalysisRefresh, ANALYSIS_COLLECTION_PATH, ANALYSIS_LEASE_PATH, ANALYSIS_LEASE_TTL_MS,
  AnalysisRefreshCoordinatorError, analysisSourceChecks } from '../src/lib/analysis-refresh-coordinator.mjs';

const snapshot = async (name) => JSON.parse(await readFile(new URL(`../public/data/${name}.json`, import.meta.url), 'utf8'));
const [current, analytics, games, rankingCollection, nextgen] = await Promise.all(['current', 'analytics', 'games', 'season-rankings', 'nextgen-stats'].map(snapshot));
const [history, drives] = await Promise.all(['league-history', `drives/${current.season}`].map(snapshot));
const baseTime = Math.max(...[current.analysisCheck.attemptedAt, current.analysisUpdatedAt, analytics.analysisUpdatedAt,
  ...rankingCollection.seasons.flatMap((entry) => [entry.checkedAt, entry.attemptedAt]), nextgen.checkedAt, nextgen.attemptedAt,
  history.checkedAt, history.attemptedAt, drives.checkedAt].map((value) => Date.parse(value ?? '')).filter(Number.isFinite)) + 60_000;
const after = (milliseconds) => new Date(baseTime + milliseconds).toISOString();
const oldTime = after(0), freshTime = after(600_000);
const clone = (value) => structuredClone(value);
function envelope(at = oldTime, options = {}) {
  const seasonGames = games.filter((game) => game.season === current.season && !game.dataSuspect), startedAt = new Date(at);
  const ranking = clone(rankingCollection.seasons.find((record) => record.year === current.season));
  Object.assign(ranking, { status: 'ready', checkedAt: at, attemptedAt: at });
  const next = { ...clone(nextgen), status: 'ready', checkedAt: at, attemptedAt: at };
  // This is a healthy provider fixture even when today's baked history retains a season.
  for (const season of next.seasons) {
    Object.assign(season, { status: 'ready', checkedAt: at, attemptedAt: at });
    delete season.retentionReason;
  }
  const fields = { season: current.season, current: { analysisCheck: { ...clone(current.analysisCheck), status: 'ready', checkedAt: at, attemptedAt: at },
    analysisUpdatedAt: current.analysisUpdatedAt, latestAnalyzedGameId: current.latestAnalyzedGameId }, analytics: clone(analytics), games: clone(seasonGames),
    curves: Object.fromEntries(seasonGames.map((game) => [game.id, `analysis/v1/curves/${createHash('sha256').update(game.id).digest('hex')}.json`])),
    rankings: ranking, nextgen: next, ...options };
  return analysisEnvelope(fields, { startedAt, completedAt: new Date(startedAt.getTime() + 1_000) });
}
const conflict = () => Object.assign(new Error('Conditional write conflict'), { code: 'CONFLICT' });
function postgameEnvelope(at = oldTime) {
  const value = envelope(at);
  value.history = { ...clone(history), checkedAt: at, attemptedAt: at, status: 'ready' };
  value.drives = { ...makeBakedDrivesEvidence(clone(drives), current, games), checkedAt: at, attemptedAt: at, status: 'ready' };
  value.sourceChecks = analysisSourceChecks(value);
  return analysisEnvelope(value, { startedAt: new Date(at), completedAt: new Date(Date.parse(at) + 1000) });
}
function store(initial = []) {
  let version = 0; const entries = new Map(), writes = [];
  const set = (path, value) => { const result = { value: clone(value), etag: String(++version) }; entries.set(path, result); return result; };
  for (const [path, value] of initial) set(path, value);
  return { entries, writes, set, read: async (path) => clone(entries.get(path) ?? null), write: async (path, value, options) => {
    const previous = entries.get(path);
    if (options.createOnly && previous || options.ifMatch && previous?.etag !== options.ifMatch) throw conflict();
    assert.ok(options.createOnly || options.ifMatch); writes.push({ path, value: clone(value), options }); return { etag: set(path, value).etag };
  } };
}
function setup(initial = [[ANALYSIS_COLLECTION_PATH, envelope()]], at = freshTime) {
  const storage = store(initial); let instant = new Date(at);
  const options = { ...storage, isConflict: (error) => error.code === 'CONFLICT', owner: 'analysis-worker-one', now: () => new Date(instant),
    refresh: async ({ now }) => envelope(now.toISOString()) };
  return { storage, options, advance: (milliseconds) => { instant = new Date(instant.getTime() + milliseconds); },
    run: (extra = {}) => coordinateAnalysisRefresh({ ...options, ...extra }) };
}

test('initial missing storage passes null to the worker and atomically creates its first envelope', async () => {
  const { run, storage } = setup([]);
  const result = await run({ refresh: async ({ previous, now }) => { assert.equal(previous, null); return envelope(now.toISOString()); } });
  assert.equal(result.status, 'published'); assert.equal(result.season, current.season); assert.deepEqual(result.failedSourceIds, []);
  assert.deepEqual(storage.writes.find((record) => record.path === ANALYSIS_COLLECTION_PATH).options, { createOnly: true });
  assert.equal(Date.parse(storage.entries.get(ANALYSIS_LEASE_PATH).value.expiresAt), 0);
});

test('healthy fixture seasons share its simulated clock and invalid retained metadata still fails closed', () => {
  const value = envelope(after(86_400_000));
  for (const season of value.nextgen.seasons) {
    assert.equal(season.status, 'ready'); assert.equal(season.checkedAt, after(86_400_000));
    assert.equal(season.attemptedAt, after(86_400_000)); assert.equal(season.retentionReason, undefined);
  }
  value.nextgen.seasons[0].retentionReason = 'A retained reason cannot describe a ready season.';
  assert.throws(() => analysisEnvelope(value, { startedAt: new Date(value.updatedAt), completedAt: new Date(value.updatedAt) }), /Invalid advanced analysis edition/);
});

test('healthy duplicate invocations reuse all checked providers until the eight-minute boundary', async () => {
  const { run, advance } = setup([[ANALYSIS_COLLECTION_PATH, postgameEnvelope()]], after(479_999));
  assert.equal((await run({ refresh: () => assert.fail('ready providers must not be polled early') })).status, 'fresh');
  advance(1); assert.equal((await run({ refresh: ({ now }) => postgameEnvelope(now.toISOString()) })).status, 'published');
});

test('a recently checked legacy edition still bootstraps the two new postgame sources', async () => {
  const { run, storage } = setup(undefined, after(60_000));
  let calls = 0;
  assert.equal((await run({ refresh: ({ now }) => { calls++; return postgameEnvelope(now.toISOString()); } })).status, 'published');
  assert.equal(calls, 1);
  assert.ok(storage.entries.get(ANALYSIS_COLLECTION_PATH).value.drives);
});

test('postgame failures retry independently and older publishers cannot discard their checks', async () => {
  for (const name of ['history', 'drives']) {
    const prior = postgameEnvelope();
    prior[name].status = 'retained'; prior.sourceChecks[name].status = 'retained';
    const { run } = setup([[ANALYSIS_COLLECTION_PATH, prior]], after(60_000));
    const result = await run({ refresh: ({ now }) => {
      const next = postgameEnvelope(now.toISOString());
      next[name] = { ...prior[name], attemptedAt: now.toISOString() };
      next.sourceChecks = analysisSourceChecks(next);
      return next;
    } });
    assert.equal(result.status, 'degraded'); assert.deepEqual(result.failedSourceIds, [name]);
  }
  const { run, storage } = setup([[ANALYSIS_COLLECTION_PATH, postgameEnvelope()]]);
  const before = clone(storage.entries.get(ANALYSIS_COLLECTION_PATH));
  assert.equal((await run()).status, 'superseded');
  assert.deepEqual(storage.entries.get(ANALYSIS_COLLECTION_PATH), before);
});

test('fresh publication time never conceals an older individual provider check', async () => {
  const stale = envelope(after(540_000));
  stale.rankings.checkedAt = oldTime; stale.rankings.attemptedAt = oldTime;
  const { run } = setup([[ANALYSIS_COLLECTION_PATH, stale]]);
  assert.equal((await run()).status, 'published');
});

test('retained data retries on the next invocation and preserves its last successful source date', async () => {
  const prior = envelope(); prior.rankings.status = 'retained';
  const { run } = setup([[ANALYSIS_COLLECTION_PATH, prior]], after(60_000));
  const result = await run({ refresh: async ({ previous, now }) => {
    const fields = { ...previous, rankings: { ...previous.rankings, attemptedAt: now.toISOString(), status: 'retained' } };
    return analysisEnvelope(fields, { startedAt: now, completedAt: new Date(now.getTime() + 1_000) });
  } });
  assert.equal(result.status, 'degraded'); assert.deepEqual(result.failedSourceIds, ['rankings']);
});

test('null provider datasets report explicit unavailable checks instead of fabrication', async () => {
  const empty = envelope(freshTime, { rankings: null, nextgen: null, sourceChecks: {
    analysis: { status: 'ready', checkedAt: freshTime, attemptedAt: freshTime },
    rankings: { status: 'unavailable', checkedAt: null, attemptedAt: freshTime }, nextgen: { status: 'unavailable', checkedAt: null, attemptedAt: freshTime },
  } });
  const { run } = setup([]);
  const result = await run({ refresh: async () => empty });
  assert.equal(result.status, 'degraded'); assert.deepEqual(result.failedSourceIds, ['rankings', 'nextgen']);
  assert.equal(analysisSourceChecks(empty).rankings.checkedAt, null);
});

test('a validated new season can replace prior-season provider checks without carrying their dates forward', async () => {
  const ranking = clone(rankingCollection.seasons.find((record) => record.year === current.season - 1));
  Object.assign(ranking, { status: 'ready', checkedAt: oldTime, attemptedAt: oldTime });
  const prior = envelope(oldTime, { season: current.season - 1, current: {
    analysisCheck: { status: 'ready', checkedAt: oldTime, attemptedAt: oldTime, reason: null }, analysisUpdatedAt: null, latestAnalyzedGameId: null,
  }, games: [], curves: {}, analytics: null, rankings: ranking });
  const { run } = setup([[ANALYSIS_COLLECTION_PATH, prior]]);
  const result = await run();
  assert.equal(result.status, 'published'); assert.equal(result.season, current.season);
});

test('simultaneous jobs acquire one lease and only one native-worker callback runs', async () => {
  const { run } = setup([]); let announce, complete, calls = 0;
  const started = new Promise((resolve) => { announce = resolve; }), pending = new Promise((resolve) => { complete = resolve; });
  const refresh = async () => { calls++; announce(); await pending; return envelope(freshTime); };
  const first = run({ refresh }), second = run({ owner: 'analysis-worker-two', refresh });
  await started; complete(); const results = await Promise.all([first, second]);
  assert.equal(calls, 1); assert.deepEqual(results.map((result) => result.status).sort(), ['busy', 'published']);
});

test('the eleven-minute lease fences timed-out workers and cannot release a successor’s lease', async () => {
  for (const replace of [false, true]) {
    const { run, storage, advance } = setup(), replacement = { owner: 'new-worker', expiresAt: after(1_800_000) };
    const result = await run({ refresh: async () => { advance(ANALYSIS_LEASE_TTL_MS); if (replace) storage.set(ANALYSIS_LEASE_PATH, replacement); return envelope(freshTime); } });
    assert.equal(result.status, 'superseded'); assert.equal(storage.entries.get(ANALYSIS_COLLECTION_PATH).value.updatedAt, envelope().updatedAt);
    if (replace) assert.deepEqual(storage.entries.get(ANALYSIS_LEASE_PATH).value, replacement);
  }
});

test('a CAS conflict retains a newer external envelope even when this worker still owns its lease', async () => {
  const { run, storage } = setup(), newer = envelope(after(660_000));
  const result = await run({ refresh: async () => { storage.set(ANALYSIS_COLLECTION_PATH, newer); return envelope(freshTime); } });
  assert.equal(result.status, 'superseded'); assert.deepEqual(storage.entries.get(ANALYSIS_COLLECTION_PATH).value, newer);
});

test('same-season source checks and attempts cannot regress behind verified published data', async () => {
  for (const dataset of ['analysis', 'rankings', 'nextgen']) {
    const { run, storage } = setup(); const before = clone(storage.entries.get(ANALYSIS_COLLECTION_PATH));
    const result = await run({ refresh: async () => {
      const fresh = envelope(freshTime); const source = dataset === 'analysis' ? fresh.current.analysisCheck : fresh[dataset];
      source.checkedAt = after(-60_000); source.attemptedAt = freshTime; source.status = 'retained';
      if (dataset === 'nextgen') for (const season of source.seasons) season.checkedAt = source.checkedAt;
      return fresh;
    } });
    assert.equal(result.status, 'superseded'); assert.deepEqual(storage.entries.get(ANALYSIS_COLLECTION_PATH), before);
  }
});

test('invalid storage and unsafe provider failures leave validated data untouched with safe diagnostics', async () => {
  const invalid = setup([[ANALYSIS_COLLECTION_PATH, { version: 1 }]]);
  await assert.rejects(invalid.run(), (error) => error.code === 'invalid_snapshot');
  for (const method of ['read', 'write', 'refresh']) {
    const { run } = setup();
    await assert.rejects(run({ [method]: async () => { throw new Error('credential=test-only-private-credential'); } }), (error) => {
      assert.ok(error instanceof AnalysisRefreshCoordinatorError); assert.equal(error.cause, undefined);
      assert.equal(`${error.stack}${JSON.stringify(error)}`.includes('test-only-private-credential'), false); return true;
    });
  }
});
