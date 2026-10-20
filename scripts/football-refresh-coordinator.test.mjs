import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { coordinateFootballRefresh, selectLatestFootballEdition, FOOTBALL_COLLECTION_PATH, FOOTBALL_LEASE_PATH,
  FOOTBALL_LEASE_TTL_MS, FootballRefreshCoordinatorError } from '../src/lib/football-refresh-coordinator.mjs';
import { validateFootballEdition } from './refresh-football.mjs';
import { footballScheduleSource } from './football-live.mjs';

const bakedCurrent = JSON.parse(await readFile(new URL('../public/data/current.json', import.meta.url), 'utf8'));
const bakedCoverage = JSON.parse(await readFile(new URL('../public/data/coverage.json', import.meta.url), 'utf8'));
const oldTime = '2026-10-18T17:00:00.000Z', freshTime = '2026-10-18T17:10:00.000Z';
const clone = (value) => structuredClone(value);
function edition(at = oldTime) {
  // The baked files come from the latest data refresh, which can postdate `at`; nothing in the edition may claim a later time.
  const notAfter = (value) => value && Date.parse(value) > Date.parse(at) ? at : value;
  const current = { ...clone(bakedCurrent), checkedAt: at, analysisUpdatedAt: notAfter(bakedCurrent.analysisUpdatedAt) };
  if (current.analysisCheck) Object.assign(current.analysisCheck, { attemptedAt: notAfter(current.analysisCheck.attemptedAt), checkedAt: notAfter(current.analysisCheck.checkedAt) });
  for (const game of current.schedule) if (game.scoreCheckedAt !== undefined) game.scoreCheckedAt = notAfter(game.scoreCheckedAt);
  const coverage = clone(bakedCoverage);
  for (const name of ['news', 'roster', 'stats']) Object.assign(coverage[name], { checkedAt: at, attemptedAt: at, status: 'ready', sourceUpdatedAt: notAfter(coverage[name].sourceUpdatedAt) });
  coverage.news.items = coverage.news.items.filter((item) => Date.parse(item.publishedAt) <= Date.parse(at));
  const scheduled = bakedCurrent.schedule.find((game) => game.id === '2026_06_NYJ_NE');
  const game = { eventId: '401999001', gameId: scheduled.id, season: 2026, week: 6, seasonType: 'REG', kickoff: scheduled.kickoff,
    opponent: scheduled.opponent, opponentDisplay: scheduled.opponentDisplay, atHome: false, state: 'scheduled', jetsScore: null, oppScore: null,
    period: 0, clock: null, detail: 'Scheduled', provisional: false, players: [] };
  return validateFootballEdition({ schemaVersion: 1, current, coverage,
    live: { schemaVersion: 1, season: 2026, source: footballScheduleSource(2026), checkedAt: at, attemptedAt: at, status: 'ready', games: [game], featured: game },
    scheduleCheck: { source: bakedCurrent.sources.schedule, status: 'ready', checkedAt: at, attemptedAt: at } });
}
const conflict = () => Object.assign(new Error('Conditional write conflict'), { code: 'CONFLICT' });
function memoryStore(initial = []) {
  let version = 0; const entries = new Map(), writes = [];
  const set = (path, value) => { const record = { value: clone(value), etag: String(++version) }; entries.set(path, record); return record; };
  for (const [path, value] of initial) set(path, value);
  return { entries, writes, set, read: async (path) => clone(entries.get(path) ?? null), write: async (path, value, options) => {
    const prior = entries.get(path);
    if (options.createOnly && prior || options.ifMatch && prior?.etag !== options.ifMatch) throw conflict();
    assert.ok(options.createOnly || options.ifMatch); writes.push({ path, value: clone(value), options }); return { etag: set(path, value).etag };
  } };
}
function setup(initial = [[FOOTBALL_COLLECTION_PATH, edition()]], currentTime = freshTime) {
  const store = memoryStore(initial); let instant = new Date(currentTime);
  const options = { ...store, isConflict: (error) => error.code === 'CONFLICT', baked: edition(), owner: 'football-worker-one',
    now: () => new Date(instant), refresh: async ({ now }) => edition(now.toISOString()) };
  return { store, options, advance: (milliseconds) => { instant = new Date(instant.getTime() + milliseconds); },
    run: (extra = {}) => coordinateFootballRefresh({ ...options, ...extra }) };
}

