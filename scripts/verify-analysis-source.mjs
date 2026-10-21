import { isNextGenCollection } from '../src/lib/nextgen-stats.ts';
import { isDeepStrictEqual } from 'node:util';

const MAX_SNAPSHOT_BYTES = 2_000_000;
const ANALYSIS_OVERDUE_MS = 25 * 60_000;
const timestamp = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z');
const atLeast = (actual, minimum) => timestamp(actual) && timestamp(minimum) && Date.parse(actual) >= Date.parse(minimum);
const atMost = (actual, maximum) => atLeast(maximum, actual);

/** The health route marks an analysis publication overdue after 25 minutes. */
export function freshAnalysisScheduler(scheduler, now) {
  const age = now - Date.parse(scheduler?.updatedAt);
  return scheduler?.mode === 'runtime' && ['ready', 'degraded'].includes(scheduler.status) && timestamp(scheduler.updatedAt)
    && Number.isFinite(age) && age >= 0 && age < ANALYSIS_OVERDUE_MS;
}

async function snapshot(response) {
  if (response.status !== 200 || !response.body) return null;
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SNAPSHOT_BYTES) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** A newer collection clock alone cannot prove that a retained historical season is safe. */
export async function verifiedRetainedNextGen({ expected, health, scheduler, site, fetcher, timeoutMs }) {
  try {
    if (!isNextGenCollection(expected) || !expected.seasons.length || expected.status !== 'retained') return false;
    const response = await fetcher(`${site}/data/nextgen-stats.json`, { cache: 'no-store', redirect: 'error', credentials: 'omit',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(timeoutMs) });
    const actual = await snapshot(response);
    // A loader may select the exact newer compiled snapshot over an older runtime check.
    const ceiling = (baseline) => Date.parse(baseline) > Date.parse(scheduler.updatedAt) ? baseline : scheduler.updatedAt;
    if (!isNextGenCollection(actual) || actual.status !== 'retained' || actual.checkedAt !== health.checkedAt
      || !atLeast(actual.checkedAt, expected.checkedAt) || !atMost(actual.checkedAt, ceiling(expected.checkedAt))
      || !atMost(actual.attemptedAt ?? actual.checkedAt, ceiling(expected.attemptedAt ?? expected.checkedAt))
      || !['passing', 'receiving', 'rushing'].every((kind) => actual.sources[kind] === expected.sources[kind])) return false;
    const baseline = new Map(expected.seasons.map((season) => [season.year, season]));
    if (!expected.seasons.every((season) => actual.seasons.some((entry) => entry.year === season.year))) return false;
    if (!actual.seasons.some((season) => season.year === health.season && season.status === 'ready')) return false;
    if (!actual.seasons.some((season) => season.year < health.season && season.status === 'retained')) return false;
    return actual.seasons.every((season) => {
      const previous = baseline.get(season.year);
      if (!timestamp(season.checkedAt) || !timestamp(season.attemptedAt)
        || !atMost(season.checkedAt, ceiling(previous?.checkedAt)) || !atMost(season.attemptedAt, ceiling(previous?.attemptedAt))
        || previous && !atLeast(season.checkedAt, previous.checkedAt ?? expected.checkedAt)) return false;
      const measurements = ['passing', 'receiving', 'rushing', 'notes'];
      if (previous && measurements.slice(0, 3).some((kind) => previous[kind].length && !season[kind].length)) return false;
      if (season.status === 'ready') return true;
      if (previous && Date.parse(season.checkedAt) === Date.parse(previous.checkedAt ?? expected.checkedAt)
        && !measurements.every((kind) => isDeepStrictEqual(season[kind], previous[kind]))) return false;
      return season.year < health.season && previous?.status === 'retained'
        && typeof previous.retentionReason === 'string' && previous.retentionReason.trim().length > 0
        && typeof season.retentionReason === 'string' && season.retentionReason.trim().length > 0
        && atLeast(season.attemptedAt, previous.attemptedAt);
    });
  } catch {
    // Public JSON, timeouts and redirects all fail closed without printing source data.
    return false;
  }
}
