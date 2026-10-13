import test from 'node:test';
import assert from 'node:assert/strict';
import { coordinateMediaRefresh, MEDIA_COLLECTION_PATH, MEDIA_LEASE_PATH, MEDIA_LEASE_TTL_MS, MIN_MEDIA_REFRESH_INTERVAL_MS,
  MediaRefreshCoordinatorError, selectLatestMediaCollection } from '../src/lib/media-refresh-coordinator.mjs';

const oldTime = '2026-10-12T12:00:00.000Z';
const freshTime = '2026-10-12T12:10:00.000Z';
const curation = '2026-10-08T00:00:00.000Z';
const outlet = { id: 'wfan', name: 'WFAN', kind: 'radio', url: 'https://www.youtube.com/@WFANNewYork', people: ['WFAN'] };
const item = { id: 'auto-wfan-videos-abcd-ef12345', title: 'Jets postgame thoughts', kind: 'video', outletId: 'wfan', author: 'WFAN',
  publishedAt: '2026-10-12T11:00:00.000Z', url: 'https://www.youtube.com/watch?v=abcdEF12345', summary: 'Published by WFAN.',
  topics: ['Radio analysis'], youtubeId: 'abcdEF12345', image: null, embedAllowed: true, context: 'current' };
const source = (time, overrides = {}) => ({ id: 'wfan-videos', name: 'WFAN videos', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCtest',
  status: 'ready', checkedAt: time, attemptedAt: time, itemCount: 1, ...overrides });
const edition = (time = oldTime, overrides = {}) => ({ schemaVersion: 1, checkedAt: time, curatedCheckedAt: curation,
  items: [item], outlets: [outlet], sources: [source(time)], ...overrides });
const curated = { checkedAt: curation, items: [], outlets: [outlet] };
const clone = (value) => structuredClone(value);
const conflict = () => Object.assign(new Error('Conditional write conflict'), { code: 'CONFLICT' });
const isConflict = (error) => error.code === 'CONFLICT';

function memoryStore(initial = []) {
  const entries = new Map();
  let version = 0;
  const set = (path, value) => { const saved = { value: clone(value), etag: String(++version) }; entries.set(path, saved); return saved; };
  for (const [path, value] of initial) set(path, value);
  const writes = [];
  return {
    entries, set, writes,
    read: async (path) => clone(entries.get(path) ?? null),
    write: async (path, value, options) => {
      const existing = entries.get(path);
      if ((options.createOnly && existing) || (options.ifMatch && existing?.etag !== options.ifMatch)) throw conflict();
      assert.ok(options.createOnly || options.ifMatch, 'all writes require an atomic precondition');
      writes.push({ path, value: clone(value), options });
      return { etag: set(path, value).etag };
    },
  };
}

function setup(initial = [[MEDIA_COLLECTION_PATH, edition()]]) {
  const store = memoryStore(initial);
  let instant = new Date(freshTime);
  const options = { ...store, isConflict, curated, baked: edition(), apiKey: 'test-only-youtube-key', owner: 'worker-one',
    now: () => new Date(instant), refresh: async () => edition(freshTime) };
  return { store, options, run: (extra = {}) => coordinateMediaRefresh({ ...options, ...extra }),
    advance: (milliseconds) => { instant = new Date(instant.getTime() + milliseconds); } };
}

test('publishes fresh verified media under conditional writes and releases its lease', async () => {
  const { store, run } = setup();
  const result = await run();
  assert.deepEqual(result, { status: 'published', checkedAt: freshTime, itemCount: 1, sourceCount: 1, failedSourceIds: [] });
  assert.equal(store.entries.get(MEDIA_COLLECTION_PATH).value.checkedAt, freshTime);
  assert.equal(Date.parse(store.entries.get(MEDIA_LEASE_PATH).value.expiresAt), 0);
  assert.equal(store.writes.filter(({ path }) => path === MEDIA_COLLECTION_PATH).length, 1);
});

test('the initial snapshot and lease are created with atomic create-only conditions', async () => {
  const { store, run } = setup([]);
  assert.equal((await run()).status, 'published');
  assert.equal(store.writes[0].path, MEDIA_LEASE_PATH);
  assert.deepEqual(store.writes[0].options, { createOnly: true });
  assert.deepEqual(store.writes.find(({ path }) => path === MEDIA_COLLECTION_PATH).options, { createOnly: true });
});