test('publishes a complete football edition under atomic preconditions and releases its lease', async () => {
  const { run, store } = setup();
  const result = await run();
  assert.equal(result.status, 'published'); assert.equal(result.checkedAt, freshTime); assert.deepEqual(result.failedSourceIds, []);
  assert.equal(store.entries.get(FOOTBALL_COLLECTION_PATH).value.current.checkedAt, freshTime);
  assert.equal(Date.parse(store.entries.get(FOOTBALL_LEASE_PATH).value.expiresAt), 0);
});

test('initial creation and caller-specific policy namespaces keep conditional publication intact', async () => {
  const { run, store } = setup([]);
  assert.equal((await run({ collectionPath: 'football/v2/collection.json', leasePath: 'football/v2/lease.json' })).status, 'published');
  assert.deepEqual(store.writes[0].options, { createOnly: true });
  assert.deepEqual(store.writes.find((record) => record.path === 'football/v2/collection.json').options, { createOnly: true });
  assert.equal(store.entries.has(FOOTBALL_COLLECTION_PATH), false);
});

test('the active clock throttles healthy duplicate calls for forty seconds; idle clock uses four minutes', async () => {
  const active = setup(undefined, '2026-10-18T17:00:30.000Z');
  assert.equal((await active.run({ refresh: () => assert.fail('active duplicate must not call providers') })).status, 'fresh');
  active.advance(10_000); assert.equal((await active.run()).status, 'published');
  // Use the idle day before the active fixture, after its compiled evidence dates.
  const idleTime = '2026-10-17T12:00:00.000Z';
  const idle = setup([[FOOTBALL_COLLECTION_PATH, edition(idleTime)]], '2026-10-17T12:03:00.000Z');
  idle.options.baked = edition(idleTime);
  assert.equal((await idle.run({ refresh: () => assert.fail('idle duplicate must not call providers') })).status, 'fresh');
  idle.advance(60_000); assert.equal((await idle.run()).status, 'published');
});

test('persistent failed sources retry on the next invocation while their last success remains unchanged', async () => {
  const degraded = edition(); degraded.coverage.news.status = 'retained';
  const { run } = setup([[FOOTBALL_COLLECTION_PATH, degraded]], '2026-10-18T17:00:10.000Z');
  const result = await run({ refresh: async ({ previous, now }) => {
    assert.equal(previous.coverage.news.status, 'retained');
    const next = clone(previous); next.coverage.news.attemptedAt = now.toISOString(); return next;
  } });
  assert.equal(result.status, 'degraded'); assert.deepEqual(result.failedSourceIds, ['news']); assert.equal(result.checkedAt, oldTime);
});

test('concurrent acquisitions allow one worker to query providers and publish', async () => {
  const { run } = setup([]); let announce, complete, calls = 0;
  const started = new Promise((resolve) => { announce = resolve; }), pending = new Promise((resolve) => { complete = resolve; });
  const refresh = async () => { calls++; announce(); await pending; return edition(freshTime); };
  const first = run({ refresh }), second = run({ owner: 'football-worker-two', refresh });
  await started; complete();
  const results = await Promise.all([first, second]); assert.equal(calls, 1);
  assert.deepEqual(results.map((result) => result.status).sort(), ['busy', 'published']);
});

test('expired and replaced workers cannot publish or release the successor’s lease', async () => {
  for (const replace of [false, true]) {
    const { run, store, advance } = setup(); const successor = { owner: 'successor', expiresAt: '2026-10-18T17:20:00.000Z' };
    const result = await run({ refresh: async () => { advance(FOOTBALL_LEASE_TTL_MS); if (replace) store.set(FOOTBALL_LEASE_PATH, successor); return edition(freshTime); } });
    assert.equal(result.status, 'superseded'); assert.equal(store.entries.get(FOOTBALL_COLLECTION_PATH).value.current.checkedAt, oldTime);
    if (replace) assert.deepEqual(store.entries.get(FOOTBALL_LEASE_PATH).value, successor);
  }
});

