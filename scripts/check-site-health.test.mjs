import assert from 'node:assert/strict';
import test from 'node:test';
import { checkSite, formatReport } from './check-site-health.mjs';

const now = () => Date.parse('2026-11-24T17:45:00Z');
const checkedAt = '2026-11-24T17:40:00Z';
const ready = { status: 'ready', checkedAt };
const scheduler = { mode: 'runtime', status: 'ready', updatedAt: checkedAt };
const pages = {
  '/': '<main><section id="season"><ol aria-label="Regular season by week"><li>Week 1</li></ol></section></main>',
  '/team/news': '<main><section id="news-desk"><a href="https://www.newyorkjets.com/news/a-story">Jets story</a></section></main>',
  '/media': '<main><section id="collection"><input data-media-search="true"><section data-media-group="audio"><ul><li data-media-card="episode"><strong>A podcast</strong></li></ul></section></section></main>',
};

function healthyEdition() {
  return {
    status: 'healthy', season: 2026, checkedAt,
    feeds: Object.fromEntries(['results', 'news', 'roster', 'stats', 'analysis', 'media', 'rankings', 'nextgen',
      'trades', 'history', 'drives'].map((name) => [name, { ...ready }])),
    mediaSources: { 'a-publisher': { ...ready } },
    footballScheduler: { ...scheduler, active: false },
    mediaScheduler: { ...scheduler },
    analysisScheduler: { ...scheduler },
  };
}

function overdueArchive() {
  const health = healthyEdition();
  health.status = 'degraded';
  health.feeds.trades = { status: 'overdue', checkedAt: '2026-11-23T05:45:00Z', ageMinutes: 2160 };
  return health;
}

function fixture({ health = healthyEdition(), healthStatus = 200, overrides = {} } = {}) {
  const requests = [];
  const delays = [];
  const result = checkSite({
    now,
    sleep: async (ms) => { delays.push(ms); },
    fetcher: async (url) => {
      const path = new URL(url).pathname;
      requests.push(path);
      if (overrides[path]) return overrides[path]();
      if (path === '/api/health') return Response.json(health, { status: healthStatus });
      return new Response(pages[path], { headers: { 'content-type': 'text/html' } });
    },
  });
  return { result, requests, delays };
}

test('checks the real production routes and accepts ready feeds with valid check timestamps', async () => {
  const { result, requests, delays } = fixture();
  assert.deepEqual((await result).map(({ issues }) => issues), [[], [], [], []]);
  assert.deepEqual(requests, ['/', '/team/news', '/media', '/api/health']);
  assert.deepEqual(delays, []);
});

test('fails for unavailable pages and retries their requests once', async () => {
  const { result, requests, delays } = fixture({
    overrides: { '/': () => new Response(pages['/'], { status: 503, headers: { 'content-type': 'text/html' } }) },
  });
  assert.deepEqual((await result)[0].issues, ['HTTP 503']);
  assert.equal(requests.filter((path) => path === '/').length, 2);
  assert.deepEqual(delays, [5000]);
});

test('accepts a transient failure after the bounded retry', async () => {
  let attempts = 0;
  const { result } = fixture({
    overrides: { '/media': () => ++attempts === 1 ? new Response('', { status: 502 })
      : new Response(pages['/media'], { headers: { 'content-type': 'text/html' } }) },
  });
  assert.deepEqual((await result)[2].issues, []);
  assert.equal(attempts, 2);
});

test('rejects a generic app shell with page content present only in a script or template', async () => {
  const shell = (path) => () => new Response(`<nav>Team News · Media Room</nav><script>${pages[path]}</script><template>${pages[path]}</template>`,
    { headers: { 'content-type': 'text/html' } });
  const { result } = fixture({ overrides: Object.fromEntries(Object.keys(pages).map((path) => [path, shell(path)])) });
  assert.deepEqual((await result).slice(0, 3).map(({ issues }) => issues.length), [2, 2, 3]);
});

test('reports a retained feed, a retained publisher, a missing feed and a scheduler fallback by name', async () => {
  const health = healthyEdition();
  health.feeds.roster.status = 'retained';
  delete health.feeds.drives;
  health.mediaSources['a-publisher'].status = 'retained';
  health.analysisScheduler = { mode: 'fallback', status: 'unavailable' };
  const { result } = fixture({ health });
  assert.deepEqual((await result).at(-1).issues, [
    'analysisScheduler: mode fallback, status unavailable',
    'feed roster: retained',
    'feed drives: missing or invalid',
    'media source a-publisher: retained',
  ]);
});