test('an unexpired worker lease suppresses duplicate publisher calls', async () => {
  const { run, store } = setup([[MEDIA_LEASE_PATH, { owner: 'existing-worker', expiresAt: '2026-10-12T12:12:00.000Z' }]]);
  assert.deepEqual(await run({ refresh: () => assert.fail('a duplicate must not fetch publishers') }), { status: 'busy' });
  assert.equal(store.writes.length, 0);
});

test('two simultaneous first acquisitions allow exactly one publisher refresh', async () => {
  const { run, store } = setup([]);
  let complete, announce;
  const started = new Promise((resolve) => { announce = resolve; });
  const waiting = new Promise((resolve) => { complete = resolve; });
  let calls = 0;
  const refresh = async () => { calls++; announce(); await waiting; return edition(freshTime); };
  const first = run({ refresh });
  const second = run({ owner: 'worker-two', refresh });
  await started;
  complete();
  const results = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.deepEqual(results.map(({ status }) => status).sort(), ['busy', 'published']);
  assert.equal(store.entries.get(MEDIA_COLLECTION_PATH).value.checkedAt, freshTime);
});

test('a crashed or missed worker can be replaced when its lease expires', async () => {
  const { run, store } = setup([[MEDIA_LEASE_PATH, { owner: 'crashed-worker', expiresAt: freshTime }]]);
  assert.equal((await run()).status, 'published');
  assert.equal(store.writes[0].options.ifMatch, '1');
});

test('a healthy edition checked less than eight minutes ago avoids duplicate API quota', async () => {
  const recent = edition('2026-10-12T12:05:00.000Z');
  const { run, store } = setup([[MEDIA_COLLECTION_PATH, recent]]);
  assert.deepEqual(await run({ refresh: () => assert.fail('healthy recent sources must not be queried again') }), { status: 'fresh', checkedAt: recent.checkedAt });
  assert.deepEqual(store.entries.get(MEDIA_COLLECTION_PATH).value, recent);
});

test('freshness checks the oldest source success rather than the edition’s maximum timestamp', async () => {
  const recent = edition(freshTime, { sources: [source(oldTime), source(freshTime, { id: 'sny-videos', itemCount: 0 })] });
  const { run } = setup([[MEDIA_COLLECTION_PATH, recent]]);
  assert.equal((await run()).status, 'published');
});

test('the eight-minute boundary permits a refresh and degraded sources bypass the quota gate', async () => {
  const { run, advance } = setup();
  advance(MIN_MEDIA_REFRESH_INTERVAL_MS - (Date.parse(freshTime) - Date.parse(oldTime)));
  assert.equal((await run({ refresh: async ({ now }) => edition(now.toISOString()) })).status, 'published');
  const failed = edition('2026-10-12T12:09:00.000Z', { sources: [source(oldTime, { status: 'retained', attemptedAt: '2026-10-12T12:09:00.000Z' })] });
  const retry = setup([[MEDIA_COLLECTION_PATH, failed]]);
  assert.equal((await retry.run()).status, 'published');
});

test('a worker that exceeds the lease lifetime cannot publish', async () => {
  const { run, store, advance } = setup();
  const result = await run({ refresh: async () => { advance(MEDIA_LEASE_TTL_MS); return edition(freshTime); } });
  assert.deepEqual(result, { status: 'superseded' });
  assert.equal(store.entries.get(MEDIA_COLLECTION_PATH).value.checkedAt, oldTime);
});

test('an older worker neither publishes nor releases the replacement owner’s lease', async () => {
  const { run, store, advance } = setup();
  const replacement = { owner: 'replacement-worker', expiresAt: '2026-10-12T12:18:00.000Z' };
  const result = await run({ refresh: async () => { advance(MEDIA_LEASE_TTL_MS + 1); store.set(MEDIA_LEASE_PATH, replacement); return edition(freshTime); } });
  assert.deepEqual(result, { status: 'superseded' });
  assert.deepEqual(store.entries.get(MEDIA_LEASE_PATH).value, replacement);
  assert.equal(store.entries.get(MEDIA_COLLECTION_PATH).value.checkedAt, oldTime);
});

test('conditional publication preserves a newer snapshot written while publishers were checked', async () => {
  const { run, store } = setup();
  const newer = edition('2026-10-12T12:11:00.000Z');
  const result = await run({ refresh: async () => { store.set(MEDIA_COLLECTION_PATH, newer); return edition(freshTime); } });
  assert.deepEqual(result, { status: 'superseded' });
  assert.deepEqual(store.entries.get(MEDIA_COLLECTION_PATH).value, newer);
});