test('a conditional snapshot conflict preserves a newer external publication', async () => {
  const { run, store } = setup(); const newer = edition('2026-10-18T17:11:00.000Z');
  const result = await run({ refresh: async () => { store.set(FOOTBALL_COLLECTION_PATH, newer); return edition(freshTime); } });
  assert.equal(result.status, 'superseded'); assert.deepEqual(store.entries.get(FOOTBALL_COLLECTION_PATH).value, newer);
});

test('a fresh compiled edition cannot hide an overdue runtime generation', async () => {
  const { run, store } = setup(undefined, '2026-10-18T17:00:30.000Z'); const baked = edition('2026-10-18T17:00:25.000Z');
  assert.equal((await run({ baked })).status, 'published');
  assert.equal(store.entries.get(FOOTBALL_COLLECTION_PATH).value.current.checkedAt, '2026-10-18T17:00:30.000Z');
});

test('selection merges newer compiled coverage and schedule changes with a more recent runtime live check', () => {
  const stored = edition('2026-10-18T17:10:00.000Z'), baked = edition('2026-10-18T17:09:00.000Z');
  stored.coverage.stats.checkedAt = oldTime; stored.coverage.stats.attemptedAt = oldTime;
  stored.scheduleCheck.checkedAt = oldTime; stored.scheduleCheck.attemptedAt = oldTime;
  const rescheduled = '2026-10-19T17:00:00.000Z'; baked.current.schedule.find((game) => game.id === '2026_06_NYJ_NE').kickoff = rescheduled;
  const merged = selectLatestFootballEdition(baked, stored);
  assert.equal(merged.live.checkedAt, stored.live.checkedAt);
  assert.equal(merged.coverage.stats.checkedAt, baked.coverage.stats.checkedAt);
  assert.equal(merged.scheduleCheck.checkedAt, baked.scheduleCheck.checkedAt);
  assert.equal(merged.current.schedule.find((game) => game.id === '2026_06_NYJ_NE').kickoff, rescheduled);
});

test('a newer failed attempt retains the freshest verified compiled feed payload and its original date', () => {
  const baked = edition('2026-10-18T17:09:00.000Z'), stored = edition('2026-10-18T17:10:00.000Z');
  stored.coverage.news.status = 'retained'; stored.coverage.news.checkedAt = oldTime;
  const merged = selectLatestFootballEdition(baked, stored);
  assert.equal(merged.coverage.news.status, 'retained'); assert.equal(merged.coverage.news.checkedAt, baked.coverage.news.checkedAt);
  assert.equal(merged.coverage.news.attemptedAt, stored.coverage.news.attemptedAt);
});

test('invalid snapshots, malformed leases and lower generation dates fail closed without overwriting data', async () => {
  const bad = edition(); bad.current.schedule[0].jetsScore = -1;
  const invalid = setup([[FOOTBALL_COLLECTION_PATH, bad]]); const before = clone(invalid.store.entries.get(FOOTBALL_COLLECTION_PATH));
  await assert.rejects(invalid.run(), FootballRefreshCoordinatorError); assert.deepEqual(invalid.store.entries.get(FOOTBALL_COLLECTION_PATH), before);
  const lease = setup([[FOOTBALL_LEASE_PATH, { owner: 'broken', expiresAt: 'invalid' }]]);
  await assert.rejects(lease.run(), (error) => error.code === 'invalid_lease'); assert.equal(lease.store.writes.length, 0);
  const old = setup(); assert.equal((await old.run({ refresh: async () => edition('2026-10-18T16:59:59.000Z') })).status, 'superseded');
});

test('storage and publisher failures emit safe diagnostics without original credential-bearing causes', async () => {
  for (const method of ['read', 'write', 'refresh']) {
    const { run } = setup();
    await assert.rejects(run({ [method]: async () => { throw new Error('credential=test-only-private-credential'); } }), (error) => {
      assert.ok(error instanceof FootballRefreshCoordinatorError); assert.equal(error.cause, undefined);
      assert.equal(`${error.stack}${JSON.stringify(error)}`.includes('test-only-private-credential'), false); return true;
    });
  }
});
