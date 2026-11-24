import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';

const origin = 'https://ajetsfan.com';
const feeds = ['results', 'news', 'roster', 'stats', 'analysis', 'media', 'rankings', 'nextgen', 'trades', 'history', 'drives'];
const minute = 60_000;
const tradeOverdueMinutes = 36 * 60; // Matches editionHealth's daily archive threshold.
const schedulerLimits = { footballScheduler: 10, mediaScheduler: 30, analysisScheduler: 25 };
const feedStatuses = new Set(['ready', 'retained', 'unavailable', 'overdue', 'unknown']);
const pages = [
  ['/', [
    ['season results landmark', /<section\b[^>]*\sid="season"/i],
    ['regular-season week list', /<ol\b[^>]*\saria-label="Regular season by week"/i],
  ]],
  ['/team/news', [
    ['team news landmark', /<section\b[^>]*\sid="news-desk"/i],
    ['official Jets article link', /<a\b[^>]*\shref="https:\/\/(?:www\.)?newyorkjets\.com\/news\/[^"#?]+"/i],
  ]],
  ['/media', [
    ['Media Room collection', /<section\b[^>]*\sid="collection"/i],
    ['media search control', /<input\b[^>]*\sdata-media-search="true"/i],
    ['rendered publisher story', /<section\b[^>]*\sdata-media-group="(?:video|audio|article)"[^>]*>(?:(?!<\/section>)[^])*?<li\b[^>]*\sdata-media-card="[^"]+"[^>]*>(?:(?!<\/li>)[^])*?<strong\b[^>]*>\s*[^<\s]/i],
  ]],
];

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonicalClock = (value) => value.length === 20 ? value.replace('Z', '.000Z') : value;
const validClock = (value, now) => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
  && Date.parse(value) <= now + 5 * minute && new Date(value).toISOString() === canonicalClock(value);
const label = (value) => typeof value === 'string' && /^[a-z0-9-]+$/.test(value) ? value : 'missing or invalid';

function productionRequest(fetcher, path, accept) {
  return fetcher(origin + path, {
    cache: 'no-store', credentials: 'omit', redirect: 'error',
    headers: { Accept: accept, 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(15_000),
  });
}

async function checkPage(request, path, landmarks) {
  const response = await request(path, 'text/html');
  if (response.status !== 200) return { path, issues: [`HTTP ${response.status}`] };
  if (!response.headers.get('content-type')?.startsWith('text/html')) return { path, issues: ['Expected an HTML page'] };
  const html = (await response.text()).replace(/<!--[^]*?-->|<(script|template)\b[^>]*>[^]*?<\/\1>/gi, '');
  const issues = landmarks.filter(([, pattern]) => !pattern.test(html)).map(([name]) => `Missing ${name}`);
  return { path, issues };
}

async function readHealth(request) {
  const response = await request('/api/health', 'application/json');
  const text = await response.text();
  let health;
  try { health = JSON.parse(text); } catch { /* A proxy failure can return plain text or HTML. */ }
  return { response, health, text };
}

function tradeArchiveIncident(response, health, now) {
  if (response.status !== 503 || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')
      || !record(health) || health.status !== 'degraded' || !validClock(health.checkedAt, now)
      || !Number.isInteger(health.season) || health.season < 1999 || health.season > new Date(now).getUTCFullYear() + 1
      || !record(health.feeds) || !feeds.every((name) => record(health.feeds[name]) && feedStatuses.has(health.feeds[name].status))
      || !record(health.mediaSources) || !Object.keys(health.mediaSources).length
      || !Object.keys(schedulerLimits).every((name) => record(health[name]))) return undefined;

  const trades = health.feeds.trades;
  if (trades.status !== 'overdue' || !validClock(trades.checkedAt, now)) return undefined;
  const checkedAt = Date.parse(trades.checkedAt);
  const ageMinutes = Math.floor((now - checkedAt) / minute);
  if (ageMinutes < tradeOverdueMinutes || !Number.isInteger(trades.ageMinutes)
      || trades.ageMinutes < tradeOverdueMinutes || Math.abs(ageMinutes - trades.ageMinutes) > 5) return undefined;
  return {
    id: canonicalClock(trades.checkedAt).replace(/[-:.]/g, ''),
    overdueSince: checkedAt + tradeOverdueMinutes * minute,
  };
}

export async function readTradeArchiveIncident({ fetcher = fetch, now = Date.now } = {}) {
  const { response, health } = await readHealth((path, accept) => productionRequest(fetcher, path, accept));
  return tradeArchiveIncident(response, health, now());
}

async function checkHealth(request, now) {
  const path = '/api/health';
  const { response, health, text } = await readHealth(request);
  const issues = response.status === 200 ? [] : [`HTTP ${response.status}`];
  const diagnostic = response.status === 503 ? (health ? JSON.stringify(health, null, 2) : text).slice(0, 12_000) : undefined;
  if (!record(health)) return { path, issues: [...issues, 'Expected a health JSON object'], diagnostic };
  if (health.status !== 'healthy') issues.push(`Site health is ${label(health.status)}`);
  if (!Number.isInteger(health.season) || health.season < 1999) issues.push('Missing or invalid season');
  if (!validClock(health.checkedAt, now)) issues.push('Missing or invalid edition check time');

  for (const [name, minutes] of Object.entries(schedulerLimits)) {
    const scheduler = health[name];
    const football = name === 'footballScheduler';
    const limit = football && scheduler?.active === true ? 3 : minutes;
    if (scheduler?.mode !== 'runtime' || scheduler?.status !== 'ready') {
      issues.push(`${name}: mode ${label(scheduler?.mode)}, status ${label(scheduler?.status)}`);
    } else {
      if (football && typeof scheduler.active !== 'boolean') issues.push(`${name}: missing active-game state`);
      if (!validClock(scheduler.updatedAt, now)) issues.push(`${name}: missing or invalid completion time`);
      else if (now - Date.parse(scheduler.updatedAt) >= limit * minute) {
        issues.push(`${name}: last completion is ${limit} minutes old or older`);
      }
    }
  }
  const groups = [
    ['feed', record(health.feeds) ? health.feeds : {}, feeds],
    ['media source', record(health.mediaSources) ? health.mediaSources : {}, []],
  ];
  if (!Object.keys(groups[1][1]).length) issues.push('Missing media source checks');
  for (const [group, entries, required] of groups) {
    for (const name of new Set([...required, ...Object.keys(entries)])) {
      const feed = entries[name];
      const key = `${group} ${label(name)}`;
      if (feed?.status !== 'ready') issues.push(`${key}: ${label(feed?.status)}`);
      else if (!validClock(feed.checkedAt, now)) issues.push(`${key}: missing or invalid successful check time`);
    }
  }
  return { path, issues, diagnostic, archiveIncident: tradeArchiveIncident(response, health, now)?.id };
}

export async function checkSite({ fetcher = fetch, now = Date.now, sleep = pause } = {}) {
  const request = (path, accept) => productionRequest(fetcher, path, accept);
  const checks = [...pages.map(([path, landmarks]) => [path, () => checkPage(request, path, landmarks)]),
    ['/api/health', () => checkHealth(request, now())]];
  return Promise.all(checks.map(async ([path, check]) => {
    const attempt = async () => {
      try { return await check(); }
      catch { return { path, issues: ['Request failed, redirected, or timed out'] }; }
    };
    const result = await attempt();
    if (!result.issues.length) return result;
    await sleep(5_000);
    const retry = await attempt();
    if (retry.archiveIncident !== result.archiveIncident) delete retry.archiveIncident;
    return retry;
  }));
}

export function formatReport(results) {
  return ['## ajetsfan.com production health', '', ...results.flatMap(({ path, issues, diagnostic }) => [
    `- **\`${path}\`** ${issues.length ? 'failed' : 'passed'}`,
    ...issues.map((issue) => `  - ${issue}`),
    ...(diagnostic ? ['', '~~~text', diagnostic.replaceAll('~~~', '~ ~ ~'), '~~~', ''] : []),
  ]), ''].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const results = await checkSite();
  const report = formatReport(results);
  if (process.env.GITHUB_STEP_SUMMARY) {
    // Keep response bodies in the summary, outside the runner's workflow command stream.
    console.log(formatReport(results.map(({ path, issues }) => ({ path, issues }))));
    await appendFile(process.env.GITHUB_STEP_SUMMARY, report);
  } else {
    console.log(report);
  }
  const incident = results.find(({ archiveIncident }) => archiveIncident)?.archiveIncident;
  if (incident && process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `archive_incident=${incident}\n`);
  }
  if (results.some(({ issues }) => issues.length)) process.exitCode = 1;
}
