import test from 'node:test';
import assert from 'node:assert/strict';
import { publicSiteOrigin, verifyPublishedData } from './verify-published-data.mjs';

const expected = { season: 2026, checkedAt: '2026-09-30T12:00:00.000Z' };
const healthy = (edition = expected) => ({ ...edition, status: 'healthy',
  feeds: Object.fromEntries(['results', 'news', 'roster', 'stats', 'analysis'].map((name) => [name, { status: 'ready', checkedAt: edition.checkedAt }])) });
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const options = { origin: 'https://jets-fan.example', expected, intervalMs: 0 };

test('deployment verification waits through an old deployment and missing health route for the exact edition', async () => {
  const replies = [response(healthy({ ...expected, checkedAt: '2026-09-29T12:00:00.000Z' })), new Response('Not found', { status: 404 }), response(healthy())];
  const requests = [], pauses = [], attempts = [];
  const result = await verifyPublishedData({ ...options, attempts: 3,
    fetcher: async (url, init) => { requests.push({ url, init }); return replies.shift(); },
    pause: async (ms) => pauses.push(ms), onAttempt: (value) => attempts.push(value),
  });
  assert.equal(result.attempts, 3);
  assert.equal(result.checkedAt, expected.checkedAt);
  assert.deepEqual(result.degradedFeeds, []);
  assert.equal(pauses.length, 2);
  assert.equal(attempts.length, 2);
  assert.equal(requests[0].url, 'https://jets-fan.example/api/health');
  assert.equal(requests[0].init.cache, 'no-store');
  assert.equal(requests[0].init.redirect, 'error');
  assert.equal(requests[0].init.credentials, 'omit');
});

test('a permanently healthy old edition fails instead of falsely reporting publication success', async () => {
  let calls = 0, pauses = 0;
  await assert.rejects(verifyPublishedData({ ...options, attempts: 3,
    fetcher: async () => { calls++; return response(healthy({ ...expected, season: 2025 })); }, pause: async () => pauses++,
  }), /after 3 attempts: deployed edition differs/);
  assert.equal(calls, 3);
  assert.equal(pauses, 2);
});

test('the exact deployed edition with retained analysis is accepted and reports the degraded source', async () => {
  const health = healthy();
  health.status = 'degraded';
  health.feeds.analysis = { status: 'retained', checkedAt: '2026-09-29T12:00:00.000Z' };
  const result = await verifyPublishedData({ ...options, attempts: 1, fetcher: async () => response(health, 503) });
  assert.equal(result.status, 'degraded');
  assert.deepEqual(result.degradedFeeds, [{ name: 'analysis', status: 'retained' }]);
});

test('matching top-level edition cannot conceal stale or inconsistent results', async () => {
  for (const resultFeed of [{ status: 'overdue', checkedAt: expected.checkedAt }, { status: 'ready', checkedAt: '2026-09-29T12:00:00.000Z' }]) {
    const health = healthy();
    health.status = 'degraded'; health.feeds.results = resultFeed;
    await assert.rejects(verifyPublishedData({ ...options, attempts: 1, fetcher: async () => response(health, 503) }), /unavailable or overdue results/);
  }
});

test('invalid health JSON, missing feeds and incorrect health statuses never verify', async () => {
  const fixtures = [null, { ...expected, status: 'healthy' }, { ...healthy(), season: '2026' }, { ...healthy(), status: 'anything' }];
  for (const fixture of fixtures) {
    await assert.rejects(verifyPublishedData({ ...options, attempts: 1, fetcher: async () => response(fixture) }), /invalid health response/);
  }
  const invalidFeed = healthy(); invalidFeed.feeds.news.checkedAt = '2026-02-30T12:00:00.000Z';
  await assert.rejects(verifyPublishedData({ ...options, attempts: 1, fetcher: async () => response(invalidFeed) }), /invalid health response/);
  const misleadingHealth = healthy(); misleadingHealth.feeds.analysis = { status: 'retained', checkedAt: null };
  await assert.rejects(verifyPublishedData({ ...options, attempts: 1, fetcher: async () => response(misleadingHealth) }), /invalid health response/);
  await assert.rejects(verifyPublishedData({ ...options, attempts: 1, fetcher: async () => new Response('<html>login page</html>') }), /invalid health response/);
  await assert.rejects(verifyPublishedData({ ...options, attempts: 1, fetcher: async () => { throw new Error('secret upstream auth detail'); } }), (error) =>
    /health endpoint unavailable/.test(error.message) && !/secret/.test(error.message));
});

test('public origin validation rejects insecure or secret-bearing URLs without echoing them', () => {
  for (const url of ['not an origin', 'http://jets-fan.example', 'https://user:secret@jets-fan.example', 'https://jets-fan.example/api/health', 'https://jets-fan.example?secret=token', 'https://jets-fan.example#token']) {
    assert.throws(() => publicSiteOrigin(url), (error) => /PUBLIC_SITE_URL/.test(error.message) && !/secret|token/.test(error.message));
  }
  assert.equal(publicSiteOrigin('https://jets-fan.example/'), 'https://jets-fan.example');
  assert.throws(() => publicSiteOrigin('http://127.0.0.1:3108'), /HTTPS origin/);
  assert.equal(publicSiteOrigin('http://127.0.0.1:3108', { allowLoopback: true }), 'http://127.0.0.1:3108');
  assert.throws(() => publicSiteOrigin('http://jets-fan.example', { allowLoopback: true }), /HTTPS origin/);
});

test('loopback health checks require explicit test opt-in and still match the exact edition', async () => {
  const result = await verifyPublishedData({ ...options, origin: 'http://localhost:3108', allowLoopback: true, attempts: 1, fetcher: async () => response(healthy()) });
  assert.equal(result.checkedAt, expected.checkedAt);
  await assert.rejects(verifyPublishedData({ ...options, expected: { season: 2026, checkedAt: 'yesterday' } }), /valid season and checkedAt/);
  await assert.rejects(verifyPublishedData({ ...options, attempts: 100 }), /bounded limits/);
});