test('includes the 503 diagnostic body alongside the specific overdue trade feed', async () => {
  const health = overdueArchive();
  const { result, delays } = fixture({ health, healthStatus: 503 });
  const results = await result;
  assert.deepEqual(results.at(-1).issues, ['HTTP 503', 'Site health is degraded', 'feed trades: overdue']);
  assert.equal(results.at(-1).archiveIncident, '20261123T054500000Z');
  const report = formatReport(results);
  assert.match(report, /feed trades: overdue/);
  assert.match(report, /"trades": \{\s+"status": "overdue"/);
  assert.deepEqual(delays, [5000]);
});

test('only diagnoses an overdue archive from complete, corroborated health JSON', async () => {
  const fixtures = [
    { health: { status: 'unavailable', season: null, checkedAt: null }, healthStatus: 503 },
    { health: overdueArchive(), healthStatus: 200 },
    { health: overdueArchive(), healthStatus: 502 },
    { overrides: { '/api/health': () => new Response(JSON.stringify(overdueArchive()), { status: 503 }) } },
    { overrides: { '/api/health': () => new Response('Upstream unavailable', { status: 503 }) } },
    { health: { ...overdueArchive(), mediaSources: undefined }, healthStatus: 503 },
  ];
  for (const trades of [
    { status: 'overdue', checkedAt: null, ageMinutes: 2160 },
    { status: 'overdue', checkedAt: '2026-11-23T05:45:00Z' },
    { status: 'overdue', checkedAt: '2026-10-32T05:45:00Z', ageMinutes: 34_000 },
    { status: 'overdue', checkedAt: '2026-11-23T05:45:00Z', ageMinutes: 2000 },
    { status: 'overdue', checkedAt: '2026-11-23T05:45:01Z', ageMinutes: 2160 },
    { status: 'overdue', checkedAt: '2026-11-25T06:45:00Z', ageMinutes: 2160 },
    { status: 'retained', checkedAt: '2026-11-23T05:45:00Z', ageMinutes: 2160 },
  ]) {
    const health = overdueArchive();
    health.feeds.trades = trades;
    fixtures.push({ health, healthStatus: 503 });
  }
  for (const options of fixtures) {
    const { result } = fixture(options);
    const health = (await result).at(-1);
    assert.equal(health.archiveIncident, undefined, JSON.stringify(options.health));
    assert.notEqual(health.issues.length, 0);
  }
});

test('requires both probes to agree on the archive timestamp', async () => {
  const earlier = overdueArchive();
  earlier.feeds.trades = { status: 'overdue', checkedAt: '2026-11-23T00:00:00Z', ageMinutes: 2505 };
  const variants = [
    [overdueArchive(), earlier],
    [overdueArchive(), { status: 'unavailable' }],
    [{ status: 'unavailable' }, overdueArchive()],
  ];
  for (const health of variants) {
    const { result } = fixture({
      overrides: { '/api/health': () => Response.json(health.shift(), { status: 503 }) },
    });
    assert.equal((await result).at(-1).archiveIncident, undefined);
  }

  const newSeason = overdueArchive();
  newSeason.season = 2027;
  newSeason.feeds.trades.checkedAt = '2026-11-23T05:45:00.000Z';
  const sameArchive = [overdueArchive(), newSeason];
  const { result } = fixture({
    overrides: { '/api/health': () => Response.json(sameArchive.shift(), { status: 503 }) },
  });
  assert.equal((await result).at(-1).archiveIncident, '20261123T054500000Z');
});

test('rejects unverified clocks and a missing publisher list even with a healthy HTTP response', async () => {
  const health = healthyEdition();
  health.feeds.news.checkedAt = 'tomorrow';
  health.footballScheduler.updatedAt = null;
  health.mediaSources = {};
  const { result } = fixture({ health });
  assert.deepEqual((await result).at(-1).issues, [
    'footballScheduler: missing or invalid completion time',
    'Missing media source checks',
    'feed news: missing or invalid successful check time',
  ]);
});

test('rejects stale ready scheduler timestamps including the shorter active-game window', async () => {
  const health = healthyEdition();
  health.footballScheduler.active = true;
  health.mediaScheduler.updatedAt = '2026-11-24T17:15:00Z';
  health.analysisScheduler.updatedAt = '2026-11-24T17:20:00Z';
  const { result } = fixture({ health });
  assert.deepEqual((await result).at(-1).issues, [
    'footballScheduler: last completion is 3 minutes old or older',
    'mediaScheduler: last completion is 30 minutes old or older',
    'analysisScheduler: last completion is 25 minutes old or older',
  ]);
});