test('conditional initial publication also preserves a concurrently created snapshot', async () => {
  const { run, store } = setup([]);
  const newer = edition('2026-10-12T12:11:00.000Z');
  assert.equal((await run({ refresh: async () => { store.set(MEDIA_COLLECTION_PATH, newer); return edition(freshTime); } })).status, 'superseded');
  assert.deepEqual(store.entries.get(MEDIA_COLLECTION_PATH).value, newer);
});

test('invalid stored or generated snapshots fail closed and leave the last edition untouched', async () => {
  for (const phase of ['stored', 'generated']) {
    const { run, store } = setup();
    const invalid = edition(freshTime, { items: [{ ...item, url: 'https://attacker.example/video' }] });
    if (phase === 'stored') store.set(MEDIA_COLLECTION_PATH, invalid);
    const before = clone(store.entries.get(MEDIA_COLLECTION_PATH));
    await assert.rejects(run({ refresh: async () => invalid }), (error) => error instanceof MediaRefreshCoordinatorError && error.code === 'invalid_snapshot');
    assert.deepEqual(store.entries.get(MEDIA_COLLECTION_PATH), before);
    assert.equal(Date.parse(store.entries.get(MEDIA_LEASE_PATH).value.expiresAt), 0);
  }
});

test('an invalid curated archive or missing API key causes no storage mutation or public-feed fallback', async () => {
  for (const options of [{ apiKey: undefined }, { apiKey: '' }, { apiKey: '  ' }, { curated: { ...curated, checkedAt: 'invalid' } }]) {
    const { run, store } = setup();
    await assert.rejects(run({ ...options, refresh: () => assert.fail('refresh must fail before publisher calls') }), MediaRefreshCoordinatorError);
    assert.equal(store.writes.length, 0);
  }
});

test('a partially failed refresh persists successful updates and retains explicit source history', async () => {
  const { run, store } = setup();
  const fresh = edition(freshTime, { sources: [source(oldTime, { status: 'retained', attemptedAt: freshTime }),
    source(freshTime, { id: 'sny-videos', name: 'SNY videos', itemCount: 0 })] });
  const result = await run({ refresh: async ({ previous, youtubeApiKey, onError, now }) => {
    assert.equal(previous.checkedAt, oldTime);
    assert.equal(youtubeApiKey, 'test-only-youtube-key');
    assert.equal(now.toISOString(), freshTime);
    onError('an upstream error containing test-only-youtube-key');
    return fresh;
  } });
  assert.equal(result.status, 'degraded');
  assert.deepEqual(result.failedSourceIds, ['wfan-videos']);
  assert.deepEqual(store.entries.get(MEDIA_COLLECTION_PATH).value, fresh);
  assert.equal(JSON.stringify(result).includes('test-only-youtube-key'), false);
});

test('all-source failure retains old successful dates but records the newest failed attempt', async () => {
  const { run, store } = setup();
  const failed = edition(oldTime, { sources: [source(oldTime, { status: 'retained', attemptedAt: freshTime })] });
  assert.equal((await run({ refresh: async () => failed })).status, 'degraded');
  assert.equal(store.entries.get(MEDIA_COLLECTION_PATH).value.checkedAt, oldTime);
  assert.equal(store.entries.get(MEDIA_COLLECTION_PATH).value.sources[0].attemptedAt, freshTime);
});

test('snapshot selection uses newer curation, then attempted generation, then successful checks', () => {
  const old = edition();
  const fresh = edition(freshTime);
  assert.equal(selectLatestMediaCollection(old, fresh), fresh);
  assert.equal(selectLatestMediaCollection(fresh, old), fresh);
  const retried = edition(oldTime, { sources: [source(oldTime, { status: 'retained', attemptedAt: freshTime })] });
  assert.equal(selectLatestMediaCollection(old, retried), retried);
  const newArchive = edition(oldTime, { curatedCheckedAt: '2026-10-09T00:00:00.000Z' });
  assert.equal(selectLatestMediaCollection(newArchive, fresh), newArchive);
  const laterFailure = edition(oldTime, { sources: [source(oldTime, { status: 'retained', attemptedAt: '2026-10-12T12:11:00.000Z' })] });
  assert.equal(selectLatestMediaCollection(fresh, laterFailure), laterFailure);
  const sameAttemptMoreSuccess = edition(freshTime, { sources: [source(freshTime, { attemptedAt: '2026-10-12T12:11:00.000Z' })] });
  assert.equal(selectLatestMediaCollection(laterFailure, sameAttemptMoreSuccess), sameAttemptMoreSuccess);
});

