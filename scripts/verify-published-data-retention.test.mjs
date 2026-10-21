import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyPublishedData } from './verify-published-data.mjs';
import { NEXTGEN_SOURCES } from './nextgen-stats.mjs';

const earlier = '2026-09-29T12:00:00.000Z';
const checkedAt = '2026-09-30T12:00:00.000Z';
const later = '2026-09-30T12:10:00.000Z';
const commit = '0123456789abcdef0123456789abcdef01234567';
const now = () => Date.parse('2026-09-30T12:12:00.000Z');
const collection = (check = checkedAt) => ({ schemaVersion: 1, checkedAt: check, attemptedAt: check,
  status: 'retained', sources: NEXTGEN_SOURCES, seasons: [
    { year: 2020, phase: 'regular', checkedAt: earlier, attemptedAt: check, status: 'retained',
      retentionReason: 'The source no longer includes 2020 passing measurements.', passing: [], receiving: [], rushing: [], notes: [] },
    { year: 2026, phase: 'regular', checkedAt: check, attemptedAt: check, status: 'ready', passing: [], receiving: [], rushing: [], notes: [] },
  ] });
const expected = { season: 2026, checkedAt, commit, feeds: { analysis: checkedAt, rankings: checkedAt, nextgen: checkedAt }, nextgen: collection() };
const healthy = () => ({ season: 2026, checkedAt, commit, status: 'degraded',
  feeds: Object.fromEntries(['results', 'news', 'roster', 'stats', 'analysis', 'media', 'rankings', 'nextgen', 'trades'].map((name) =>
    [name, { status: name === 'nextgen' ? 'retained' : 'ready', checkedAt: ['analysis', 'rankings', 'nextgen'].includes(name) ? later : checkedAt }])),
  analysisScheduler: { mode: 'runtime', status: 'degraded', updatedAt: later },
});
function run({ health = healthy(), ngs = collection(later), publication = expected, fetcher, ...rest } = {}) {
  return verifyPublishedData({ origin: 'https://jets-fan.example', expected: publication, now, attempts: 1, intervalMs: 0,
    fetcher: fetcher ?? (async (url) => new Response(JSON.stringify(url.endsWith('/api/health') ? health : ngs), { status: url.endsWith('/api/health') ? 503 : 200 })), ...rest });
}

test('newer ready feeds verify under fresh degraded analysis while the known historical NextGen gap remains visible', async () => {
  const requests = [];
  const result = await run({ fetcher: async (url, init) => {
    requests.push({ url, init });
    return new Response(JSON.stringify(url.endsWith('/api/health') ? healthy() : collection(later)), { status: url.endsWith('/api/health') ? 503 : 200 });
  } });
  assert.deepEqual(result.degradedFeeds, [{ name: 'nextgen', status: 'retained' }]);
  assert.equal(result.status, 'degraded');
  assert.equal(requests[1].url, 'https://jets-fan.example/data/nextgen-stats.json');
  assert.equal(requests[1].init.redirect, 'error');
  assert.equal(requests[1].init.credentials, 'omit');
  assert.equal(requests[1].init.cache, 'no-store');
});

test('a degraded aggregate cannot bless another failed feed or an older successful check', async () => {
  for (const name of ['analysis', 'rankings']) for (const change of [
    { status: 'retained' }, { status: 'unavailable' }, { status: 'overdue' }, { status: 'unknown' }, { checkedAt: earlier },
  ]) {
    for (const check of [checkedAt, later]) {
      const health = healthy(); Object.assign(health.feeds[name], { checkedAt: check }, change);
      await assert.rejects(run({ health }), /source snapshot differs/);
    }
  }
  const health = healthy(); health.commit = 'f'.repeat(40);
  await assert.rejects(run({ health }), /deployed commit differs/);
});

test('analysis schedulers must be recent valid runtime checks even when source clocks equal publication', async () => {
  for (const scheduler of [
    { mode: 'fallback', status: 'unavailable', updatedAt: later },
    { mode: 'runtime', status: 'overdue', updatedAt: later },
    { mode: 'runtime', status: 'unknown', updatedAt: later },
    { mode: 'runtime', status: 'ready', updatedAt: '2026-09-30T11:47:00.000Z' },
    { mode: 'runtime', status: 'degraded', updatedAt: '2026-09-30T12:13:00.000Z' },
    { mode: 'runtime', status: 'ready', updatedAt: '2026-02-30T12:10:00.000Z' },
  ]) {
    const health = healthy(); health.analysisScheduler = scheduler;
    for (const name of ['analysis', 'rankings', 'nextgen']) health.feeds[name].checkedAt = checkedAt;
    await assert.rejects(run({ health }), /runtime analysis delivery/);
  }
});

