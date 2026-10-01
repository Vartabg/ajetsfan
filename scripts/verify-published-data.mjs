import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const FEEDS = ['results', 'news', 'roster', 'stats', 'analysis'];
const FEED_STATES = new Set(['ready', 'retained', 'unavailable', 'overdue', 'unknown']);
const HEALTH_STATES = new Set(['healthy', 'degraded', 'unavailable']);
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const timestamp = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z');

export class DeploymentVerificationError extends Error {}

export function publicSiteOrigin(value, { allowLoopback = false } = {}) {
  let url;
  try { url = new URL(value); }
  catch { throw new DeploymentVerificationError('PUBLIC_SITE_URL must be a valid HTTPS origin.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(allowLoopback && loopback && url.protocol === 'http:')) ||
    url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new DeploymentVerificationError('PUBLIC_SITE_URL must be an HTTPS origin without credentials, a path, query, or fragment.');
  }
  return url.origin;
}

function validHealth(value, status) {
  if (!record(value) || !Number.isInteger(value.season) || value.season < 1999 || value.season > 2200 ||
    !timestamp(value.checkedAt) || !HEALTH_STATES.has(value.status) || !record(value.feeds)) return false;
  if ((status === 200) !== (value.status === 'healthy')) return false;
  const feedsValid = FEEDS.every((name) => {
    const feed = value.feeds[name];
    return record(feed) && FEED_STATES.has(feed.status) && (feed.checkedAt === null || timestamp(feed.checkedAt)) &&
      (!['ready', 'overdue'].includes(feed.status) || timestamp(feed.checkedAt));
  });
  return feedsValid && (value.status !== 'healthy' || FEEDS.every((name) => value.feeds[name].status === 'ready'));
}

/** Match the exact publication, rather than mistaking a healthy older deployment for success. */
export async function verifyPublishedData({
  origin, expected, fetcher = fetch, pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  attempts = 16, intervalMs = 15_000, timeoutMs = 10_000, allowLoopback = false, onAttempt = () => {},
}) {
  const site = publicSiteOrigin(origin, { allowLoopback });
  if (!record(expected) || !Number.isInteger(expected.season) || expected.season < 1999 || expected.season > 2200 || !timestamp(expected.checkedAt)) {
    throw new DeploymentVerificationError('The local publication must include a valid season and checkedAt.');
  }
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 30 || !Number.isInteger(intervalMs) || intervalMs < 0 || intervalMs > 30_000 ||
    !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new DeploymentVerificationError('Deployment verification retry settings are outside their bounded limits.');
  }
  let issue = 'health endpoint unavailable';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let response, health;
    try {
      response = await fetcher(`${site}/api/health`, {
        cache: 'no-store', redirect: 'error', credentials: 'omit',
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (![200, 503].includes(response.status)) issue = 'health endpoint unavailable';
      else {
        try {
          health = await response.json();
          issue = validHealth(health, response.status) ? 'deployed edition differs from the local publication' : 'invalid health response';
        } catch { issue = 'invalid health response'; }
      }
    } catch { issue = 'health endpoint unavailable'; }
    if (health && validHealth(health, response.status) && health.season === expected.season && health.checkedAt === expected.checkedAt) {
      if (health.feeds.results.status === 'ready' && health.feeds.results.checkedAt === expected.checkedAt) {
        return { attempts: attempt, season: health.season, checkedAt: health.checkedAt, status: health.status,
          degradedFeeds: FEEDS.filter((name) => health.feeds[name].status !== 'ready').map((name) => ({ name, status: health.feeds[name].status })) };
      }
      issue = 'the expected edition has unavailable or overdue results';
    }
    onAttempt({ attempt, attempts, issue });
    if (attempt < attempts) await pause(intervalMs);
  }
  throw new DeploymentVerificationError(`Published edition could not be verified after ${attempts} attempts: ${issue}.`);
}

async function main() {
  const { values } = parseArgs({ options: { origin: { type: 'string' } }, allowPositionals: false });
  const expected = JSON.parse(await readFile(path.join(process.cwd(), 'public', 'data', 'current.json'), 'utf8'));
  const result = await verifyPublishedData({ origin: values.origin, expected,
    onAttempt: ({ attempt, attempts, issue }) => console.log(`Deployment check ${attempt}/${attempts}: ${issue}.`),
  });
  const sourceHealth = result.degradedFeeds.length
    ? `Source health is degraded: ${result.degradedFeeds.map(({ name, status }) => `${name} ${status}`).join(', ')}.`
    : 'All source checks are ready.';
  const message = `Published ${result.season} edition verified at ${result.checkedAt}. ${sourceHealth}`;
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof DeploymentVerificationError ? error.message : 'Deployment verification failed: could not read the local publication or run the check.');
    process.exitCode = 1;
  });
}