test('new compiled curation bypasses the healthy gate even when its sources were checked recently', async () => {
  const { run, store } = setup([[MEDIA_COLLECTION_PATH, edition('2026-10-12T12:09:00.000Z')]]);
  const curatedCheck = '2026-10-09T00:00:00.000Z';
  const newCurated = { ...curated, checkedAt: curatedCheck };
  const newBaked = edition('2026-10-12T12:09:30.000Z', { curatedCheckedAt: curatedCheck });
  let calls = 0;
  const result = await run({ curated: newCurated, baked: newBaked, refresh: async () => {
    calls++;
    return edition(freshTime, { curatedCheckedAt: curatedCheck });
  } });
  assert.equal(result.status, 'published');
  assert.equal(calls, 1);
  assert.equal(store.entries.get(MEDIA_COLLECTION_PATH).value.curatedCheckedAt, curatedCheck);
});

test('recent compiled checks with unchanged curation cannot suppress publication over an old live edition', async () => {
  const { run, store } = setup();
  const recentBaked = edition('2026-10-12T12:09:00.000Z');
  let calls = 0;
  const result = await run({ baked: recentBaked, refresh: async ({ previous }) => {
    calls++;
    assert.equal(previous, recentBaked);
    return edition(freshTime);
  } });
  assert.equal(result.status, 'published');
  assert.equal(calls, 1);
  assert.equal(store.entries.get(MEDIA_COLLECTION_PATH).value.checkedAt, freshTime);
});

test('a policy adapter can preserve the stored ETag while forcing a fresh compatible edition', async () => {
  const { run, store } = setup([[MEDIA_COLLECTION_PATH, edition(freshTime)]]);
  const preservedEtag = store.entries.get(MEDIA_COLLECTION_PATH).etag;
  const result = await run({ read: async (path) => {
    const saved = await store.read(path);
    return path === MEDIA_COLLECTION_PATH ? { value: edition(freshTime), etag: saved.etag, refreshRequired: true } : saved;
  } });
  assert.equal(result.status, 'published');
  assert.equal(store.writes.find(({ path }) => path === MEDIA_COLLECTION_PATH).options.ifMatch, preservedEtag);
});

test('new baked media and curation are supplied to refresh instead of stale stored data', async () => {
  const { run } = setup();
  const newerBaked = edition('2026-10-12T12:01:00.000Z');
  assert.equal((await run({ baked: newerBaked, refresh: async ({ previous, curated: actual }) => {
    assert.equal(previous, newerBaked);
    assert.equal(actual, curated);
    return edition(freshTime);
  } })).status, 'published');
});

test('an obsolete deployment cannot regress newer stored curated editorial content', async () => {
  const currentArchive = edition(oldTime, { curatedCheckedAt: '2026-10-09T00:00:00.000Z' });
  const { run, store } = setup([[MEDIA_COLLECTION_PATH, currentArchive]]);
  assert.deepEqual(await run({ refresh: () => assert.fail('old editorial code must not start refresh') }), { status: 'superseded' });
  assert.deepEqual(store.entries.get(MEDIA_COLLECTION_PATH).value, currentArchive);
});

test('upstream and storage exceptions are sanitized instead of exposing credential text', async () => {
  for (const method of ['refresh', 'read', 'write']) {
    const { run } = setup();
    const thrown = new Error('request leaked test-only-youtube-key');
    await assert.rejects(run({ [method]: async () => { throw thrown; } }), (error) => {
      assert.ok(error instanceof MediaRefreshCoordinatorError);
      assert.equal(`${error.stack}${JSON.stringify(error)}`.includes('test-only-youtube-key'), false);
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});

test('a malformed lease fails closed without displacing an unknown owner', async () => {
  const { run, store } = setup([[MEDIA_LEASE_PATH, { owner: 'worker', expiresAt: 'invalid' }]]);
  await assert.rejects(run(), (error) => error.code === 'invalid_lease');
  assert.equal(store.writes.length, 0);
});