test('newer retained tracking needs explicit matching per-season checks and cannot hide new failures', async () => {
  const missing = { ...expected }; delete missing.nextgen;
  await assert.rejects(run({ publication: missing }), /source snapshot differs/);
  for (const mutate of [
    (value) => { value.seasons[0].checkedAt = '2026-09-28T12:00:00.000Z'; },
    (value) => { value.seasons[0].retentionReason = ''; },
    (value) => { value.seasons[1].status = 'retained'; value.seasons[1].retentionReason = 'New current season outage.'; },
    (value) => { value.seasons.pop(); },
    (value) => { value.seasons[0].year = 2019; },
    (value) => { value.checkedAt = checkedAt; },
    (value) => { value.sources.passing = 'https://unrelated.example/data'; },
    (value) => { value.seasons[0].attemptedAt = '2026-09-30T12:13:00.000Z'; },
    (value) => { value.attemptedAt = '2026-09-30T12:13:00.000Z'; },
    (value) => { value.seasons[0].status = 'ready'; delete value.seasons[0].retentionReason; },
  ]) {
    const ngs = structuredClone(collection(later)); mutate(ngs);
    await assert.rejects(run({ ngs }), /source snapshot differs/);
  }
});

test('ready analysis feeds cannot claim checks after their scheduler publication', async () => {
  const health = healthy(); health.feeds.rankings.checkedAt = '2026-09-30T12:11:00.000Z';
  await assert.rejects(run({ health }), /source snapshot differs/);
});

test('a failed, redirected, invalid or oversized tracking response never verifies retention', async () => {
  for (const reply of [new Response('down', { status: 503 }), new Response('redirect', { status: 302 }),
    new Response('{}'), new Response('x'.repeat(2_000_001)), new Response('not json')]) {
    await assert.rejects(run({ fetcher: async (url) => url.endsWith('/api/health')
      ? new Response(JSON.stringify(healthy()), { status: 503 }) : reply }), /source snapshot differs/);
  }
});

test('a recovery verifies from ready individual checks without downloading a retained snapshot', async () => {
  const health = healthy(); health.feeds.nextgen.status = 'ready';
  let calls = 0;
  const result = await run({ fetcher: async () => { calls++; return new Response(JSON.stringify(health), { status: 503 }); } });
  assert.equal(calls, 1);
  assert.deepEqual(result.degradedFeeds, []);
});

test('the same successful retained check cannot lose or change its verified measurement payload', async () => {
  const publication = structuredClone(expected);
  const player = { id: '00-0030565', name: 'Quarterback', team: 'NYJ', position: 'QB', sample: 10, sampleLabel: 'pass attempts', metrics: [] };
  publication.nextgen.seasons[0].passing = [player];
  for (const passing of [[], [{ ...player, sample: 9 }]]) {
    const ngs = collection(later); ngs.seasons[0].passing = passing;
    await assert.rejects(run({ publication, ngs }), /source snapshot differs/);
  }
  const ngs = collection(later); ngs.seasons[0].passing = [player];
  assert.equal((await run({ publication, ngs })).status, 'degraded');
  ngs.seasons[0].checkedAt = earlier.replace('.000Z', 'Z'); ngs.seasons[0].passing = [{ ...player, sample: 9 }];
  await assert.rejects(run({ publication, ngs }), /source snapshot differs/);
  ngs.seasons[0].checkedAt = checkedAt; ngs.seasons[0].passing = [];
  await assert.rejects(run({ publication, ngs }), /source snapshot differs/);
});

test('an equal runtime collection clock still proves current readiness and known-only historical gaps', async () => {
  const health = healthy(); health.feeds.nextgen.checkedAt = checkedAt;
  const ngs = collection(); ngs.seasons[1].status = 'retained'; ngs.seasons[1].retentionReason = 'Current source failed.';
  await assert.rejects(run({ health, ngs }), /source snapshot differs/);
  assert.equal((await run({ health, ngs: collection() })).status, 'degraded');
});

test('an exact compiled snapshot can be newer than a still-fresh runtime publication', async () => {
  const publication = { ...expected, feeds: { analysis: later, rankings: later, nextgen: later }, nextgen: collection(later) };
  const health = healthy(); health.analysisScheduler.updatedAt = '2026-09-30T12:05:00.000Z';
  assert.equal((await run({ health, publication })).status, 'degraded');
  health.feeds.nextgen.status = 'ready';
  assert.equal((await run({ health, publication })).status, 'degraded');
});
